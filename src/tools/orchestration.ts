import type { ToolCall, ToolResultMessage, Message } from "../types/messages.js";
import type { AppConfig } from "../types/config.js";
import type { AppState, ActiveToolCall } from "../state/AppStateStore.js";
import type { Updater } from "../state/store.js";
import type { Logger } from "../utils/logger.js";
import type { HookManager } from "../hooks/index.js";
import type { ToolRegistry } from "./registry.js";
import type { ToolUseContext } from "./Tool.js";
import { summarizeToolArgs } from "../utils/toolArgsSummary.js";

interface OrchestrationContext {
  toolCalls: ToolCall[];
  messages: Message[];
  config: AppConfig;
  registry: ToolRegistry;
  hooks: HookManager;
  getAppState: () => AppState;
  setAppState: (updater: Updater<AppState>) => void;
  abortSignal: AbortSignal;
  log: Logger;
}

/**
 * Execute all tool calls from one assistant turn.
 * Returns one ToolResultMessage per tool call — always, even on error.
 */
export async function executeToolCalls(
  ctx: OrchestrationContext
): Promise<ToolResultMessage[]> {
  const results: ToolResultMessage[] = [];

  // Build initial activeToolCalls with all pending
  const initialToolCalls: ActiveToolCall[] = ctx.toolCalls.map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    argsSummary: summarizeToolArgs(tc.function.arguments),
    status: "pending" as const,
  }));
  ctx.setAppState((s) => ({ ...s, activeToolCalls: initialToolCalls }));

  for (const toolCall of ctx.toolCalls) {
    const toolName = toolCall.function.name;

    // Update UI state — mark current tool as running
    ctx.setAppState((s) => ({
      ...s,
      activeToolName: toolName,
      activeToolCalls: s.activeToolCalls.map((tc) =>
        tc.id === toolCall.id ? { ...tc, status: "running" as const } : tc
      ),
    }));

    const tool = ctx.registry.get(toolName);

    if (!tool) {
      ctx.log.warn(`Unknown tool requested: ${toolName}`);
      const errContent = `Error: Unknown tool "${toolName}". Available tools: ${ctx.registry
        .list()
        .map((t) => t.name)
        .join(", ")}`;
      results.push({ role: "tool", tool_call_id: toolCall.id, content: errContent });
      await ctx.hooks.emit("tool:after", {
        toolName,
        toolCall,
        result: errContent,
        isError: true,
      });
      // Mark tool as completed
      ctx.setAppState((s) => ({
        ...s,
        activeToolCalls: s.activeToolCalls.map((tc) =>
          tc.id === toolCall.id ? { ...tc, status: "completed" as const } : tc
        ),
      }));
      continue;
    }

    // Emit tool:before
    await ctx.hooks.emit("tool:before", { toolName, toolCall });

    try {
      // Parse and validate arguments
      let rawArgs: unknown;
      try {
        rawArgs = JSON.parse(toolCall.function.arguments);
      } catch {
        throw new Error(
          `Invalid JSON in tool arguments: ${toolCall.function.arguments}`
        );
      }

      const parseResult = tool.parameters.safeParse(rawArgs);
      if (!parseResult.success) {
        const issues = parseResult.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
        throw new Error(`Invalid tool arguments: ${issues}`);
      }

      const toolContext: ToolUseContext = {
        toolCall,
        messages: ctx.messages,
        config: ctx.config,
        getAppState: ctx.getAppState,
        setAppState: ctx.setAppState,
        abortSignal: ctx.abortSignal,
        log: ctx.log.child(toolName),
      };

      ctx.log.debug(`Executing tool: ${toolName}`, {
        args: parseResult.data as Record<string, unknown>,
      });

      const result = await tool.call(parseResult.data, toolContext);

      const content = result.isError
        ? `Error: ${result.content}`
        : result.content;

      results.push({ role: "tool", tool_call_id: toolCall.id, content });

      await ctx.hooks.emit("tool:after", {
        toolName,
        toolCall,
        result: content,
        isError: result.isError ?? false,
      });

      // Mark tool as completed
      ctx.setAppState((s) => ({
        ...s,
        activeToolCalls: s.activeToolCalls.map((tc) =>
          tc.id === toolCall.id ? { ...tc, status: "completed" as const } : tc
        ),
      }));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err);
      ctx.log.error(`Tool ${toolName} failed: ${message}`);

      const errContent = `Error executing ${toolName}: ${message}`;
      results.push({ role: "tool", tool_call_id: toolCall.id, content: errContent });

      await ctx.hooks.emit("tool:after", {
        toolName,
        toolCall,
        result: errContent,
        isError: true,
      });

      // Mark tool as completed
      ctx.setAppState((s) => ({
        ...s,
        activeToolCalls: s.activeToolCalls.map((tc) =>
          tc.id === toolCall.id ? { ...tc, status: "completed" as const } : tc
        ),
      }));
    }
  }

  // Clear active tool calls and tool name in UI
  ctx.setAppState((s) => ({ ...s, activeToolName: null, activeToolCalls: [] }));

  return results;
}
