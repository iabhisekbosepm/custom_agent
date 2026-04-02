import { z } from "zod";
import type { Tool, ToolResult, ToolUseContext } from "../Tool.js";

const GlobInput = z.object({
  pattern: z
    .string()
    .describe("Glob pattern to match files, e.g. '**/*.ts', 'src/**/*.tsx', '*.json'"),
  path: z
    .string()
    .optional()
    .describe("Base directory to search in (defaults to current working directory)"),
  max_results: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Maximum number of files to return (default: 100)"),
});

type GlobInput = z.infer<typeof GlobInput>;

export const GlobTool: Tool<GlobInput> = {
  name: "glob",
  description:
    "Find files by name/glob pattern. Use this to discover project structure, locate config files, find all files of a type, etc. Returns matching file paths sorted by modification time (newest first).",
  parameters: GlobInput,
  isReadOnly: true,

  async call(input: GlobInput, context: ToolUseContext): Promise<ToolResult> {
    try {
      const basePath = input.path ?? process.cwd();
      const maxResults = input.max_results ?? 100;

      // Use Bun's built-in glob
      const glob = new Bun.Glob(input.pattern);
      const matches: { path: string; mtime: number }[] = [];

      for await (const entry of glob.scan({
        cwd: basePath,
        dot: false,         // skip hidden files by default
        absolute: true,
        onlyFiles: true,
      })) {
        // Skip node_modules, .git, dist, and other noise
        if (shouldSkip(entry)) continue;

        try {
          const file = Bun.file(entry);
          const stat = await file.exists() ? file.lastModified : 0;
          matches.push({ path: entry, mtime: stat });
        } catch {
          matches.push({ path: entry, mtime: 0 });
        }

        // Safety cap to avoid scanning enormous repos forever
        if (matches.length >= 5000) break;
      }

      if (matches.length === 0) {
        return { content: `No files matching "${input.pattern}" found in ${basePath}` };
      }

      // Sort by modification time, newest first
      matches.sort((a, b) => b.mtime - a.mtime);

      const total = matches.length;
      const limited = matches.slice(0, maxResults);

      let result = limited.map((m) => m.path).join("\n");

      if (total > maxResults) {
        result += `\n\n... (${total - maxResults} more files, ${total} total)`;
      } else {
        result += `\n\n${total} file(s) found`;
      }

      return { content: result };
    } catch (err) {
      return {
        content: `Glob search failed: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  },
};

const SKIP_DIRS = [
  "/node_modules/",
  "/.git/",
  "/dist/",
  "/.next/",
  "/.nuxt/",
  "/build/",
  "/coverage/",
  "/.custom-agents/",
  "/bun.lockb",
];

function shouldSkip(filePath: string): boolean {
  return SKIP_DIRS.some((dir) => filePath.includes(dir));
}
