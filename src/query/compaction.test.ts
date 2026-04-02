import { describe, test, expect, mock } from "bun:test";
import {
  estimateTokens,
  estimateMessageTokens,
  compactMessages,
} from "../query/compaction.js";
import type { Message } from "../types/messages.js";

// --- Mock dependencies ---

function createMockLogger() {
  const calls: string[] = [];
  return {
    calls,
    info: (msg: string) => { calls.push(`INFO: ${msg}`); },
    warn: (msg: string) => { calls.push(`WARN: ${msg}`); },
    error: (msg: string) => { calls.push(`ERROR: ${msg}`); },
    debug: (msg: string) => { calls.push(`DEBUG: ${msg}`); },
    child: (name: string) => createMockLogger(),
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

// --- message factory helpers ---

function user(content: string): Message {
  return { role: "user", content };
}

function assistant(content: string | null, toolCalls?: any): Message {
  if (toolCalls) {
    return { role: "assistant", content, tool_calls: toolCalls };
  }
  return { role: "assistant", content };
}

function toolResult(toolCallId: string, content: string): Message {
  return { role: "tool", tool_call_id: toolCallId, content };
}

function system(content: string): Message {
  return { role: "system", content };
}

// ============ estimateTokens ============
describe("estimateTokens", () => {
  test("empty string returns 0", () => {
    expect(estimateTokens("")).toBe(0);
  });

  test("returns ceil(text.length / 3.5)", () => {
    expect(estimateTokens("a".repeat(7))).toBe(2);   // 7/3.5 = 2
    expect(estimateTokens("a".repeat(8))).toBe(3);   // 8/3.5 = 2.3 ceil=3
    expect(estimateTokens("hello world")).toBe(4);   // 11/3.5 = 3.14 ceil=4
  });

  test("handles long text", () => {
    const long = "a".repeat(10000);
    expect(estimateTokens(long)).toBe(Math.ceil(10000 / 3.5));
  });
});

// ============ estimateMessageTokens ============
describe("estimateMessageTokens", () => {
  test("empty array returns 0", () => {
    expect(estimateMessageTokens([])).toBe(0);
  });

  test("single user message gets 4 overhead + content", () => {
    const msgs: Message[] = [user("hello")];  // 5 chars
    // 4 (overhead) + ceil(5/3.5)=2 = 6
    expect(estimateMessageTokens(msgs)).toBe(6);
  });

  test("multiple messages accumulate tokens", () => {
    const msgs: Message[] = [user("hi"), user("bye")];
    // 4+1=5 each = 10 total
    expect(estimateMessageTokens(msgs)).toBe(10);
  });

  test("assistant with tool calls includes call overhead", () => {
    const msgs: Message[] = [
      assistant(null, [
        { id: "c1", type: "function" as const, function: { name: "grep", arguments: "{}" } },
      ]),
    ];
    // 4 (overhead) + 10 (call overhead) + ceil(4/3.5)=2 (func name "grep") + ceil(2/3.5)=1 (args)
    // = 4 + 10 + 2 + 1 = 17
    expect(estimateMessageTokens(msgs)).toBe(17);
  });
});

// ============ compactMessages ============
describe("compactMessages", () => {
  const config = (contextBudget: number, force = false) => ({
    contextBudget,
    force,
  });

  test("returns didCompact: false when under threshold", async () => {
    const msgs: Message[] = [system("s"), user("hi")];
    const hooks = createMockHookManager();
    const log = createMockLogger();

    // 80% of 120000 = 96000 — our tiny msg count is way under
    const result = await compactMessages(msgs, config(120000), hooks as any, log as any);
    expect(result.didCompact).toBe(false);
    expect(result.strategy).toBe("none");
  });

  test("triggers compaction when messages exceed threshold", async () => {
    // Build enough messages to exceed a tiny budget
    const systemMsg = system("You are a helpful assistant.");
    const body: Message[] = [];
    for (let i = 0; i < 200; i++) {
      body.push(user(`question ${i}?`));
      body.push(assistant(`answer ${i}`));
    }
    const msgs = [systemMsg, ...body];
    const totalTokens = estimateMessageTokens(msgs);

    // Set budget so 80% threshold is well above our count
    // Use a budget where threshold (80%) is tiny
    const threshold = 50; // 80% of this = 40
    const hooks = createMockHookManager();
    const log = createMockLogger();

    const result = await compactMessages(msgs, config(threshold * 10 / 8), hooks as any, log as any);
    expect(result.didCompact).toBe(true);
    expect(result.strategy).toBe("summarize");
    expect(result.originalTokens).toBe(totalTokens);
    expect(result.compactedTokens).toBeLessThan(result.originalTokens);
  });

  test("strategy 1 truncates long tool results", async () => {
    const systemMsg = system("sys");
    const longContent = "A".repeat(2000);

    // Need >10 body messages so some fall outside the preserved tail
    const msgs: Message[] = [systemMsg];
    // Add tool call with long result early
    msgs.push(
      user("run a tool"),
      assistant(null, [
        { id: "t1", type: "function" as const, function: { name: "grep", arguments: '{"pattern":"test"}' } },
      ]),
      toolResult("t1", longContent),
    );
    // Add enough follow-up messages to push tool result out of the preserved tail (10)
    for (let i = 0; i < 6; i++) {
      msgs.push(user(`follow up ${i}`));
      msgs.push(assistant(`reply ${i}`));
    }

    const hooks = createMockHookManager();
    const log = createMockLogger();

    // Budget chosen so truncation alone brings us under threshold:
    // Original: system + 3 (tool seq) + 12 (follow-ups) = 16 body msgs
    // The long tool result (2000 chars) ≈ 572 tokens. After truncation → ~200 chars ≈ 58 tokens.
    // That saves ~514 tokens. Set budget so 80% threshold sits between original and truncated.
    const originalTokens = estimateMessageTokens(msgs);
    const budget = Math.ceil((originalTokens - 200) / 0.8); // truncation should be just enough

    const result = await compactMessages(msgs, config(budget), hooks as any, log as any);
    expect(result.didCompact).toBe(true);
    expect(result.strategy).toBe("truncate");
  });

  test("strategy 2 collapses tool call sequences", async () => {
    const body: Message[] = [];
    for (let i = 0; i < 100; i++) {
      const callId = `c${i}`;
      body.push(assistant(null, [
        { id: callId, type: "function" as const, function: { name: "grep", arguments: `{"pattern":"x"}` } },
      ]));
      body.push(toolResult(callId, "result " + i));
    }

    const msgs: Message[] = [system("sys"), ...body];
    const hooks = createMockHookManager();
    const log = createMockLogger();

    // Calculate a budget where collapse brings us under threshold but truncation doesn't.
    // Tool results are short (<200 chars) so truncation has no effect.
    // Collapse turns each (assistant+tool) pair into a single assistant message.
    // Original: ~2800 tokens. After collapse of compactable region: ~1400 tokens.
    // Set budget so 80% threshold is between collapsed and original.
    const result = await compactMessages(msgs, config(2200), hooks as any, log as any);
    expect(result.didCompact).toBe(true);
    expect(result.strategy).toBe("collapse");
  });

  test("strategy 3 summarizes by dropping oldest messages", async () => {
    const body: Message[] = [];
    for (let i = 0; i < 100; i++) {
      body.push(user(`question ${i}`));
      body.push(assistant(`answer ${i}`));
    }
    // Force mode targets 50% of budget
    const msgs: Message[] = [system("You are helpful."), ...body];
    const hooks = createMockHookManager();
    const log = createMockLogger();

    const result = await compactMessages(msgs, config(100, true), hooks as any, log as any);
    expect(result.didCompact).toBe(true);
    // Should have inserted summary marker
    const hasSummary = result.messages.some(
      (m) => m.role === "system" && m.content.includes("compacted")
    );
    expect(hasSummary).toBe(true);
  });

  test("preserves system message after compaction", async () => {
    const body: Message[] = [];
    for (let i = 0; i < 100; i++) {
      body.push(user(`q${i}`));
      body.push(assistant(`a${i}`));
    }
    const systemMsg = system("Critical system instructions!");
    const msgs = [systemMsg, ...body];
    const hooks = createMockHookManager();
    const log = createMockLogger();

    const result = await compactMessages(msgs, config(50, true), hooks as any, log as any);

    expect(result.messages[0]).toEqual(systemMsg);
  });

  test("preserves minimum tail messages", async () => {
    const body: Message[] = [];
    for (let i = 0; i < 50; i++) {
      body.push(user(`q${i}`));
      body.push(assistant(`a${i}`));
    }
    const msgs: Message[] = [system("sys"), ...body];
    const hooks = createMockHookManager();
    const log = createMockLogger();

    const result = await compactMessages(msgs, config(50, true), hooks as any, log as any);

    // Last messages should still be in the result (tail preservation)
    const lastUser = body[body.length - 2]; // second to last (user before assistant)
    const lastAssistant = body[body.length - 1];

    const lastResultMsg = result.messages[result.messages.length - 1];
    expect(lastResultMsg).toEqual(lastAssistant);
  });

  test("force mode is more aggressive than normal mode", async () => {
    const body: Message[] = [];
    for (let i = 0; i < 100; i++) {
      body.push(user(`question number ${i} about the codebase`));
      body.push(assistant(`detailed answer number ${i} with context`));
    }
    const msgs: Message[] = [system("sys"), ...body];
    const hooks1 = createMockHookManager();
    const hooks2 = createMockHookManager();
    const log = createMockLogger();

    // Same budget for both. Normal targets 80%, force targets 50%.
    // Both will compact, but force mode compacts harder.
    const budget = 1200;
    const normalResult = await compactMessages(msgs, config(budget, false), hooks1 as any, log as any);
    const forceResult = await compactMessages(msgs, config(budget, true), hooks2 as any, log as any);

    // Both should compact
    expect(normalResult.didCompact).toBe(true);
    expect(forceResult.didCompact).toBe(true);
    // Force (50% threshold) should result in fewer tokens than normal (80% threshold)
    expect(normalResult.compactedTokens).toBeGreaterThan(forceResult.compactedTokens);
  });

  test("emits context:compact hook on successful compaction", async () => {
    const body: Message[] = [];
    for (let i = 0; i < 100; i++) {
      body.push(user(`q${i}`));
      body.push(assistant(`a${i}`));
    }
    const msgs: Message[] = [system("sys"), ...body];
    const hooks = createMockHookManager();
    const log = createMockLogger();

    await compactMessages(msgs, config(100), hooks as any, log as any);

    const emitCalls = (hooks as any).emit.mock.calls;
    expect(emitCalls.length).toBeGreaterThan(0);
    expect(emitCalls.some((call: any[]) => call[0] === "context:compact")).toBe(true);
  });

  test("nothing to compact when only preserved tail exists", async () => {
    const msgs: Message[] = [system("s"), user("a"), assistant("b")];
    const hooks = createMockHookManager();
    const log = createMockLogger();

    const result = await compactMessages(msgs, config(1, true), hooks as any, log as any);
    expect(result.didCompact).toBe(false);
    expect(result.strategy).toBe("none");
  });
});
