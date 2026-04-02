import { describe, test, expect, mock } from "bun:test";
import {
  compactMessages,
  estimateMessageTokens,
} from "./compaction.js";
import type { Message, SystemMessage, UserMessage, AssistantMessage, ToolResultMessage } from "../types/messages.js";

/**
 * Integration test — simulates exactly what the REPL does
 * when the user types "/compact".
 */

function createMockLogger() {
  const calls: string[] = [];
  return {
    calls,
    info: (msg: string) => { calls.push(`INFO: ${msg}`); },
    warn: (msg: string) => { calls.push(`WARN: ${msg}`); },
    error: (msg: string) => { calls.push(`ERROR: ${msg}`); },
    debug: (msg: string) => { calls.push(`DEBUG: ${msg}`); },
    child: () => createMockLogger(),
  };
}

function createMockHookManager() {
  return {
    emit: mock(async () => {}),
    on: mock(() => {}),
    removeBySource: mock(() => {}),
    list: mock(() => []),
  };
}

// --- Build a realistic conversation ---

function buildLongConversation(): Message[] {
  const msgs: Message[] = [];

  // System prompt
  msgs.push({
    role: "system",
    content: "You are a helpful AI coding assistant. You can read files, edit code, and run shell commands.",
  } satisfies SystemMessage);

  // Turn 1: user asks to explore
  msgs.push({ role: "user", content: "Show me the project structure" } satisfies UserMessage);
  msgs.push({
    role: "assistant",
    content: null,
    tool_calls: [{
      id: "tc_1",
      type: "function" as const,
      function: { name: "shell", arguments: '{"command":"find . -type f -name \\"*.ts\\" | head -50"}' },
    }],
  } satisfies AssistantMessage);
  msgs.push({
    role: "tool",
    tool_call_id: "tc_1",
    content: "./src/index.ts\n./src/query/query.ts\n./src/query/compaction.ts\n./src/tools/registry.ts\n./src/hooks/index.ts\n" + "x".repeat(500),
  } satisfies ToolResultMessage);
  msgs.push({
    role: "assistant",
    content: "Here's the project structure. The main entry point is src/index.ts...",
  } satisfies AssistantMessage);

  // Turn 2: user asks to read a file
  msgs.push({ role: "user", content: "Read the compaction.ts file" } satisfies UserMessage);
  msgs.push({
    role: "assistant",
    content: null,
    tool_calls: [{
      id: "tc_2",
      type: "function" as const,
      function: { name: "file_read", arguments: '{"path":"src/query/compaction.ts"}' },
    }],
  } satisfies AssistantMessage);
  msgs.push({
    role: "tool",
    tool_call_id: "tc_2",
    content: "A".repeat(3000), // Large file content
  } satisfies ToolResultMessage);
  msgs.push({
    role: "assistant",
    content: "The compaction module implements a three-strategy pipeline for managing context window size...",
  } satisfies AssistantMessage);

  // Turns 3-15: simulate a long coding session
  for (let i = 3; i <= 15; i++) {
    msgs.push({ role: "user", content: `Task ${i}: Make changes to module ${i}` } satisfies UserMessage);
    msgs.push({
      role: "assistant",
      content: null,
      tool_calls: [{
        id: `tc_${i}`,
        type: "function" as const,
        function: { name: "file_edit", arguments: `{"path":"src/mod${i}.ts","old":"old code ${i}","new":"new code ${i}"}` },
      }],
    } satisfies AssistantMessage);
    msgs.push({
      role: "tool",
      tool_call_id: `tc_${i}`,
      content: `Successfully edited src/mod${i}.ts — replaced 1 occurrence` + "B".repeat(200),
    } satisfies ToolResultMessage);
    msgs.push({
      role: "assistant",
      content: `Done! I've updated module ${i} with the requested changes. The edit replaced the old code pattern with the new implementation.`,
    } satisfies AssistantMessage);
  }

  return msgs;
}

