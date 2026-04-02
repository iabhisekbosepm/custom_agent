import type { Message, SystemMessage } from "../types/messages.js";
import type { QueryConfig, QueryCallbacks, QueryResult } from "./queryTypes.js";
import { streamChatCompletion } from "./streamOpenAI.js";
import { executeToolCalls } from "../tools/orchestration.js";
import { compactMessages } from "./compaction.js";

/**
 * Core query loop — the engine of the assistant.
 *
 * 1. Build request from messages + system prompt + tools
 * 2. Stream response, firing onStreamToken callbacks
 * 3. If tool_calls: execute via orchestration, append results, loop
 * 4. If no tool_calls: done
 * 5. Exit on max turns or abort signal
 */
export async function runQueryLoop(
  initialMessages: Message[],
  qc: QueryConfig,
  callbacks: QueryCallbacks = {}
): Promise<QueryResult> {
  const { config, registry, hooks, getAppState, setAppState, abortSignal, log } = qc;
  const messages: Message[] = [...initialMessages];

  // Build system prompt with optional memory context
  let systemContent = config.systemPrompt;
  if (qc.memoryContext) {
    systemContent += `\n\n--- Persistent Memory ---\n${qc.memoryContext}`;
  }

  // Prepend system prompt if not already present
  if (messages.length === 0 || messages[0].role !== "system") {
    const systemMsg: SystemMessage = {
      role: "system",
      content: systemContent,
    };
    messages.unshift(systemMsg);
  }

  const tools = registry.toOpenAITools();
  let turnCount = 0;

  // Emit query:before hook
  await hooks.emit("query:before", { messages: [...messages] });

  // Enter streaming state
  setAppState((s) => ({
    ...s,
    isStreaming: true,
    inputMode: "busy",
    lastError: null,
    turnStartedAt: Date.now(),
    turnTokenCount: 0,
  }));

  try {
    while (turnCount < config.maxTurns) {
      if (abortSignal.aborted) {
        return { messages, turnCount, aborted: true };
      }

      turnCount++;
      log.debug(`Starting turn ${turnCount}`);

      // Clear streaming text for this turn
      setAppState((s) => ({ ...s, currentStreamText: "" }));

      // Compact context if approaching budget
      const compactionResult = await compactMessages(
        messages,
        { contextBudget: config.contextBudget },
        hooks,
        log
      );
      if (compactionResult.didCompact) {
        // Replace messages array contents with compacted version
        messages.length = 0;
        messages.push(...compactionResult.messages);
        setAppState((s) => ({ ...s, messages: [...messages] }));
      }

      // Stream the model's response
      const assistantMsg = await streamChatCompletion({
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.model,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        abortSignal,
        onToken(token) {
          callbacks.onStreamToken?.(token);
          setAppState((s) => ({
            ...s,
            currentStreamText: s.currentStreamText + token,
            turnTokenCount: s.turnTokenCount + 1,
          }));
        },
      });

      // Append the assistant message to conversation
      messages.push(assistantMsg);
      callbacks.onAssistantMessage?.(assistantMsg);
      await hooks.emit("message:assistant", { message: assistantMsg });

      // Clear streaming text, update messages in state
      setAppState((s) => ({
        ...s,
        currentStreamText: "",
        messages: [...messages],
      }));

      // If no tool calls, this turn is the final one
      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
        callbacks.onTurnComplete?.(turnCount);
        break;
      }

      // Execute tool calls
      for (const tc of assistantMsg.tool_calls) {
        callbacks.onToolCallStart?.(tc.function.name);
      }

      const toolResults = await executeToolCalls({
        toolCalls: assistantMsg.tool_calls,
        messages,
        config,
        registry,
        hooks,
        getAppState,
        setAppState,
        abortSignal,
        log: log.child("tools"),
      });

      // Append tool results to conversation
      for (const result of toolResults) {
        messages.push(result);
      }

      // Update state with tool results
      setAppState((s) => ({ ...s, messages: [...messages] }));

      for (const tc of assistantMsg.tool_calls) {
        callbacks.onToolCallEnd?.(tc.function.name);
      }

      callbacks.onTurnComplete?.(turnCount);

      // Loop continues — model will see tool results and respond
    }

    if (turnCount >= config.maxTurns) {
      log.warn(`Query loop hit max turns (${config.maxTurns})`);
    }

    await hooks.emit("query:after", { messages: [...messages], turnCount });
    return { messages, turnCount, aborted: false };
  } catch (err) {
    const errorMsg =
      err instanceof Error ? err.message : String(err);

    // Don't treat abort as error
    if (abortSignal.aborted) {
      return { messages, turnCount, aborted: true };
    }

    log.error(`Query loop error: ${errorMsg}`);
    callbacks.onError?.(
      err instanceof Error ? err : new Error(errorMsg)
    );

    setAppState((s) => ({ ...s, lastError: errorMsg }));

    await hooks.emit("query:after", { messages: [...messages], turnCount, error: errorMsg });
    return { messages, turnCount, aborted: false, error: errorMsg };
  } finally {
    // Always restore input state
    setAppState((s) => ({
      ...s,
      isStreaming: false,
      inputMode: "normal",
      currentStreamText: "",
      activeToolName: null,
      activeToolCalls: [],
      turnStartedAt: null,
      turnTokenCount: 0,
    }));
  }
}
