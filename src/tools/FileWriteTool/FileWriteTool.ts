import { z } from "zod";
import { dirname } from "path";
import { mkdir } from "fs/promises";
import type { Tool, ToolResult, ToolUseContext } from "../Tool.js";
import { computeSideBySideDiff } from "../../utils/diff.js";

const FileWriteInput = z.object({
  file_path: z.string().describe("Absolute path to the file to write"),
  content: z.string().describe("The full content to write to the file"),
  create_dirs: z
    .boolean()
    .optional()
    .describe("Create parent directories if they don't exist (default: true)"),
});

type FileWriteInput = z.infer<typeof FileWriteInput>;

export const FileWriteTool: Tool<FileWriteInput> = {
  name: "file_write",
  description:
    "Write content to a file. Creates the file if it doesn't exist, overwrites if it does. Automatically creates parent directories. Use this for creating new files or replacing file contents entirely.",
  parameters: FileWriteInput,
  isReadOnly: false,

  async call(input: FileWriteInput, context: ToolUseContext): Promise<ToolResult> {
    try {
      const createDirs = input.create_dirs ?? true;

      if (createDirs) {
        await mkdir(dirname(input.file_path), { recursive: true });
      }

      // Read old content before overwrite (for diff)
      let oldContent: string | null = null;
      const file = Bun.file(input.file_path);
      if (await file.exists()) {
        oldContent = await file.text();
      }

      await Bun.write(input.file_path, input.content);

      // Emit diff if overwriting an existing file with different content
      if (oldContent !== null && oldContent !== input.content) {
        const diff = computeSideBySideDiff(input.file_path, oldContent, input.content);
        context.setAppState((s) => ({
          ...s,
          pendingDiffs: [...s.pendingDiffs, diff],
          focusOwner: "diffViewer",
        }));
      }

      // Report what was done
      const lines = input.content.split("\n").length;
      const bytes = new TextEncoder().encode(input.content).length;

      return {
        content: `Wrote ${lines} lines (${bytes} bytes) to ${input.file_path}`,
      };
    } catch (err) {
      return {
        content: `Failed to write file: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  },
};
