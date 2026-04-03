import type { TeammateDefinition } from "./TeamTypes.js";

/**
 * Build a system prompt addendum that gives a teammate awareness of:
 * - Their team and role
 * - Who their teammates are
 * - How to communicate via the mailbox
 * - Task coordination rules
 */
export function buildTeammatePromptAddendum(opts: {
  teamName: string;
  teamId: string;
  teammateId: string;
  allTeammates: TeammateDefinition[];
  rootTaskId: string;
}): string {
  const roster = opts.allTeammates
    .map(
      (t) =>
        `- ${t.teammateId} (${t.agentDef.name}): ${t.initialTask}`
    )
    .join("\n");

  return `

--- Team Context ---
You are part of team "${opts.teamName}" (ID: ${opts.teamId}).
Your teammate ID is "${opts.teammateId}".
The team's root task ID is "${opts.rootTaskId}".

Teammates:
${roster}

Communication:
- Use team_message to send messages to other teammates (by their teammate ID) or "all" for broadcast.
- Use team_check_messages periodically to check your inbox for messages from others.
- Use team_task_claim to claim an unclaimed task before working on it.

Task Coordination:
- Create subtasks with task_create, using parent_id="${opts.rootTaskId}" to keep tasks grouped.
- Use blocked_by to express dependencies between tasks.
- Before starting a task, claim it with team_task_claim to prevent duplicate work.
- Update tasks with task_update as you make progress.
- When you finish your work, provide a clear summary as your final message.
`;
}
