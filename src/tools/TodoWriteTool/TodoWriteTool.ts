import { z } from "zod";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import type { Tool, ToolResult, ToolUseContext } from "../Tool.js";

const TodoWriteInput = z.object({
  items: z
    .array(z.string())
    .describe("List of todo items to write"),
  file_path: z
    .string()
    .optional()
    .describe("Custom file path for the todo file (default: .custom-agents/todos.md)"),
});

type TodoWriteInput = z.infer<typeof TodoWriteInput>;

const DEFAULT_TODO_PATH = join(process.cwd(), ".custom-agents", "todos.md");

export const TodoWriteTool: Tool<TodoWriteInput> = {
  name: "todo_write",
  description:
    "Write or append todo items to a persistent todo file. Items are stored as markdown checkboxes. Persists across sessions.",
  parameters: TodoWriteInput,
  isReadOnly: false,

  async call(input: TodoWriteInput, _context: ToolUseContext): Promise<ToolResult> {
    try {
      const filePath = input.file_path ?? DEFAULT_TODO_PATH;
      const dir = filePath.substring(0, filePath.lastIndexOf("/"));

      // Ensure directory exists
      if (dir && !existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      // Format items as markdown checkboxes
      const newItems = input.items.map((item) => `- [ ] ${item}`).join("\n");

      // Read existing content and append
      const file = Bun.file(filePath);
      let existing = "";
      if (await file.exists()) {
        existing = await file.text();
      }

      const content = existing
        ? `${existing.trimEnd()}\n${newItems}\n`
        : `# Todos\n\n${newItems}\n`;

      await Bun.write(filePath, content);

      return {
        content: `Added ${input.items.length} todo item(s) to ${filePath}`,
      };
    } catch (err) {
      return {
        content: `Failed to write todos: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  },
};
