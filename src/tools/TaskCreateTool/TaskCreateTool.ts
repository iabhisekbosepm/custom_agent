import { z } from "zod";
import type { Tool, ToolResult, ToolUseContext } from "../Tool.js";
import type { TaskManager } from "../../tasks/TaskManager.js";

const TaskCreateInput = z.object({
  description: z.string().describe("Description of the task to create"),
  parent_id: z.string().optional().describe("ID of the parent task, if any"),
  metadata: z
    .record(z.unknown())
    .optional()
    .describe("Arbitrary metadata to attach to the task"),
  blocked_by: z
    .array(z.string())
    .optional()
    .describe("IDs of tasks that must complete before this task can start"),
});

type TaskCreateInput = z.infer<typeof TaskCreateInput>;

export function createTaskCreateTool(taskManager: TaskManager): Tool<TaskCreateInput> {
  return {
    name: "task_create",
    description:
      "Create a new task for tracking work. Returns the created task ID and details.",
    parameters: TaskCreateInput,
    isReadOnly: false,

    async call(input: TaskCreateInput, _context: ToolUseContext): Promise<ToolResult> {
      try {
        const task = taskManager.create({
          description: input.description,
          parentId: input.parent_id,
          metadata: input.metadata,
          blockedBy: input.blocked_by,
        });
        return {
          content: `Task created successfully.\nID: ${task.id}\nStatus: ${task.status}\nDescription: ${task.description}`,
        };
      } catch (err) {
        return {
          content: `Failed to create task: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        };
      }
    },
  };
}
