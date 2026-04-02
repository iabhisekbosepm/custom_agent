import { z } from "zod";
import type { Tool, ToolResult, ToolUseContext } from "../Tool.js";
import type { TaskManager } from "../../tasks/TaskManager.js";

const TaskOutputInput = z.object({
  task_id: z.string().describe("ID of the task to get output from"),
});

type TaskOutputInput = z.infer<typeof TaskOutputInput>;

export function createTaskOutputTool(taskManager: TaskManager): Tool<TaskOutputInput> {
  return {
    name: "task_output",
    description:
      "Retrieve the output of a completed task. Returns the task's output text.",
    parameters: TaskOutputInput,
    isReadOnly: true,

    async call(input: TaskOutputInput, _context: ToolUseContext): Promise<ToolResult> {
      const task = taskManager.get(input.task_id);
      if (!task) {
        return {
          content: `Task not found: ${input.task_id}`,
          isError: true,
        };
      }
      if (task.status !== "completed") {
        return {
          content: `Task is not completed (current status: ${task.status}). Output is only available for completed tasks.`,
          isError: true,
        };
      }
      return { content: task.output ?? "(no output)" };
    },
  };
}
