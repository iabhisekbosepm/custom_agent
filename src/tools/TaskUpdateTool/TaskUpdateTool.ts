import { z } from "zod";
import type { Tool, ToolResult, ToolUseContext } from "../Tool.js";
import type { TaskManager } from "../../tasks/TaskManager.js";
import { formatTaskState } from "../shared/utils.js";

const TaskUpdateInput = z.object({
  task_id: z.string().describe("ID of the task to update"),
  status: z
    .enum(["pending", "running", "completed", "failed", "cancelled"])
    .describe("New status for the task"),
  output: z.string().optional().describe("Output text (for completed tasks)"),
  error: z.string().optional().describe("Error message (for failed tasks)"),
});

type TaskUpdateInput = z.infer<typeof TaskUpdateInput>;

export function createTaskUpdateTool(taskManager: TaskManager): Tool<TaskUpdateInput> {
  return {
    name: "task_update",
    description:
      "Update a task's status. Valid transitions: pending→running/cancelled, running→completed/failed/cancelled.",
    parameters: TaskUpdateInput,
    isReadOnly: false,

    async call(input: TaskUpdateInput, _context: ToolUseContext): Promise<ToolResult> {
      try {
        const updated = taskManager.transition(input.task_id, input.status, {
          output: input.output,
          error: input.error,
        });
        return { content: `Task updated.\n${formatTaskState(updated)}` };
      } catch (err) {
        return {
          content: `Failed to update task: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        };
      }
    },
  };
}
