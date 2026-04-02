import type { Message, AssistantMessage, ToolCall } from "../types/messages.js";
import type { Logger } from "../utils/logger.js";

/**
 * Typed payloads for each lifecycle event.
 * Every hook handler receives the correct payload shape for its event.
 */
export interface HookPayloads {
  "session:start": { sessionId: string; model: string };
  "session:end": { sessionId: string; messageCount: number };
  "query:before": { messages: Message[] };
  "query:after": { messages: Message[]; turnCount: number; error?: string };
  "tool:before": { toolName: string; toolCall: ToolCall };
  "tool:after": { toolName: string; toolCall: ToolCall; result: string; isError: boolean };
  "message:assistant": { message: AssistantMessage };
  "agent:start": { agentName: string; agentId: string; taskId: string };
  "agent:end": { agentName: string; agentId: string; taskId: string; output: string };
  "context:compact": {
    originalTokens: number;
    compactedTokens: number;
    removedMessages: number;
    strategy: string;
  };
}

export type HookEvent = keyof HookPayloads;

export type HookHandler<E extends HookEvent = HookEvent> = (
  payload: HookPayloads[E]
) => void | Promise<void>;

interface RegisteredHook {
  event: HookEvent;
  handler: HookHandler<any>;
  /** Source of the hook (plugin name, user config, "internal", etc.). */
  source: string;
}

/**
 * Hook manager. Allows plugins, user config, and internal systems
 * to register handlers for lifecycle events.
 *
 * Hooks are fire-and-forget — errors are logged but never block the caller.
 */
export class HookManager {
  private hooks: RegisteredHook[] = [];
  private log: Logger;

  constructor(log: Logger) {
    this.log = log.child("hooks");
  }

  /** Register a typed handler for a lifecycle event. */
  on<E extends HookEvent>(
    event: E,
    handler: HookHandler<E>,
    source: string = "unknown"
  ): void {
    this.hooks.push({ event, handler, source });
    this.log.debug(`Hook registered: ${event} from ${source}`);
  }

  /** Remove all hooks from a specific source. */
  removeBySource(source: string): void {
    const before = this.hooks.length;
    this.hooks = this.hooks.filter((h) => h.source !== source);
    const removed = before - this.hooks.length;
    if (removed > 0) {
      this.log.debug(`Removed ${removed} hooks from source: ${source}`);
    }
  }

  /** Fire all handlers for an event. Errors are logged but don't block. */
  async emit<E extends HookEvent>(event: E, payload: HookPayloads[E]): Promise<void> {
    const matching = this.hooks.filter((h) => h.event === event);
    if (matching.length === 0) return;

    this.log.debug(`Emitting ${event} to ${matching.length} handler(s)`);

    for (const hook of matching) {
      try {
        await hook.handler(payload);
      } catch (err) {
        this.log.warn(`Hook failed: ${event} from ${hook.source}`, {
          error: String(err),
        });
      }
    }
  }

  list(event?: HookEvent): RegisteredHook[] {
    if (event) return this.hooks.filter((h) => h.event === event);
    return [...this.hooks];
  }
}
