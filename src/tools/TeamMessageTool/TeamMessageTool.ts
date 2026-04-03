import { z } from "zod";
import type { Tool, ToolResult, ToolUseContext } from "../Tool.js";
import type { TeamManager } from "../../teams/TeamManager.js";
import type { HookManager } from "../../hooks/index.js";

const TeamMessageInput = z.object({
  to: z
    .string()
    .describe(
      'Teammate ID to send message to, or "all" for broadcast, or "lead" for the team lead'
    ),
  content: z.string().describe("Message content to send"),
});

type TeamMessageInput = z.infer<typeof TeamMessageInput>;

/**
 * Create a team_message tool for sending messages between teammates via the mailbox.
 */
export function createTeamMessageTool(
  teamManager: TeamManager,
  hooks: HookManager
): Tool<TeamMessageInput> {
  return {
    name: "team_message",
    description:
      "Send a message to a teammate, broadcast to all teammates, or message the team lead. " +
      "Use this to coordinate work, share findings, or ask for help.",
    parameters: TeamMessageInput,
    isReadOnly: false,

    async call(input: TeamMessageInput, context: ToolUseContext): Promise<ToolResult> {
      // Find which team this agent belongs to by checking active teams
      const teams = teamManager.list().filter((t) => t.status === "running");
      if (teams.length === 0) {
        return { content: "No active team found. You must be part of a running team to send messages.", isError: true };
      }

      // Use the first running team (teammates are scoped to one team)
      const team = teams[0];
      const fromId = extractTeammateId(context);

      const msg = team.mailbox.send({
        from: fromId,
        to: input.to,
        content: input.content,
      });

      await hooks.emit("team:message", {
        teamId: team.id,
        from: fromId,
        to: input.to,
        content: input.content,
      });

      return {
        content: `Message sent to "${input.to}" (ID: ${msg.id})`,
      };
    },
  };
}

/** Extract the teammate ID from the system prompt context. */
function extractTeammateId(context: ToolUseContext): string {
  const systemMsg = context.messages.find((m) => m.role === "system");
  if (systemMsg && "content" in systemMsg && typeof systemMsg.content === "string") {
    const match = systemMsg.content.match(/Your teammate ID is "([^"]+)"/);
    if (match) return match[1];
  }
  return "unknown";
}
