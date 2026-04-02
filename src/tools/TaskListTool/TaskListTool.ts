import { z } from "zod";
import type { Tool, ToolResult, ToolUseContext } from "../Tool.js";
import type { TaskManager } from "../../tasks/TaskManager.js";

const TaskListInput = z.object({
  status: z
    .enum(["pending", "running", "completed", "failed", "cancelled"])
    .optional()
    .describe("Filter tasks by status"),
  parent_id: z.string().optional().describe("Filter tasks by parent ID"),
});

type TaskListInput = z.infer<typeof TaskListInput>;

export function createTaskListTool(taskManager: TaskManager): Tool<TaskListInput> {
  return {
    name: "task_list",
    description:
      "List all tasks, optionally filtered by status or parent ID. Returns a formatted table.",
    parameters: TaskListInput,
    isReadOnly: true,

    async call(input: TaskListInput, _context: ToolUseContext): Promise<ToolResult> {
      try {
        const tasks = taskManager.list({
          status: input.status,
          parentId: input.parent_id,
        });

        if (tasks.length === 0) {
          return { content: "No tasks found." };
        }

        const header = "ID                                   | Status     | Description";
        const sep = "-".repeat(header.length);
        const rows = tasks.map(
          (t) =>
            `${t.id} | ${t.status.padEnd(10)} | ${t.description.slice(0, 60)}`
        );

        return { content: [header, sep, ...rows].join("\n") };
      } catch (err) {
        return {
          content: `Failed to list tasks: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        };
      }
    },
  };
}
