import { z } from "zod";
import type { Tool, ToolResult, ToolUseContext } from "../Tool.js";
import { computeSideBySideDiff } from "../../utils/diff.js";

const FileEditInput = z.object({
  file_path: z.string().describe("Absolute path to the file to edit"),
  old_string: z.string().describe("The exact string to find and replace (must be unique in the file)"),
  new_string: z.string().describe("The replacement string"),
  replace_all: z
    .boolean()
    .optional()
    .describe("Replace all occurrences instead of just the first (default: false)"),
});

type FileEditInput = z.infer<typeof FileEditInput>;

export const FileEditTool: Tool<FileEditInput> = {
  name: "file_edit",
  description:
    "Make targeted edits to an existing file by replacing exact string matches. The old_string must match exactly (including whitespace and indentation). For single replacement, old_string must be unique in the file. Use this instead of file_write when you only need to change part of a file.",
  parameters: FileEditInput,
  isReadOnly: false,

  async call(input: FileEditInput, context: ToolUseContext): Promise<ToolResult> {
    try {
      const file = Bun.file(input.file_path);
      if (!(await file.exists())) {
        return { content: `File not found: ${input.file_path}`, isError: true };
      }

      const content = await file.text();

      // Check that old_string exists
      if (!content.includes(input.old_string)) {
        return {
          content: `old_string not found in ${input.file_path}. Make sure it matches exactly, including whitespace and indentation.`,
          isError: true,
        };
      }

      // Check uniqueness when not replacing all
      if (!input.replace_all) {
        const count = content.split(input.old_string).length - 1;
        if (count > 1) {
          return {
            content: `old_string appears ${count} times in ${input.file_path}. Provide more surrounding context to make it unique, or set replace_all: true.`,
            isError: true,
          };
        }
      }

      // Perform the replacement
      let newContent: string;
      if (input.replace_all) {
        newContent = content.split(input.old_string).join(input.new_string);
      } else {
        newContent = content.replace(input.old_string, input.new_string);
      }

      await Bun.write(input.file_path, newContent);

      // Emit diff to UI
      const diff = computeSideBySideDiff(input.file_path, content, newContent);
      context.setAppState((s) => ({
        ...s,
        pendingDiffs: [...s.pendingDiffs, diff],
        focusOwner: "diffViewer",
      }));

      const replacements = input.replace_all
        ? content.split(input.old_string).length - 1
        : 1;

      return {
        content: `Applied ${replacements} replacement(s) in ${input.file_path}`,
      };
    } catch (err) {
      return {
        content: `Failed to edit file: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  },
};
