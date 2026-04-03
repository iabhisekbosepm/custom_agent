import { z } from "zod";
import type { Tool, ToolResult, ToolUseContext } from "../Tool.js";
import type { TaskManager } from "../../tasks/TaskManager.js";

const TeamTaskClaimInput = z.object({
  task_id: z.string().describe("ID of the task to claim"),
});

type TeamTaskClaimInput = z.infer<typeof TeamTaskClaimInput>;

/**
 * Create a team_task_claim tool for teammates to atomically claim tasks.
 */
export function createTeamTaskClaimTool(
  taskManager: TaskManager
): Tool<TeamTaskClaimInput> {
  return {
    name: "team_task_claim",
    description:
      "Claim an unclaimed, unblocked task from the shared task list. " +
      "Returns the claimed task if successful, or an error if the task is already claimed or blocked.",
    parameters: TeamTaskClaimInput,
    isReadOnly: false,

    async call(input: TeamTaskClaimInput, context: ToolUseContext): Promise<ToolResult> {
      const agentId = extractTeammateId(context);

      try {
        const claimed = taskManager.claim(input.task_id, agentId);
        if (!claimed) {
          return {
            content: `Could not claim task ${input.task_id}. It may already be claimed, not pending, or blocked by dependencies.`,
            isError: true,
          };
        }
        return {
          content: `Task claimed successfully.\nID: ${claimed.id}\nDescription: ${claimed.description}\nClaimed by: ${agentId}`,
        };
      } catch (err) {
        return {
          content: `Failed to claim task: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        };
      }
    },
  };
}

function extractTeammateId(context: ToolUseContext): string {
  const systemMsg = context.messages.find((m) => m.role === "system");
  if (systemMsg && "content" in systemMsg && typeof systemMsg.content === "string") {
    const match = systemMsg.content.match(/Your teammate ID is "([^"]+)"/);
    if (match) return match[1];
  }
  return "unknown";
}
