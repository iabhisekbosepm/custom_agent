import { z } from "zod";
import type { Tool, ToolResult, ToolUseContext } from "../Tool.js";
import type { TeamManager } from "../../teams/TeamManager.js";

const TeamStatusInput = z.object({
  team_id: z
    .string()
    .optional()
    .describe("ID of the team to check. If omitted, shows all active teams."),
});

type TeamStatusInput = z.infer<typeof TeamStatusInput>;

/**
 * Create a team_status tool for checking team and teammate progress.
 */
export function createTeamStatusTool(
  teamManager: TeamManager
): Tool<TeamStatusInput> {
  return {
    name: "team_status",
    description:
      "Check the status of a team and its teammates. " +
      "Shows each teammate's current status, active tools, and output.",
    parameters: TeamStatusInput,
    isReadOnly: true,

    async call(input: TeamStatusInput, _context: ToolUseContext): Promise<ToolResult> {
      if (input.team_id) {
        const team = teamManager.get(input.team_id);
        if (!team) {
          return { content: `Team not found: ${input.team_id}`, isError: true };
        }
        return { content: formatTeamStatus(team) };
      }

      const teams = teamManager.list();
      if (teams.length === 0) {
        return { content: "No teams exist." };
      }

      const output = teams.map(formatTeamStatus).join("\n\n---\n\n");
      return { content: output };
    },
  };
}

function formatTeamStatus(team: {
  id: string;
  name: string;
  status: string;
  teammates: Array<{
    teammateId: string;
    agentDefinitionName: string;
    status: string;
    output: string | null;
    activeToolCalls: Array<{ name: string; status: string }>;
  }>;
}): string {
  const lines: string[] = [
    `Team: ${team.name} (${team.id})`,
    `Status: ${team.status}`,
    `Teammates:`,
  ];

  for (const t of team.teammates) {
    const activeTools = t.activeToolCalls
      .filter((tc) => tc.status === "running")
      .map((tc) => tc.name)
      .join(", ");

    lines.push(
      `  - ${t.teammateId} (${t.agentDefinitionName}): ${t.status}` +
        (activeTools ? ` [running: ${activeTools}]` : "") +
        (t.output ? `\n    Output: ${t.output.slice(0, 200)}${t.output.length > 200 ? "..." : ""}` : "")
    );
  }

  return lines.join("\n");
}
