# Kanban Benchmark Results

**Date:** 2026-04-03
**Runtime:** Bun 1.3.8
**Platform:** Darwin 25.3.0 (macOS)
**Test file:** `benchmark/KanbanStore.benchmark.ts`
**Result:** 15 pass, 0 fail (247ms total)

---

## Suite 1: KanbanStore Operations at Scale

Measures core store operations with increasing board sizes (each card has 3 tasks). Every operation does a full `readFile -> JSON.parse -> modify -> JSON.stringify -> writeFile` cycle.

### getSummary

Called on every agent spawn to inject board state into the system prompt.

| Board Size | Avg (ms) | Min (ms) | P95 (ms) | Max (ms) | Iters |
|------------|----------|----------|----------|----------|-------|
| 10 cards   | 0.09     | 0.04     | 0.41     | 0.41     | 20    |
| 50 cards   | 0.14     | 0.09     | 0.79     | 0.79     | 20    |
| 100 cards  | 0.17     | 0.15     | 0.27     | 0.27     | 20    |
| 500 cards  | 0.74     | 0.65     | 1.24     | 1.24     | 20    |

### listByColumn

Filters cards by column after loading the full board from disk.

| Board Size | Avg (ms) | Min (ms) | P95 (ms) | Max (ms) | Iters |
|------------|----------|----------|----------|----------|-------|
| 10 cards   | 0.05     | 0.03     | 0.44     | 0.44     | 20    |
| 50 cards   | 0.08     | 0.07     | 0.09     | 0.09     | 20    |
| 100 cards  | 0.14     | 0.13     | 0.16     | 0.16     | 20    |
| 500 cards  | 0.64     | 0.59     | 0.90     | 0.90     | 20    |

### addCard

Loads board, appends a card, writes back to disk.

| Board Size | Avg (ms) | Min (ms) | P95 (ms) | Max (ms) | Iters |
|------------|----------|----------|----------|----------|-------|
| 10 cards   | 0.10     | 0.09     | 0.13     | 0.13     | 20    |
| 50 cards   | 0.19     | 0.18     | 0.22     | 0.22     | 20    |
| 100 cards  | 0.36     | 0.31     | 0.69     | 0.69     | 20    |
| 500 cards  | 1.40     | 1.31     | 1.68     | 1.68     | 20    |

### moveCard

Loads board, finds card, updates column, writes back.

| Board Size | Avg (ms) | Min (ms) | P95 (ms) | Max (ms) | Iters |
|------------|----------|----------|----------|----------|-------|
| 10 cards   | 0.11     | 0.07     | 0.32     | 0.32     | 20    |
| 50 cards   | 0.23     | 0.17     | 0.75     | 0.75     | 20    |
| 100 cards  | 0.32     | 0.29     | 0.40     | 0.40     | 20    |
| 500 cards  | 1.40     | 1.30     | 1.90     | 1.90     | 20    |

---

## Suite 2: formatBoard Rendering (Pure CPU)

No disk I/O — operates on in-memory `KanbanBoard` objects. Isolates CPU formatting cost.

### formatBoard

| Board Size | Avg (ms) | Min (ms) | P95 (ms) | Max (ms) | Iters |
|------------|----------|----------|----------|----------|-------|
| 10 cards   | 0.01     | 0.01     | 0.02     | 0.05     | 100   |
| 50 cards   | 0.03     | 0.02     | 0.03     | 0.07     | 100   |
| 100 cards  | 0.06     | 0.05     | 0.07     | 0.10     | 100   |
| 500 cards  | 0.29     | 0.26     | 0.33     | 0.82     | 50    |

### formatCardDetail

| Task Count | Avg (ms) | Min (ms) | P95 (ms) | Max (ms) | Iters |
|------------|----------|----------|----------|----------|-------|
| 5 tasks    | 0.00     | 0.00     | 0.01     | 0.03     | 100   |
| 20 tasks   | 0.01     | 0.00     | 0.01     | 0.03     | 100   |
| 50 tasks   | 0.01     | 0.00     | 0.02     | 0.39     | 100   |

### Output Size Scaling

Verifies output grows linearly (not quadratically) with board size.

| Board Size | Output Size (chars) |
|------------|---------------------|
| 10 cards   | 2,454               |
| 50 cards   | 11,522              |
| 100 cards  | 22,842              |
| 200 cards  | 45,997              |

Scaling ratios (ideal = 1.0): **0.94, 0.99, 1.01** -- linear growth confirmed.

---

## Suite 3: Scoped Registry Building

