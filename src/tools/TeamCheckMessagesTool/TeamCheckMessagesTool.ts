import { z } from "zod";
import type { Tool, ToolResult, ToolUseContext } from "../Tool.js";
import type { TeamManager } from "../../teams/TeamManager.js";

const TeamCheckMessagesInput = z.object({
  peek: z
    .boolean()
    .optional()
    .describe("If true, view messages without marking them as read (default: false)"),
});

type TeamCheckMessagesInput = z.infer<typeof TeamCheckMessagesInput>;

/**
 * Create a team_check_messages tool for reading the teammate's inbox.
 */
export function createTeamCheckMessagesTool(
  teamManager: TeamManager
): Tool<TeamCheckMessagesInput> {
  return {
    name: "team_check_messages",
    description:
      "Check your inbox for messages from other teammates. " +
      "Call this periodically to stay coordinated with your team.",
    parameters: TeamCheckMessagesInput,
    isReadOnly: true,

    async call(input: TeamCheckMessagesInput, context: ToolUseContext): Promise<ToolResult> {
      const teams = teamManager.list().filter((t) => t.status === "running");
      if (teams.length === 0) {
        return { content: "No active team found.", isError: true };
      }

      const team = teams[0];
      const myId = extractTeammateId(context);

      const messages = input.peek
        ? team.mailbox.peek(myId)
        : team.mailbox.receive(myId);

      if (messages.length === 0) {
        return { content: "No new messages." };
      }

      const formatted = messages
        .map(
          (m) =>
            `[${new Date(m.timestamp).toISOString()}] From ${m.from}: ${m.content}`
        )
        .join("\n");

      return {
        content: `${messages.length} message(s):\n${formatted}`,
      };
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
