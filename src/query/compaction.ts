import type {
  Message,
  AssistantMessage,
  ToolResultMessage,
  SystemMessage,
} from "../types/messages.js";
import type { Logger } from "../utils/logger.js";
import type { HookManager } from "../hooks/index.js";

/**
 * Rough token estimation. OpenAI's tokenizer averages ~4 chars/token for English
 * prose and code. This is intentionally conservative (overestimates slightly)
 * so we compact before actually hitting the limit.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/** Estimate total tokens for a message array. */
export function estimateMessageTokens(messages: Message[]): number {
  let total = 0;
  for (const msg of messages) {
    // Per-message overhead (~4 tokens for role, separators)
    total += 4;

    if (msg.role === "assistant") {
      if (msg.content) total += estimateTokens(msg.content);
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          // tool call overhead + function name + arguments
          total += 10;
          total += estimateTokens(tc.function.name);
          total += estimateTokens(tc.function.arguments);
        }
      }
    } else {
      total += estimateTokens(msg.content);
    }
  }
  return total;
}

/** The compaction threshold — trigger at 80% of budget. */
const COMPACTION_THRESHOLD = 0.8;

/** Minimum number of recent messages to always preserve. */
const MIN_PRESERVED_TAIL = 10;

/** Max chars for a tool result in compacted history. */
const TRUNCATED_TOOL_RESULT_CHARS = 200;

/** Max chars for a collapsed tool call summary. */
const COLLAPSED_SUMMARY_CHARS = 120;

export interface CompactionConfig {
  contextBudget: number;
  /** Skip threshold check and always compact. Used by /compact command. */
  force?: boolean;
}

export interface CompactionResult {
  messages: Message[];
  didCompact: boolean;
  originalTokens: number;
  compactedTokens: number;
  removedMessages: number;
  strategy: string;
}

/**
 * Context compaction pipeline. Run before each API call.
 *
 * Three strategies applied in order, stopping as soon as we're under budget:
 *
 * 1. TRUNCATE — Shorten long tool result contents in older messages.
 * 2. COLLAPSE — Replace old (assistant-with-tool-calls + tool-result) pairs
 *    with a single compact system note.
 * 3. SUMMARIZE — Drop oldest non-system messages entirely, replaced by a
 *    single "[Earlier conversation compacted]" marker.
 */
export async function compactMessages(
  messages: Message[],
  config: CompactionConfig,
  hooks: HookManager,
  log: Logger
): Promise<CompactionResult> {
  const originalTokens = estimateMessageTokens(messages);
  // Force mode targets 50% of budget for aggressive compaction
  const threshold = config.force
    ? config.contextBudget * 0.5
    : config.contextBudget * COMPACTION_THRESHOLD;

  // No compaction needed (unless forced)
  if (!config.force && originalTokens <= threshold) {
    return {
      messages,
      didCompact: false,
      originalTokens,
      compactedTokens: originalTokens,
      removedMessages: 0,
      strategy: "none",
    };
  }

  log.info(
    `Context compaction triggered: ~${originalTokens} tokens exceeds threshold ~${Math.round(threshold)}`
  );

  // Identify the system message (always index 0, always preserved)
  const systemMsg = messages[0]?.role === "system" ? messages[0] : null;
  const bodyMessages = systemMsg ? messages.slice(1) : [...messages];

  // Determine the preserved tail — always keep the last N messages
  const tailSize = Math.min(MIN_PRESERVED_TAIL, bodyMessages.length);
  const tail = bodyMessages.slice(-tailSize);
  let compactable = bodyMessages.slice(0, -tailSize);

  if (compactable.length === 0) {
    // Nothing to compact — all messages are in the preserved tail
    return {
      messages,
      didCompact: false,
      originalTokens,
      compactedTokens: originalTokens,
      removedMessages: 0,
      strategy: "none",
    };
  }

  let strategy = "";
  let removedCount = 0;

  // --- Strategy 1: TRUNCATE old tool results ---
  compactable = truncateToolResults(compactable);
  strategy = "truncate";

  let candidate = rebuild(systemMsg, compactable, tail);
  let candidateTokens = estimateMessageTokens(candidate);

  if (candidateTokens <= threshold) {
    removedCount = messages.length - candidate.length;
    await emitHook(hooks, originalTokens, candidateTokens, removedCount, strategy);
    log.info(
      `Compacted via truncation: ${originalTokens} -> ${candidateTokens} tokens`
    );
    return {
      messages: candidate,
      didCompact: true,
      originalTokens,
      compactedTokens: candidateTokens,
      removedMessages: removedCount,
      strategy,
    };
  }

  // --- Strategy 2: COLLAPSE tool call sequences ---
  compactable = collapseToolSequences(compactable);
  strategy = "collapse";

  candidate = rebuild(systemMsg, compactable, tail);
  candidateTokens = estimateMessageTokens(candidate);

  if (candidateTokens <= threshold) {
    removedCount = messages.length - candidate.length;
    await emitHook(hooks, originalTokens, candidateTokens, removedCount, strategy);
    log.info(
      `Compacted via collapse: ${originalTokens} -> ${candidateTokens} tokens`
    );
    return {
      messages: candidate,
      didCompact: true,
      originalTokens,
      compactedTokens: candidateTokens,
      removedMessages: removedCount,
      strategy,
    };
  }

  // --- Strategy 3: SUMMARIZE — progressively drop oldest messages ---
  strategy = "summarize";
  const summaryMarker: SystemMessage = {
    role: "system",
    content:
      "[Earlier conversation was compacted to fit context window. Key context may have been lost. If you need information from earlier, ask the user to repeat it.]",
  };

  // Drop messages from the front of compactable until under budget
  while (compactable.length > 0 && candidateTokens > threshold) {
    compactable.shift();
    removedCount++;
    candidate = rebuild(systemMsg, [summaryMarker, ...compactable], tail);
    candidateTokens = estimateMessageTokens(candidate);
  }

  // If still over budget after dropping all compactable, drop from tail too
  const finalTail = [...tail];
  while (finalTail.length > 2 && candidateTokens > threshold) {
    finalTail.shift();
    removedCount++;
    candidate = rebuild(systemMsg, [summaryMarker, ...compactable], finalTail);
    candidateTokens = estimateMessageTokens(candidate);
  }

  await emitHook(hooks, originalTokens, candidateTokens, removedCount, strategy);
  log.info(
    `Compacted via summarize: ${originalTokens} -> ${candidateTokens} tokens (dropped ${removedCount} messages)`
  );

  return {
    messages: candidate,
    didCompact: true,
    originalTokens,
    compactedTokens: candidateTokens,
    removedMessages: removedCount,
    strategy,
  };
}

