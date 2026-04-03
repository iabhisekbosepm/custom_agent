import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  KanbanStore,
  KANBAN_COLUMNS,
  type KanbanBoard,
  type KanbanCard,
  type KanbanTask,
  type KanbanColumn,
} from "../src/kanban/KanbanStore.js";
import { formatBoard, formatCardDetail } from "../src/tools/KanbanTool/formatBoard.js";
import { ToolRegistry } from "../src/tools/registry.js";
import { buildTeammateRegistry } from "../src/teams/buildTeammateRegistry.js";
import { ExplorerAgent, CoderAgent } from "../src/agents/builtinAgents.js";
import { z } from "zod";
import { rmSync, mkdirSync } from "fs";
import { join } from "path";

// ── Types ────────────────────────────────────────────────────────────────────

interface BenchmarkResult {
  name: string;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p95Ms: number;
  iterations: number;
  totalMs: number;
}

// ── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Generate a synthetic KanbanBoard with cards distributed across columns.
 * ~33% of tasks are marked done. Labels on every 4th card.
 */
function generateTestBoard(cardCount: number, tasksPerCard: number): KanbanBoard {
  const cards: KanbanCard[] = [];
  const now = Date.now();
  const priorities: Array<"low" | "medium" | "high"> = ["low", "medium", "high"];

  for (let i = 0; i < cardCount; i++) {
    const column = KANBAN_COLUMNS[i % KANBAN_COLUMNS.length];
    const tasks: KanbanTask[] = [];

    for (let j = 0; j < tasksPerCard; j++) {
      tasks.push({
        id: crypto.randomUUID(),
        title: `Task ${j + 1} for card ${i + 1}`,
        done: j % 3 === 0, // ~33% done
        createdAt: now - (cardCount - i) * 1000 - j,
      });
    }

    const card: KanbanCard = {
      id: crypto.randomUUID(),
      title: `Card ${i + 1}: ${column} feature work`,
      description: `Description for card ${i + 1} with details about the work to be done.`,
      column,
      priority: priorities[i % 3],
      tasks,
      createdAt: now - (cardCount - i) * 1000,
      updatedAt: now - (cardCount - i) * 500,
      labels: i % 4 === 0 ? ["feature", "sprint-1"] : undefined,
    };

    cards.push(card);
  }

  return { version: 1, projectName: "benchmark-project", cards };
}

/**
 * Timing harness: runs 2 warmup iterations then N measured iterations.
 * Accepts sync or async functions.
 */
async function measure(
  name: string,
  fn: () => unknown | Promise<unknown>,
  iterations: number,
): Promise<BenchmarkResult> {
  // Warmup
  for (let i = 0; i < 2; i++) {
    await fn();
  }

  const times: number[] = [];
  const totalStart = performance.now();

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }

  const totalMs = performance.now() - totalStart;
  times.sort((a, b) => a - b);

  const avgMs = times.reduce((s, t) => s + t, 0) / times.length;
  const minMs = times[0];
  const maxMs = times[times.length - 1];
  const p95Idx = Math.floor(times.length * 0.95);
  const p95Ms = times[Math.min(p95Idx, times.length - 1)];

  return { name, avgMs, minMs, maxMs, p95Ms, iterations, totalMs };
}

/**
 * Print benchmark results as an ASCII table.
 */
function printResultsTable(results: BenchmarkResult[]): void {
  const sep = "─".repeat(90);
  console.log(`\n${"=".repeat(90)}`);
  console.log("BENCHMARK RESULTS");
  console.log("=".repeat(90));
  console.log(
    `${"Name".padEnd(45)} ${"Avg (ms)".padStart(9)} ${"Min (ms)".padStart(9)} ${"P95 (ms)".padStart(9)} ${"Max (ms)".padStart(9)} ${"Iters".padStart(6)}`,
  );
  console.log(sep);

  for (const r of results) {
    console.log(
      `${r.name.padEnd(45)} ${r.avgMs.toFixed(2).padStart(9)} ${r.minMs.toFixed(2).padStart(9)} ${r.p95Ms.toFixed(2).padStart(9)} ${r.maxMs.toFixed(2).padStart(9)} ${String(r.iterations).padStart(6)}`,
    );
  }

  console.log("=".repeat(90));
}

