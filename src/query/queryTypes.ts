import type { Message, AssistantMessage } from "../types/messages.js";
import type { AppConfig } from "../types/config.js";
import type { AppState } from "../state/AppStateStore.js";
import type { Updater } from "../state/store.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { HookManager } from "../hooks/index.js";
import type { Logger } from "../utils/logger.js";

export interface QueryConfig {
  config: AppConfig;
  registry: ToolRegistry;
  hooks: HookManager;
  getAppState: () => AppState;
  setAppState: (updater: Updater<AppState>) => void;
  abortSignal: AbortSignal;
  log: Logger;
  /** Pre-built memory context string to append to system prompt. */
  memoryContext?: string;
}

export interface QueryCallbacks {
  onStreamToken?: (token: string) => void;
  onAssistantMessage?: (msg: AssistantMessage) => void;
  onToolCallStart?: (toolName: string) => void;
  onToolCallEnd?: (toolName: string) => void;
  onTurnComplete?: (turnNumber: number) => void;
  onError?: (error: Error) => void;
}

export interface QueryResult {
  messages: Message[];
  turnCount: number;
  aborted: boolean;
  error?: string;
}
