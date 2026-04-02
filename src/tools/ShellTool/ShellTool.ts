import { z } from "zod";
import type { Tool, ToolResult, ToolUseContext } from "../Tool.js";

const ShellInput = z.object({
  command: z.string().describe("The shell command to execute"),
  timeout: z
    .number()
    .int()
    .positive()
    .optional()
    .default(30_000)
    .describe("Timeout in milliseconds (default: 30000)"),
});

type ShellInput = z.infer<typeof ShellInput>;

export const ShellTool: Tool<ShellInput> = {
  name: "shell",
  description:
    "Execute a shell command and return stdout and stderr. Use for running CLI tools, git, build commands, etc.",
  parameters: ShellInput,
  isReadOnly: false,

  async call(input: ShellInput, context: ToolUseContext): Promise<ToolResult> {
    try {
      const proc = Bun.spawn(["bash", "-c", input.command], {
        stdout: "pipe",
        stderr: "pipe",
        env: process.env,
      });

      // Race between process completion and timeout
      const timeout = new Promise<"timeout">((resolve) =>
        setTimeout(() => resolve("timeout"), input.timeout)
      );

      const completion = proc.exited.then(() => "done" as const);

      const result = await Promise.race([completion, timeout]);

      if (result === "timeout") {
        proc.kill();
        return {
          content: `Command timed out after ${input.timeout}ms`,
          isError: true,
        };
      }

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = proc.exitCode;

      let output = "";
      if (stdout) output += stdout;
      if (stderr) output += (output ? "\n" : "") + `[stderr]\n${stderr}`;
      output += `\n[exit code: ${exitCode}]`;

      // Truncate very long output
      const MAX_LENGTH = 50_000;
      if (output.length > MAX_LENGTH) {
        output =
          output.slice(0, MAX_LENGTH) +
          `\n... (truncated, ${output.length - MAX_LENGTH} chars omitted)`;
      }

      return {
        content: output,
        isError: exitCode !== 0,
      };
    } catch (err) {
      return {
        content: `Failed to execute command: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  },
};