/**
 * Soft assertion: prints warning when thresholds exceeded but never fails the test.
 * Prevents CI flakiness from machine load variance.
 */
function softAssert(result: BenchmarkResult, maxAvgMs: number, maxP95Ms: number): void {
  if (result.avgMs > maxAvgMs) {
    console.warn(
      `  ⚠ WARNING: "${result.name}" avg ${result.avgMs.toFixed(2)}ms exceeds threshold ${maxAvgMs}ms`,
    );
  }
  if (result.p95Ms > maxP95Ms) {
    console.warn(
      `  ⚠ WARNING: "${result.name}" p95 ${result.p95Ms.toFixed(2)}ms exceeds threshold ${maxP95Ms}ms`,
    );
  }
}

/**
 * Real tool names used in the production registry, for realistic mock setup.
 */
const MOCK_TOOL_NAMES = [
  "grep", "glob", "file_read", "file_write", "file_edit",
  "shell", "lsp_diagnostics", "notebook_edit", "repl",
  "web_search", "web_fetch", "tool_search",
  "task_create", "task_list", "task_get", "task_update", "task_output", "task_stop",
  "agent_spawn", "agent_create",
  "team_create", "team_status", "team_message", "team_check_messages", "team_task_claim",
  "kanban", "brief", "config", "sleep",
  "ask_user", "send_message", "synthetic_output",
  "enter_plan_mode", "exit_plan_mode", "todo_write",
];

/**
 * Create a ToolRegistry with lightweight mock tools matching real tool names.
 */
function buildMockBaseRegistry(toolCount: number): ToolRegistry {
  const registry = new ToolRegistry();

  for (let i = 0; i < toolCount && i < MOCK_TOOL_NAMES.length; i++) {
    registry.register({
      name: MOCK_TOOL_NAMES[i],
      description: `Mock ${MOCK_TOOL_NAMES[i]} tool for benchmarking`,
      parameters: z.object({}),
      isReadOnly: true,
      call: async () => ({ content: "mock", isError: false }),
    });
  }

  return registry;
}

// ── Test Suites ──────────────────────────────────────────────────────────────

const BENCH_DIR = join(import.meta.dir, "__benchmark_data__");