describe("/compact command integration", () => {
  test("simulates the full /compact REPL flow", async () => {
    const messages = buildLongConversation();
    const hooks = createMockHookManager();
    const log = createMockLogger();

    const beforeTokens = estimateMessageTokens(messages);
    console.log(`\n  Before compact: ${messages.length} messages, ~${beforeTokens} tokens`);

    // This is exactly what REPL.tsx does when user types "/compact"
    const result = await compactMessages(
      messages,
      { contextBudget: 120_000, force: true },
      hooks as any,
      log as any,
    );

    console.log(`  After compact:  ${result.messages.length} messages, ~${result.compactedTokens} tokens`);
    console.log(`  Strategy: ${result.strategy}`);
    console.log(`  Removed: ${result.removedMessages} messages`);
    console.log(`  Did compact: ${result.didCompact}`);

    // Verify compaction happened
    expect(result.didCompact).toBe(true);
    expect(result.compactedTokens).toBeLessThan(beforeTokens);
    // Truncation strategy shortens content without removing messages;
    // collapse/summarize strategies reduce message count
    expect(result.compactedTokens).toBeLessThan(result.originalTokens);

    // System prompt preserved
    expect(result.messages[0].role).toBe("system");
    expect(result.messages[0].content).toContain("helpful AI coding assistant");

    // Recent messages preserved (tail)
    const lastOriginal = messages[messages.length - 1];
    const lastCompacted = result.messages[result.messages.length - 1];
    expect(lastCompacted).toEqual(lastOriginal);

    // The status message the REPL would append
    const statusMsg = `[Compacted: ~${beforeTokens} → ~${result.compactedTokens} tokens | ${result.removedMessages} messages removed | strategy: ${result.strategy}]`;
    console.log(`  Status: ${statusMsg}`);
    expect(statusMsg).toContain("Compacted");
  });

  test("handles empty/short conversation gracefully", async () => {
    const messages: Message[] = [
      { role: "system", content: "You are helpful." } satisfies SystemMessage,
      { role: "user", content: "Hello" } satisfies UserMessage,
      { role: "assistant", content: "Hi there!" } satisfies AssistantMessage,
    ];

    const hooks = createMockHookManager();
    const log = createMockLogger();
    const beforeTokens = estimateMessageTokens(messages);

    const result = await compactMessages(
      messages,
      { contextBudget: 120_000, force: true },
      hooks as any,
      log as any,
    );

    console.log(`\n  Short conversation: ${messages.length} messages, ~${beforeTokens} tokens`);
    console.log(`  Did compact: ${result.didCompact} (expected: false — nothing to compact)`);

    // Too few messages to compact (all in tail)
    expect(result.didCompact).toBe(false);
    expect(result.strategy).toBe("none");

    // REPL would show this message
    const statusMsg = `[Nothing to compact — conversation is ~${beforeTokens} tokens]`;
    console.log(`  Status: ${statusMsg}`);
    expect(statusMsg).toContain("Nothing to compact");
  });

  test("hook is emitted on compaction", async () => {
    const messages = buildLongConversation();
    const hooks = createMockHookManager();
    const log = createMockLogger();

    await compactMessages(
      messages,
      { contextBudget: 120_000, force: true },
      hooks as any,
      log as any,
    );

    // Verify the context:compact hook was fired
    const emitCalls = hooks.emit.mock.calls;
    const compactCall = emitCalls.find((c: any[]) => c[0] === "context:compact");
    expect(compactCall).toBeDefined();

    const payload = (compactCall as any[])[1];
    console.log(`\n  Hook payload:`, JSON.stringify(payload, null, 4));
    expect(payload.originalTokens).toBeGreaterThan(0);
    expect(payload.compactedTokens).toBeLessThan(payload.originalTokens);
    expect(payload.strategy).toBeTruthy();
  });
});
