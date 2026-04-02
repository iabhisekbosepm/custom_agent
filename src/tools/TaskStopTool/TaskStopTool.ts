import { z } from "zod";
import type { Tool, ToolResult, ToolUseContext } from "../Tool.js";
import type { TaskManager } from "../../tasks/TaskManager.js";

const TaskStopInput = z.object({
  task_id: z.string().describe("ID of the task to stop/cancel"),
});

type TaskStopInput = z.infer<typeof TaskStopInput>;

export function createTaskStopTool(taskManager: TaskManager): Tool<TaskStopInput> {
  return {
    name: "task_stop",
    description:
      "Stop/cancel a running or pending task. The task will be marked as cancelled.",
    parameters: TaskStopInput,
    isReadOnly: false,

    async call(input: TaskStopInput, _context: ToolUseContext): Promise<ToolResult> {
      try {
        const updated = taskManager.transition(input.task_id, "cancelled");
        return {
          content: `Task ${updated.id} has been cancelled.`,
        };
      } catch (err) {
        return {
          content: `Failed to stop task: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        };
      }
    },
  };
}