describe("Kanban Benchmarks", () => {
  let store: KanbanStore;

  beforeEach(() => {
    mkdirSync(BENCH_DIR, { recursive: true });
    store = new KanbanStore(BENCH_DIR);
  });

  afterEach(() => {
    rmSync(BENCH_DIR, { recursive: true, force: true });
  });

  // ── Suite 1: KanbanStore Operations at Scale ─────────────────────────────

  describe("Suite 1: KanbanStore Operations at Scale", () => {
    const sizes = [10, 50, 100, 500];
    const iterations = 20;

    test("getSummary scales with board size", async () => {
      const results: BenchmarkResult[] = [];

      for (const size of sizes) {
        const board = generateTestBoard(size, 3);
        await store.save(board);

        const result = await measure(
          `getSummary (${size} cards)`,
          () => store.getSummary(),
          iterations,
        );
        results.push(result);
      }

      printResultsTable(results);

      softAssert(results[0], 10, 15);   // 10 cards
      softAssert(results[3], 80, 120);  // 500 cards

      // Always pass
      expect(true).toBe(true);
    });

    test("listByColumn scales with board size", async () => {
      const results: BenchmarkResult[] = [];

      for (const size of sizes) {
        const board = generateTestBoard(size, 3);
        await store.save(board);

        const result = await measure(
          `listByColumn (${size} cards)`,
          () => store.listByColumn("in-progress"),
          iterations,
        );
        results.push(result);
      }

      printResultsTable(results);

      softAssert(results[0], 10, 15);
      softAssert(results[3], 80, 120);

      expect(true).toBe(true);
    });

    test("addCard scales with board size", async () => {
      const results: BenchmarkResult[] = [];

      for (const size of sizes) {
        const board = generateTestBoard(size, 3);
        await store.save(board);

        const result = await measure(
          `addCard (${size} existing cards)`,
          () => store.addCard({ title: "Benchmark card", priority: "low" }),
          iterations,
        );
        results.push(result);
      }

      printResultsTable(results);

      softAssert(results[0], 10, 15);
      softAssert(results[3], 100, 150);

      expect(true).toBe(true);
    });

    test("moveCard scales with board size", async () => {
      const results: BenchmarkResult[] = [];

      for (const size of sizes) {
        const board = generateTestBoard(size, 3);
        await store.save(board);
        const targetCardId = board.cards[0].id;

        const columns: KanbanColumn[] = ["planning", "in-progress", "review", "done", "backlog"];
        let colIdx = 0;

        const result = await measure(
          `moveCard (${size} cards)`,
          () => {
            const col = columns[colIdx % columns.length];
            colIdx++;
            return store.moveCard(targetCardId, col);
          },
          iterations,
        );
        results.push(result);
      }

      printResultsTable(results);

      softAssert(results[0], 10, 15);
      softAssert(results[3], 100, 150);

      expect(true).toBe(true);
    });
  });

  // ── Suite 2: formatBoard Rendering (Pure CPU) ────────────────────────────

  describe("Suite 2: formatBoard Rendering (Pure CPU)", () => {
    const sizes = [10, 50, 100, 500];

    test("formatBoard scales with board size", () => {
      const results: BenchmarkResult[] = [];

      for (const size of sizes) {
        const board = generateTestBoard(size, 3);
        const iters = size <= 100 ? 100 : 50;

        // measure() is async but formatBoard is sync — wrap synchronously
        const times: number[] = [];
        // Warmup
        for (let i = 0; i < 2; i++) formatBoard(board);

        const totalStart = performance.now();
        for (let i = 0; i < iters; i++) {
          const start = performance.now();
          formatBoard(board);
          times.push(performance.now() - start);
        }
        const totalMs = performance.now() - totalStart;

        times.sort((a, b) => a - b);
        const avgMs = times.reduce((s, t) => s + t, 0) / times.length;
        const p95Idx = Math.floor(times.length * 0.95);

        const result: BenchmarkResult = {
          name: `formatBoard (${size} cards)`,
          avgMs,
          minMs: times[0],
          maxMs: times[times.length - 1],
          p95Ms: times[Math.min(p95Idx, times.length - 1)],
          iterations: iters,
          totalMs,
        };
        results.push(result);
      }

      printResultsTable(results);

      softAssert(results[0], 2, 5);
      softAssert(results[3], 20, 40);

      expect(true).toBe(true);
    });

    test("formatCardDetail scales with task count", () => {
      const taskCounts = [5, 20, 50];
      const results: BenchmarkResult[] = [];

      for (const taskCount of taskCounts) {
        const board = generateTestBoard(1, taskCount);
        const card = board.cards[0];
        const iters = 100;

        const times: number[] = [];
        for (let i = 0; i < 2; i++) formatCardDetail(card);

        const totalStart = performance.now();
        for (let i = 0; i < iters; i++) {
          const start = performance.now();
          formatCardDetail(card);
          times.push(performance.now() - start);
        }
        const totalMs = performance.now() - totalStart;

        times.sort((a, b) => a - b);
        const avgMs = times.reduce((s, t) => s + t, 0) / times.length;
        const p95Idx = Math.floor(times.length * 0.95);

        results.push({
          name: `formatCardDetail (${taskCount} tasks)`,
          avgMs,
          minMs: times[0],
          maxMs: times[times.length - 1],
          p95Ms: times[Math.min(p95Idx, times.length - 1)],
          iterations: iters,
          totalMs,
        });
      }

      printResultsTable(results);
      expect(true).toBe(true);
    });

    test("formatBoard output size scales linearly", () => {
      const sizes2 = [10, 50, 100, 200];
      const outputs: Array<{ size: number; length: number }> = [];

      for (const size of sizes2) {
        const board = generateTestBoard(size, 3);
        const output = formatBoard(board);
        outputs.push({ size, length: output.length });
      }

      // Check that output grows roughly linearly (ratio should be ~constant)
      const ratios: number[] = [];
      for (let i = 1; i < outputs.length; i++) {
        const sizeRatio = outputs[i].size / outputs[i - 1].size;
        const lengthRatio = outputs[i].length / outputs[i - 1].length;
        ratios.push(lengthRatio / sizeRatio);
      }

      console.log("\nOutput size scaling:");
      for (const o of outputs) {
        console.log(`  ${String(o.size).padStart(4)} cards → ${o.length} chars`);
      }
      console.log(`  Ratios (should be ~1.0): ${ratios.map((r) => r.toFixed(2)).join(", ")}`);

      // Soft check: ratios should be between 0.5 and 2.0 for linear growth
      for (const ratio of ratios) {
        if (ratio < 0.5 || ratio > 2.0) {
          console.warn(`  ⚠ WARNING: Non-linear output scaling detected (ratio: ${ratio.toFixed(2)})`);
        }
      }

      expect(true).toBe(true);
    });
  });

  // ── Suite 3: Scoped Registry Building ────────────────────────────────────

  describe("Suite 3: Scoped Registry Building", () => {
    const iterations = 100;

    test("buildTeammateRegistry for ExplorerAgent", async () => {
      const baseRegistry = buildMockBaseRegistry(35);
      const teamToolNames = ["team_message", "team_check_messages", "team_task_claim"];

      const result = await measure(
        `buildTeammateRegistry (explorer, ${ExplorerAgent.allowedTools.length} tools)`,
        () => {
          buildTeammateRegistry(ExplorerAgent, baseRegistry, teamToolNames);
        },
        iterations,
      );

      printResultsTable([result]);
      softAssert(result, 1, 3);
      expect(true).toBe(true);
    });

    test("buildTeammateRegistry for CoderAgent", async () => {
      const baseRegistry = buildMockBaseRegistry(35);
      const teamToolNames = ["team_message", "team_check_messages", "team_task_claim"];

      const result = await measure(
        `buildTeammateRegistry (coder, ${CoderAgent.allowedTools.length} tools)`,
        () => {
          buildTeammateRegistry(CoderAgent, baseRegistry, teamToolNames);
        },
        iterations,
      );

      printResultsTable([result]);
      softAssert(result, 2, 5);
      expect(true).toBe(true);
    });

    test("toOpenAITools conversion", async () => {
      const baseRegistry = buildMockBaseRegistry(35);
      const teamToolNames = ["team_message", "team_check_messages", "team_task_claim"];
      const scopedRegistry = buildTeammateRegistry(CoderAgent, baseRegistry, teamToolNames);

      const result = await measure(
        `toOpenAITools (${scopedRegistry.list().length} tools)`,
        () => {
          scopedRegistry.toOpenAITools();
        },
        iterations,
      );

      printResultsTable([result]);
      softAssert(result, 5, 10);
      expect(true).toBe(true);
    });
  });

  // ── Suite 4: End-to-End Agent Startup Simulation ─────────────────────────

  describe("Suite 4: End-to-End Agent Startup Simulation", () => {
    const boardSizes = [10, 50, 100];
    const iterations = 20;

    test("single agent startup overhead", async () => {
      const baseRegistry = buildMockBaseRegistry(35);
      const teamToolNames = ["team_message", "team_check_messages", "team_task_claim"];
      const results: BenchmarkResult[] = [];

      for (const size of boardSizes) {
        const board = generateTestBoard(size, 3);
        await store.save(board);

        const result = await measure(
          `agent startup (${size} cards)`,
          async () => {
            // 1. getSummary (disk I/O)
            const summary = await store.getSummary();

            // 2. buildTeammateRegistry (in-memory)
            const scopedRegistry = buildTeammateRegistry(
              CoderAgent,
              baseRegistry,
              teamToolNames,
            );

            // 3. System prompt concatenation (string ops)
            const _systemPrompt =
              CoderAgent.systemPrompt +
              "\n\n" +
              (summary ? `## Current Project Board\n${summary}\n\n` : "") +
              "You are working as part of a team.";

            // 4. toOpenAITools conversion
            scopedRegistry.toOpenAITools();
          },
          iterations,
        );
        results.push(result);
      }

      printResultsTable(results);

      softAssert(results[0], 15, 25);  // 10 cards
      softAssert(results[2], 50, 80);  // 100 cards

      expect(true).toBe(true);
    });

    test("team spawn: 5 agents reading same board", async () => {
      const baseRegistry = buildMockBaseRegistry(35);
      const teamToolNames = ["team_message", "team_check_messages", "team_task_claim"];
      const agents = [ExplorerAgent, CoderAgent, ExplorerAgent, CoderAgent, ExplorerAgent];
      const results: BenchmarkResult[] = [];

      for (const size of boardSizes) {
        const board = generateTestBoard(size, 3);
        await store.save(board);

        const result = await measure(
          `team spawn 5 agents (${size} cards)`,
          async () => {
            // Simulates TeamManager.run() pattern: Promise.allSettled
            await Promise.allSettled(
              agents.map(async (agentDef) => {
                const summary = await store.getSummary();
                const scopedRegistry = buildTeammateRegistry(
                  agentDef,
                  baseRegistry,
                  teamToolNames,
                );
                const _systemPrompt =
                  agentDef.systemPrompt +
                  "\n\n" +
                  (summary ? `## Current Project Board\n${summary}\n\n` : "") +
                  "You are working as part of a team.";
                scopedRegistry.toOpenAITools();
              }),
            );
          },
          10, // fewer iterations — team spawn is heavier
        );
        results.push(result);
      }

      printResultsTable(results);

      softAssert(results[0], 30, 50);   // 10 cards
      softAssert(results[2], 100, 150); // 100 cards

      expect(true).toBe(true);
    });
  });

  // ── Suite 5: Rapid Sequential Operations ─────────────────────────────────

  describe("Suite 5: Rapid Sequential Operations", () => {
    test("50 toggleTask calls", async () => {
      // Create board with 10 cards × 5 tasks
      const board = generateTestBoard(10, 5);
      await store.save(board);

      const togglePairs: Array<{ cardId: string; taskId: string }> = [];
      for (const card of board.cards) {
        for (const task of card.tasks) {
          togglePairs.push({ cardId: card.id, taskId: task.id });
        }
      }
      // Take first 50
      const targets = togglePairs.slice(0, 50);

      const times: number[] = [];
      const totalStart = performance.now();

      for (const { cardId, taskId } of targets) {
        const start = performance.now();
        await store.toggleTask(cardId, taskId);
        times.push(performance.now() - start);
      }

      const totalMs = performance.now() - totalStart;
      times.sort((a, b) => a - b);

      const avgMs = times.reduce((s, t) => s + t, 0) / times.length;
      const p95Idx = Math.floor(times.length * 0.95);

      const result: BenchmarkResult = {
        name: "50 toggleTask sequential",
        avgMs,
        minMs: times[0],
        maxMs: times[times.length - 1],
        p95Ms: times[Math.min(p95Idx, times.length - 1)],
        iterations: times.length,
        totalMs,
      };

      printResultsTable([result]);
      console.log(`  Total wall time: ${totalMs.toFixed(2)}ms`);

      if (totalMs > 2000) {
        console.warn(`  ⚠ WARNING: 50 toggleTask calls took ${totalMs.toFixed(2)}ms (threshold: 2000ms)`);
      }

      expect(true).toBe(true);
    });

    test("20 addCard calls with growth tracking", async () => {
      const times: number[] = [];
      const totalStart = performance.now();

      for (let i = 0; i < 20; i++) {
        const start = performance.now();
        await store.addCard({ title: `Growth card ${i + 1}`, priority: "medium" });
        times.push(performance.now() - start);
      }

      const totalMs = performance.now() - totalStart;

      // Compare first 5 vs last 5 to detect non-linear scaling
      const first5Avg = times.slice(0, 5).reduce((s, t) => s + t, 0) / 5;
      const last5Avg = times.slice(15, 20).reduce((s, t) => s + t, 0) / 5;
      const degradation = last5Avg / first5Avg;

      times.sort((a, b) => a - b);
      const avgMs = times.reduce((s, t) => s + t, 0) / times.length;
      const p95Idx = Math.floor(times.length * 0.95);

      const result: BenchmarkResult = {
        name: "20 addCard (0→20 growth)",
        avgMs,
        minMs: times[0],
        maxMs: times[times.length - 1],
        p95Ms: times[Math.min(p95Idx, times.length - 1)],
        iterations: 20,
        totalMs,
      };

      printResultsTable([result]);
      console.log(`  First 5 avg: ${first5Avg.toFixed(2)}ms, Last 5 avg: ${last5Avg.toFixed(2)}ms`);
      console.log(`  Degradation ratio: ${degradation.toFixed(2)}x`);

      if (degradation > 3.0) {
        console.warn(`  ⚠ WARNING: Non-linear scaling detected — ${degradation.toFixed(2)}x slower at 20 cards vs start`);
      }

      expect(true).toBe(true);
    });

    test("interleaved operations on 20-card board", async () => {
      // Seed with 20 cards, each with 2 tasks
      const board = generateTestBoard(20, 2);
      await store.save(board);

      const opTimings: Record<string, number[]> = {
        addCard: [],
        addTask: [],
        toggleTask: [],
        moveCard: [],
        getSummary: [],
      };

      const rounds = 10;
      const totalStart = performance.now();

      for (let i = 0; i < rounds; i++) {
        // addCard
        let start = performance.now();
        const newCard = await store.addCard({
          title: `Interleaved card ${i}`,
          priority: "low",
        });
        opTimings.addCard.push(performance.now() - start);

        // addTask
        start = performance.now();
        const newTask = await store.addTask(newCard.id, `Interleaved task ${i}`);
        opTimings.addTask.push(performance.now() - start);

        // toggleTask
        start = performance.now();
        await store.toggleTask(newCard.id, newTask.id);
        opTimings.toggleTask.push(performance.now() - start);

        // moveCard
        start = performance.now();
        await store.moveCard(newCard.id, "in-progress");
        opTimings.moveCard.push(performance.now() - start);

        // getSummary
        start = performance.now();
        await store.getSummary();
        opTimings.getSummary.push(performance.now() - start);
      }

      const totalMs = performance.now() - totalStart;

      const results: BenchmarkResult[] = [];
      for (const [opName, times] of Object.entries(opTimings)) {
        const sorted = [...times].sort((a, b) => a - b);
        const avgMs = sorted.reduce((s, t) => s + t, 0) / sorted.length;
        const p95Idx = Math.floor(sorted.length * 0.95);

        results.push({
          name: `interleaved ${opName} (${rounds} rounds)`,
          avgMs,
          minMs: sorted[0],
          maxMs: sorted[sorted.length - 1],
          p95Ms: sorted[Math.min(p95Idx, sorted.length - 1)],
          iterations: rounds,
          totalMs: sorted.reduce((s, t) => s + t, 0),
        });
      }

      printResultsTable(results);
      console.log(`  Total wall time for ${rounds} rounds (5 ops each): ${totalMs.toFixed(2)}ms`);

      expect(true).toBe(true);
    });
  });
});
