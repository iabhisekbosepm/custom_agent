import { z } from "zod";
import type { Tool, ToolResult, ToolUseContext } from "../Tool.js";
import { truncateOutput } from "../shared/utils.js";

const LSPInput = z.object({
  file_path: z
    .string()
    .optional()
    .describe("Specific file to check diagnostics for (default: project root)"),
  command: z
    .enum(["tsc", "eslint"])
    .optional()
    .describe("Diagnostic command to run (default: tsc)"),
});

type LSPInput = z.infer<typeof LSPInput>;

export const LSPTool: Tool<LSPInput> = {
  name: "lsp_diagnostics",
  description:
    "Run TypeScript (tsc) or ESLint diagnostics and return structured error/warning output. Useful for checking code correctness.",
  parameters: LSPInput,
  isReadOnly: true,

  async call(input: LSPInput, _context: ToolUseContext): Promise<ToolResult> {
    try {
      const command = input.command ?? "tsc";
      let args: string[];

      if (command === "tsc") {
        args = ["bun", "x", "tsc", "--noEmit", "--pretty"];
        if (input.file_path) {
          args.push(input.file_path);
        }
      } else {
        args = ["bun", "x", "eslint", "--format", "stylish"];
        if (input.file_path) {
          args.push(input.file_path);
        } else {
          args.push(".");
        }
      }

      const proc = Bun.spawn(args, {
        stdout: "pipe",
        stderr: "pipe",
        cwd: process.cwd(),
      });

      const timeout = new Promise<"timeout">((resolve) =>
        setTimeout(() => resolve("timeout"), 30_000)
      );
      const completion = proc.exited.then(() => "done" as const);
      const race = await Promise.race([completion, timeout]);

      if (race === "timeout") {
        proc.kill();
        return {
          content: "Diagnostics timed out after 30 seconds.",
          isError: true,
        };
      }

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();

      const output = (stdout + "\n" + stderr).trim();

      if (proc.exitCode === 0) {
        return { content: output || "No diagnostics found — all clean." };
      }

      return { content: truncateOutput(output, 30_000) };
    } catch (err) {
      return {
        content: `Diagnostics failed: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  },
};
