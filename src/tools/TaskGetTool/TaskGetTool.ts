import { z } from "zod";
import type { Tool, ToolResult, ToolUseContext } from "../Tool.js";
import type { TaskManager } from "../../tasks/TaskManager.js";
import { formatTaskState } from "../shared/utils.js";

const TaskGetInput = z.object({
  task_id: z.string().describe("ID of the task to retrieve"),
});

type TaskGetInput = z.infer<typeof TaskGetInput>;

export function createTaskGetTool(taskManager: TaskManager): Tool<TaskGetInput> {
  return {
    name: "task_get",
    description:
      "Get full details of a specific task by ID. Returns all task fields as formatted text.",
    parameters: TaskGetInput,
    isReadOnly: true,

    async call(input: TaskGetInput, _context: ToolUseContext): Promise<ToolResult> {
      const task = taskManager.get(input.task_id);
      if (!task) {
        return {
          content: `Task not found: ${input.task_id}`,
          isError: true,
        };
      }
      return { content: formatTaskState(task) };
    },
  };
}
