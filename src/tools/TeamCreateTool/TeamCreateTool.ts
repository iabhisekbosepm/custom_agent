import { z } from "zod";
import type { Tool, ToolResult, ToolUseContext } from "../Tool.js";
import type { TeamManager } from "../../teams/TeamManager.js";
import type { AppConfig } from "../../types/config.js";
import type { ToolRegistry } from "../registry.js";

const TeamCreateInput = z.object({
  name: z.string().describe("Name for the team (e.g. 'code-analysis-team')"),
  teammates: z
    .array(
      z.object({
        agent: z
          .string()
          .describe("Agent type to use (e.g. 'explorer', 'coder', 'reviewer')"),
        task: z.string().describe("The task to assign to this teammate"),
      })
    )
    .min(1)
    .describe("List of teammates with their agent type and assigned task"),
});

type TeamCreateInput = z.infer<typeof TeamCreateInput>;

/**
 * Create a team_create tool that spawns a team of agents running in parallel.
 * Blocks until all teammates finish (like agent_spawn).
 */
export function createTeamCreateTool(
  teamManager: TeamManager,
  config: AppConfig,
  teamToolRegistry: ToolRegistry
): Tool<TeamCreateInput> {
  return {
    name: "team_create",
    description:
      "Create and run a team of agents that work in parallel on related tasks. " +
      "Each teammate runs concurrently with its own agent type and task. " +
      "Blocks until all teammates complete and returns a synthesized summary.",
    parameters: TeamCreateInput,
    isReadOnly: false,

    async call(input: TeamCreateInput, context: ToolUseContext): Promise<ToolResult> {
      try {
        const team = teamManager.create({
          name: input.name,
          teammates: input.teammates,
          leadAgentId: "lead",
        });

        // Update UI to show team activity
        context.setAppState((s) => ({
          ...s,
          activeTeams: [
            ...s.activeTeams,
            {
              teamId: team.id,
              name: team.name,
              status: team.status,
              teammates: team.teammates.map((t) => ({
                teammateId: t.teammateId,
                agentName: t.agentDefinitionName,
                status: t.status,
                activeToolCalls: [],
                taskDescription: input.teammates.find(
                  (it) => t.agentDefinitionName === it.agent
                )?.task ?? "",
              })),
            },
          ],
        }));

        const result = await teamManager.run(team.id, config, teamToolRegistry);

        // Build summary
        const summaryParts = result.teammates.map(
          (t) =>
            `## ${t.teammateId} (${t.agentDefinitionName}) — ${t.status}\n${t.output ?? "(no output)"}`
        );
        const summary = `# Team "${input.name}" Results\n\n${summaryParts.join("\n\n---\n\n")}`;

        return { content: summary };
      } catch (err) {
        return {
          content: `Failed to create/run team: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        };
      } finally {
        // Clean up team from active UI state
        context.setAppState((s) => ({
          ...s,
          activeTeams: s.activeTeams.filter(
            (t) => !input.name || t.name !== input.name
          ),
        }));
      }
    },
  };
}
