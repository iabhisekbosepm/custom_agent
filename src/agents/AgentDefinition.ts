import type { Message } from "../types/messages.js";

/** Mode of execution for a sub-agent. */
export type AgentMode =
  | "sync"        // Blocks parent until done
  | "background"  // Runs async, parent continues
  | "forked";     // Gets a copy of context, runs independently

/** Definition for a specialized agent. */
export interface AgentDefinition {
  /** Unique name identifying this agent type. */
  name: string;
  /** Short description shown when listing agents. */
  description: string;
  /** System prompt injected at the start of the agent's conversation. */
  systemPrompt: string;
  /** Tool names this agent is allowed to use. Empty array = all tools. */
  allowedTools: string[];
  /** Max query loop turns for this agent. */
  maxTurns: number;
  /** Default execution mode. */
  mode: AgentMode;
  /** Optional model profile name (from models.json) to override global config. */
  modelProfile?: string;
  /** Optional pre-processing of the agent's initial messages. */
  prepareMessages?: (messages: Message[]) => Message[];
}

/** Runtime state for a running agent instance. */
export interface AgentInstance {
  id: string;
  definitionName: string;
  taskId: string;
  mode: AgentMode;
  abortController: AbortController;
  startedAt: number;
}