// ---------- Helpers ----------

function rebuild(
  systemMsg: SystemMessage | null,
  body: Message[],
  tail: Message[]
): Message[] {
  const result: Message[] = [];
  if (systemMsg) result.push(systemMsg);
  result.push(...body, ...tail);
  return result;
}

/**
 * Strategy 1: Truncate tool result content in older messages.
 * Keeps the first N chars + a marker showing how much was cut.
 */
function truncateToolResults(messages: Message[]): Message[] {
  return messages.map((msg) => {
    if (msg.role !== "tool") return msg;

    if (msg.content.length <= TRUNCATED_TOOL_RESULT_CHARS) return msg;

    const truncated =
      msg.content.slice(0, TRUNCATED_TOOL_RESULT_CHARS) +
      `\n... [truncated: ${msg.content.length - TRUNCATED_TOOL_RESULT_CHARS} chars removed]`;

    return { ...msg, content: truncated } as ToolResultMessage;
  });
}

/**
 * Strategy 2: Collapse assistant(tool_calls) + tool result pairs
 * into a single compact assistant message summarizing what happened.
 */
function collapseToolSequences(messages: Message[]): Message[] {
  const result: Message[] = [];
  let i = 0;

  while (i < messages.length) {
    const msg = messages[i];

    // Look for an assistant message with tool_calls
    if (
      msg.role === "assistant" &&
      msg.tool_calls &&
      msg.tool_calls.length > 0
    ) {
      // Collect the following tool result messages that belong to this assistant turn
      const toolCallIds = new Set(msg.tool_calls.map((tc) => tc.id));
      const toolResults: ToolResultMessage[] = [];
      let j = i + 1;

      while (j < messages.length && messages[j].role === "tool") {
        const toolMsg = messages[j] as ToolResultMessage;
        if (toolCallIds.has(toolMsg.tool_call_id)) {
          toolResults.push(toolMsg);
        }
        j++;
      }

      // Build a collapsed summary
      const summaries = msg.tool_calls.map((tc) => {
        const result = toolResults.find((r) => r.tool_call_id === tc.id);
        const resultPreview = result
          ? result.content.slice(0, COLLAPSED_SUMMARY_CHARS).replace(/\n/g, " ")
          : "no result";
        let argPreview = "";
        try {
          const args = JSON.parse(tc.function.arguments);
          // Show the first key-value pair as context
          const firstKey = Object.keys(args)[0];
          if (firstKey) {
            const val = String(args[firstKey]).slice(0, 60);
            argPreview = ` ${firstKey}="${val}"`;
          }
        } catch {
          // skip
        }
        return `[${tc.function.name}${argPreview} -> ${resultPreview}]`;
      });

      // Replace the whole sequence with a compact assistant message
      const collapsedContent =
        (msg.content ? msg.content + "\n" : "") +
        summaries.join("\n");

      const collapsedMsg: AssistantMessage = {
        role: "assistant",
        content: collapsedContent,
      };

      result.push(collapsedMsg);
      i = j; // Skip past the tool results
      continue;
    }

    result.push(msg);
    i++;
  }

  return result;
}

async function emitHook(
  hooks: HookManager,
  originalTokens: number,
  compactedTokens: number,
  removedMessages: number,
  strategy: string
): Promise<void> {
  await hooks.emit("context:compact", {
    originalTokens,
    compactedTokens,
    removedMessages,
    strategy,
  });
}
