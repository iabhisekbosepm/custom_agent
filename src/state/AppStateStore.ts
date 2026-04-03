import type { Message } from "../types/messages.js";
import type { DiffResult } from "../utils/diff.js";
import { createStore, type Store } from "./store.js";

export type FocusOwner = "input" | "diffViewer" | "autocomplete";

export interface ActiveToolCall {
  id: string;
  name: string;
  argsSummary: string;
  status: "pending" | "running" | "completed";
}

export interface TeamUITeammate {
  teammateId: string;
  agentName: string;
  status: string;
  activeToolCalls: ActiveToolCall[];
  taskDescription: string;
}

export interface TeamUIState {
  teamId: string;
  name: string;
  status: string;
  teammates: TeamUITeammate[];
}

export interface AppState {
  /** Full conversation history. */
  messages: Message[];
  /** True while the model is streaming a response. */
  isStreaming: boolean;
  /** Accumulated text while streaming (cleared when turn completes). */
  currentStreamText: string;
  /** Active model identifier. */
  model: string;
  /** Input mode: "normal" allows typing, "busy" blocks input. */
  inputMode: "normal" | "busy";
  /** Currently executing tool name, if any. */
  activeToolName: string | null;
  /** Error from last query loop run, if any. */
  lastError: string | null;
  /** Pending diffs to display in the UI. */
  pendingDiffs: DiffResult[];
  /** Which component currently owns keyboard focus. */
  focusOwner: FocusOwner;
  /** Whether brief/compact output mode is enabled. */
  briefMode: boolean;
  /** Whether the agent is in planning mode. */
  planMode: boolean;
  /** Active tool calls with status tracking. */
  activeToolCalls: ActiveToolCall[];
  /** TaskManager ID of the currently running agent (for rendering subtasks). */
  activeAgentTaskId: string | null;
  /** Real-time tool calls from the currently running agent. */
  agentToolCalls: ActiveToolCall[];
  /** Timestamp when the current turn started. */
  turnStartedAt: number | null;
  /** Approximate token count for the current turn. */
  turnTokenCount: number;
  /** Active agent teams with real-time state. */
  activeTeams: TeamUIState[];
}

export function createDefaultAppState(model: string): AppState {
  return {
    messages: [],
    isStreaming: false,
    currentStreamText: "",
    model,
    inputMode: "normal",
    activeToolName: null,
    lastError: null,
    pendingDiffs: [],
    focusOwner: "input",
    briefMode: false,
    planMode: false,
    activeToolCalls: [],
    activeAgentTaskId: null,
    agentToolCalls: [],
    turnStartedAt: null,
    turnTokenCount: 0,
    activeTeams: [],
  };
}

export type AppStateStore = Store<AppState>;

export function createAppStateStore(model: string): AppStateStore {
  return createStore(createDefaultAppState(model));
}
