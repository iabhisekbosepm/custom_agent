import { z } from "zod";
import type { Tool, ToolResult, ToolUseContext } from "../Tool.js";
import { truncateOutput } from "../shared/utils.js";

const REPLInput = z.object({
  code: z.string().describe("Code snippet to execute"),
  language: z
    .enum(["javascript", "typescript", "python"])
    .optional()
    .describe("Language to execute (default: typescript)"),
});

type REPLInput = z.infer<typeof REPLInput>;

export const REPLTool: Tool<REPLInput> = {
  name: "repl",
  description:
    "Execute a code snippet in a subprocess and return stdout/stderr. Supports TypeScript (via bun), JavaScript (via node), and Python. 15-second timeout.",
  parameters: REPLInput,
  isReadOnly: false,

  async call(input: REPLInput, _context: ToolUseContext): Promise<ToolResult> {
    const language = input.language ?? "typescript";

    try {
      let cmd: string[];
      if (language === "typescript") {
        cmd = ["bun", "eval", input.code];
      } else if (language === "javascript") {
        cmd = ["node", "-e", input.code];
      } else {
        cmd = ["python3", "-c", input.code];
      }

      const proc = Bun.spawn(cmd, {
        stdout: "pipe",
        stderr: "pipe",
        cwd: process.cwd(),
      });

      const timeout = new Promise<"timeout">((resolve) =>
        setTimeout(() => resolve("timeout"), 15_000)
      );
      const completion = proc.exited.then(() => "done" as const);
      const race = await Promise.race([completion, timeout]);

      if (race === "timeout") {
        proc.kill();
        return {
          content: "Code execution timed out after 15 seconds.",
          isError: true,
        };
      }

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();

      const parts: string[] = [];
      if (stdout.trim()) parts.push(`stdout:\n${stdout.trim()}`);
      if (stderr.trim()) parts.push(`stderr:\n${stderr.trim()}`);

      if (parts.length === 0) {
        parts.push("(no output)");
      }

      const output = parts.join("\n\n");
      const exitInfo = `\nExit code: ${proc.exitCode}`;

      return {
        content: truncateOutput(output + exitInfo, 30_000),
        isError: proc.exitCode !== 0,
      };
    } catch (err) {
      return {
        content: `Code execution failed: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  },
};