Benchmarks the registry construction that happens for every solo and team agent spawn.

### buildTeammateRegistry

| Agent    | Tools | Avg (ms) | Min (ms) | P95 (ms) | Max (ms) | Iters |
|----------|-------|----------|----------|----------|----------|-------|
| Explorer | 12    | 0.00     | 0.00     | 0.01     | 0.01     | 100   |
| Coder    | 18    | 0.00     | 0.00     | 0.00     | 0.01     | 100   |

### toOpenAITools (zodToJsonSchema per tool)

| Tools | Avg (ms) | Min (ms) | P95 (ms) | Max (ms) | Iters |
|-------|----------|----------|----------|----------|-------|
| 21    | 0.02     | 0.01     | 0.06     | 0.14     | 100   |

---

## Suite 4: End-to-End Agent Startup Simulation

Simulates the full `runAgent()` code path: `getSummary()` + `buildTeammateRegistry()` + system prompt concat + `toOpenAITools()`.

### Single Agent Startup

| Board Size | Avg (ms) | Min (ms) | P95 (ms) | Max (ms) | Iters |
|------------|----------|----------|----------|----------|-------|
| 10 cards   | 0.05     | 0.04     | 0.07     | 0.07     | 20    |
| 50 cards   | 0.10     | 0.09     | 0.11     | 0.11     | 20    |
| 100 cards  | 0.16     | 0.15     | 0.19     | 0.19     | 20    |

### Team Spawn (5 agents via Promise.allSettled)

| Board Size | Avg (ms) | Min (ms) | P95 (ms) | Max (ms) | Iters |
|------------|----------|----------|----------|----------|-------|
| 10 cards   | 0.17     | 0.14     | 0.21     | 0.21     | 10    |
| 50 cards   | 0.60     | 0.38     | 1.15     | 1.15     | 10    |
| 100 cards  | 0.73     | 0.67     | 0.88     | 0.88     | 10    |

---

## Suite 5: Rapid Sequential Operations

Simulates realistic agent behavior -- multiple rapid kanban tool calls during execution.

### 50 toggleTask Calls (sequential)

| Metric          | Value    |
|-----------------|----------|
| Avg per-op      | 0.12 ms  |
| Min             | 0.08 ms  |
| P95             | 0.20 ms  |
| Max             | 0.26 ms  |
| **Total wall time** | **6.25 ms** |

### 20 addCard Calls (board growth 0 -> 20)

| Metric           | Value    |
|------------------|----------|
| Avg per-op       | 0.08 ms  |
| First 5 avg      | 0.10 ms  |
| Last 5 avg       | 0.09 ms  |
| **Degradation ratio** | **0.86x** (no degradation) |

### Interleaved Operations (10 rounds on 20-card board)

Each round: addCard + addTask + toggleTask + moveCard + getSummary.

| Operation   | Avg (ms) | Min (ms) | P95 (ms) | Max (ms) |
|-------------|----------|----------|----------|----------|
| addCard     | 0.16     | 0.10     | 0.61     | 0.61     |
| addTask     | 0.12     | 0.10     | 0.16     | 0.16     |
| toggleTask  | 0.13     | 0.11     | 0.15     | 0.15     |
| moveCard    | 0.11     | 0.09     | 0.14     | 0.14     |
| getSummary  | 0.06     | 0.05     | 0.07     | 0.07     |

**Total wall time for 10 rounds (50 ops):** 5.77 ms

---

## Key Observations

1. **All operations are well within thresholds.** Even at 500 cards, the heaviest operation (addCard/moveCard) averages ~1.4ms.
2. **Scaling is linear.** No quadratic blowups detected in any operation or output formatting.
3. **Agent startup overhead is negligible.** A single agent spawn adds ~0.16ms at 100 cards. A 5-agent team spawn adds ~0.73ms.
4. **No growth degradation.** The 20 addCard growth test shows a 0.86x ratio (last 5 vs first 5) -- no slowdown.
5. **Rapid sequential ops are fast.** 50 toggleTask calls complete in 6.25ms total. Interleaved 50 ops complete in 5.77ms.
6. **formatBoard is sub-millisecond.** Even at 500 cards, formatting averages 0.29ms (pure CPU).
7. **Registry building is instant.** `buildTeammateRegistry` and `toOpenAITools` are < 0.02ms combined.

## How to Run

```bash
# Run benchmarks only
bun test ./benchmark/KanbanStore.benchmark.ts

# Type-check benchmarks
bun x tsc --noEmit -p benchmark/tsconfig.json
```
