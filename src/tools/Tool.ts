import type { z } from "zod";
import type { Message, ToolCall } from "../types/messages.js";
import type { AppConfig } from "../types/config.js";
import type { AppState } from "../state/AppStateStore.js";
import type { Updater } from "../state/store.js";
import type { Logger } from "../utils/logger.js";

/** Context provided to every tool invocation. */
export interface ToolUseContext {
  toolCall: ToolCall;
  messages: Message[];
  config: AppConfig;
  getAppState: () => AppState;
  setAppState: (updater: Updater<AppState>) => void;
  abortSignal: AbortSignal;
  log: Logger;
}

/** Standard result shape returned from tool execution. */
export interface ToolResult {
  content: string;
  isError?: boolean;
}

/**
 * Tool interface. Every tool must implement this.
 * TInput is the Zod-inferred input type for the tool's parameters.
 */
export interface Tool<TInput = unknown> {
  /** Unique tool name (used in function calling). */
  name: string;
  /** Short description for the model. */
  description: string;
  /** Zod schema defining the tool's parameters (output type = TInput). */
  parameters: z.ZodType<TInput, z.ZodTypeDef, unknown>;
  /** Whether this tool only reads state (no side effects). */
  isReadOnly: boolean;
  /** Execute the tool. */
  call(input: TInput, context: ToolUseContext): Promise<ToolResult>;
}
