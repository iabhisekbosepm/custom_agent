import { z } from "zod";
import type { Tool, ToolResult, ToolUseContext } from "../Tool.js";

const FileReadInput = z.object({
  file_path: z.string().describe("Absolute path to the file to read"),
  offset: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Line number to start reading from (0-based)"),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Maximum number of lines to read"),
});

type FileReadInput = z.infer<typeof FileReadInput>;

export const FileReadTool: Tool<FileReadInput> = {
  name: "file_read",
  description:
    "Read the contents of a file. Returns line-numbered output. Supports optional offset and limit for large files.",
  parameters: FileReadInput,
  isReadOnly: true,

  async call(input: FileReadInput, _context: ToolUseContext): Promise<ToolResult> {
    try {
      const file = Bun.file(input.file_path);
      const exists = await file.exists();

      if (!exists) {
        return {
          content: `File not found: ${input.file_path}`,
          isError: true,
        };
      }

      const text = await file.text();
      let lines = text.split("\n");

      // Apply offset
      const offset = input.offset ?? 0;
      if (offset > 0) {
        lines = lines.slice(offset);
      }

      // Apply limit
      if (input.limit !== undefined) {
        lines = lines.slice(0, input.limit);
      }

      // Add line numbers
      const numbered = lines
        .map((line, i) => `${(offset + i + 1).toString().padStart(6)}\t${line}`)
        .join("\n");

      return { content: numbered };
    } catch (err) {
      return {
        content: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  },
};
