import type { AgentDefinition } from "../agents/AgentDefinition.js";
import type { ActiveToolCall } from "../state/AppStateStore.js";
import type { Mailbox } from "./Mailbox.js";

export type TeamStatus = "forming" | "running" | "completed" | "failed" | "shutdown";

/** Definition for a single teammate to be spawned in a team. */
export interface TeammateDefinition {
  /** Reference to the agent definition (explorer, coder, reviewer, etc.). */
  agentDef: AgentDefinition;
  /** The initial task description given to this teammate. */
  initialTask: string;
  /** Unique ID for this teammate within the team. */
  teammateId: string;
}

/** Runtime state of a single teammate. */
export interface TeammateState {
  teammateId: string;
  agentDefinitionName: string;
  status: "pending" | "running" | "completed" | "failed";
  output: string | null;
  activeToolCalls: ActiveToolCall[];
  currentStreamText: string;
}

/** Full state of a running team. */
export interface TeamState {
  id: string;
  name: string;
  status: TeamStatus;
  leadAgentId: string;
  teammates: TeammateState[];
  mailbox: Mailbox;
  rootTaskId: string;
  createdAt: number;
  completedAt: number | null;
}

/** Options for creating a team. */
export interface CreateTeamOptions {
  name: string;
  teammates: Array<{ agent: string; task: string }>;
  leadAgentId: string;
}

/** Listener for team state changes. */
export type TeamListener = (teamState: TeamState) => void;
