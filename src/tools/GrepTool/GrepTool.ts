import { z } from "zod";
import type { Tool, ToolResult, ToolUseContext } from "../Tool.js";

const GrepInput = z.object({
  pattern: z
    .string()
    .describe("Regex pattern to search for in file contents"),
  path: z
    .string()
    .optional()
    .describe("Directory or file to search in (defaults to current working directory)"),
  include: z
    .string()
    .optional()
    .describe("Glob pattern to filter files, e.g. '*.ts', '*.{ts,tsx}'"),
  ignore_case: z
    .boolean()
    .optional()
    .describe("Case-insensitive search (default: false)"),
  max_results: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Maximum number of matching lines to return (default: 50)"),
  context_lines: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Number of context lines to show before and after each match (default: 0)"),
});

type GrepInput = z.infer<typeof GrepInput>;

export const GrepTool: Tool<GrepInput> = {
  name: "grep",
  description:
    "Search file contents by regex pattern. Fast codebase search similar to ripgrep. Returns matching lines with file paths and line numbers. Use this to find function definitions, usages, imports, strings, etc.",
  parameters: GrepInput,
  isReadOnly: true,

  async call(input: GrepInput, context: ToolUseContext): Promise<ToolResult> {
    try {
      const searchPath = input.path ?? process.cwd();
      const maxResults = input.max_results ?? 50;
      const contextLines = input.context_lines ?? 0;

      // Build ripgrep / grep command
      // Prefer rg (ripgrep) if available, fall back to grep
      const args: string[] = [];

      // Try ripgrep first — it's faster and respects .gitignore
      const useRg = await commandExists("rg");

      if (useRg) {
        args.push("rg", "--line-number", "--no-heading", "--color=never");
        if (input.ignore_case) args.push("--ignore-case");
        if (input.include) args.push("--glob", input.include);
        if (contextLines > 0) args.push(`--context=${contextLines}`);
        args.push("--max-count", "200"); // safety cap per file
        args.push("--", input.pattern, searchPath);
      } else {
        args.push("grep", "-rn", "--color=never");
        if (input.ignore_case) args.push("-i");
        if (input.include) args.push("--include", input.include);
        if (contextLines > 0) args.push(`-C${contextLines}`);
        args.push("--", input.pattern, searchPath);
      }

      const proc = Bun.spawn(["bash", "-c", args.join(" ")], {
        stdout: "pipe",
        stderr: "pipe",
      });

      // Timeout after 15 seconds
      const timeout = new Promise<"timeout">((resolve) =>
        setTimeout(() => resolve("timeout"), 15_000)
      );
      const completion = proc.exited.then(() => "done" as const);
      const race = await Promise.race([completion, timeout]);

      if (race === "timeout") {
        proc.kill();
        return { content: "Search timed out after 15 seconds. Try a narrower path or pattern.", isError: true };
      }

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();

      // grep returns exit code 1 for "no matches" — that's not an error
      if (proc.exitCode !== 0 && proc.exitCode !== 1) {
        return { content: `Search failed: ${stderr}`, isError: true };
      }

      if (!stdout.trim()) {
        return { content: "No matches found." };
      }

      // Truncate to max_results lines
      const lines = stdout.split("\n");
      const total = lines.length;
      const truncated = lines.slice(0, maxResults);
      let result = truncated.join("\n");

      if (total > maxResults) {
        result += `\n\n... (${total - maxResults} more matches truncated, ${total} total)`;
      }

      return { content: result };
    } catch (err) {
      return {
        content: `Search failed: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  },
};

async function commandExists(cmd: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(["which", cmd], { stdout: "pipe", stderr: "pipe" });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}
