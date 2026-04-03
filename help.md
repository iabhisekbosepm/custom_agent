# Comprehensive Exploration Report: CustomAgents UI, State, and Communication Systems

A thorough architectural analysis of the CustomAgents codebase.

---

## 1. State Management Architecture

### Core Store Implementation (`src/state/store.ts`)

- **Pattern:** Minimal reactive store compatible with React's `useSyncExternalStore`
- **Interface:** `Store<T>` with `get()`, `set(updater)`, `subscribe(listener)`
- **Immutability:** Uses updater functions `(prev: T) => T`
- **Change detection:** Skips notification if `next === state` (reference equality)

### AppState Shape (`src/state/AppStateStore.ts`)

Complete state structure (16 fields):

```typescript
interface AppState {
  messages: Message[];                  // Full conversation history
  isStreaming: boolean;                 // True while LLM streams
  currentStreamText: string;           // Accumulated stream buffer (cleared on turn end)
  model: string;                       // Active model identifier
  inputMode: "normal" | "busy";        // Input blocking state
  activeToolName: string | null;       // Currently executing tool
  lastError: string | null;            // Last query loop error
  pendingDiffs: DiffResult[];          // Diffs awaiting user review
  focusOwner: FocusOwner;              // "input" | "diffViewer" | "autocomplete"
  briefMode: boolean;                  // Compact output mode
  planMode: boolean;                   // Planning mode (exploration before execution)
  activeToolCalls: ActiveToolCall[];   // All tool calls with status tracking
  activeAgentTaskId: string | null;    // Current agent's parent task ID
  agentToolCalls: ActiveToolCall[];    // Real-time agent tool activity
  turnStartedAt: number | null;        // Turn timing for status display
  turnTokenCount: number;              // Token counter for current turn
}
```

### React Integration (`src/state/AppState.tsx`)

- **Provider:** `AppStateProvider` wraps tree with store via Context
- **Hooks:**
  - `useAppState()` — reactive state reader (re-renders on any change)
  - `useSetAppState()` — state updater (stable reference, safe in deps)

---

## 2. UI Component Architecture

### Top-Level Component Flow

```
App.tsx (RuntimeContext provider)
  └─> AppStateProvider (state context)
      └─> REPL.tsx (main screen)
          ├─> MessageList (conversation history)
          ├─> ActivityDisplay (streaming + tool activity)
          │    ├─> AgentTaskList (when agent active)
          │    └─> TeamDisplay (when team active)
          ├─> DiffDisplay (side-by-side diff viewer)
          └─> InputBar (user input with autocomplete)
```

### Component Details

#### `App.tsx` (Entry Component)

- **Purpose:** Runtime dependency injection via Context
- **Provides:** `RuntimeContextValue` with:

```typescript
{
  config, registry, hooks, log, abortController,
  memory, sessionPersistence, sessionId,
  taskManager, agentRouter, skillRegistry, teamManager
}
```

- **Access:** Components use `useRuntime()` hook

#### `REPL.tsx` (Main Screen)

- **Features:**
  - Box-drawn header (version, model, cwd)
  - Slash command handling (`/compact`, `/diff`, others via `SkillRegistry`)
  - File reference expansion (`@file` tokens via `resolveFileReferences()`)
  - Input submission → query loop orchestration
  - Session transcript persistence after each turn
- **State dependencies:** All AppState fields
- **Key behavior:** Sets `inputMode: "busy"` during query execution

#### `ActivityDisplay.tsx` (Live Activity)

- **Shows when:** `isStreaming` or `activeToolCalls.length > 0`
- **Components:**
  - Tool call lines (spinner for running, circle for pending)
  - Nested `<AgentTaskList>` when `agent_spawn` tool is running
  - `<TeamDisplay>` when team is active
  - Live streaming text with cursor
  - Status bar: "Thinking..." or "Running {tool}..." + elapsed time + token count
- **Updates:** Every 80ms via spinner animation

#### `AgentTaskList.tsx` (Agent Subtasks)

- **Triggers:** When `activeAgentTaskId` is set and agent creates subtasks via `task_create`
- **Displays:**
  - Real-time agent tool calls (from `state.agentToolCalls`)
  - Child tasks from TaskManager (via `useAgentTasks` hook)
  - Icons: `■` (completed), `■` (running), `□` (pending)
- **Update mechanism:** TaskManager subscription + reactive store

#### `InputBar.tsx` (User Input)

- **Features:**
  - Character-by-character input handling (no native input element)
  - Fuzzy file autocomplete for `@` tokens
  - Tab/arrows to navigate suggestions, Enter to accept
  - Ctrl+U to clear line
  - Disabled when `focusOwner !== "input"` or `inputMode === "busy"`
- **State mutations:** Changes `focusOwner` when autocomplete activates

#### `MessageList.tsx` (Conversation)

- **Renders:** System (hidden), User, Assistant, Tool result messages
- **Formatting:**
  - User: blue bold "You:"
  - Assistant: magenta bold "Assistant:", yellow dim tool call annotations
  - Tool: yellow dim truncated results (200 char max)

#### `DiffDisplay.tsx` (Diff Viewer)

- **Triggers:** When `pendingDiffs.length > 0` and `focusOwner === "diffViewer"`
- **Navigation:** `j`/`k` (scroll), `g`/`G` (top/bottom), `Space`/`Ctrl+D`/`U` (page), `Tab` (next diff), `q` (dismiss)
- **Multi-diff:** Tab bar when multiple diffs, per-diff scroll state tracking
- **Line budget:** `termRows - 6` visible lines (reserves space for chrome)

---

## 3. Lifecycle & Initialization

### Boot Sequence (`src/entrypoints/cli.tsx`)

```
main()
  → initialize() (async, init.ts)
  → render(<App />) (Ink)
  → setLoggerMuted(false)
  → instance.waitUntilExit()
```

### Subsystem Initialization (`src/entrypoints/init.ts`)

Order of operations:

1. Load environment (`loadEnvConfig()` from `.env`)
2. Build config (`AppConfig` with defaults)
3. Create logger (stderr-based, scoped)
4. Generate session ID (`crypto.randomUUID()`)
5. Initialize memory store (`.custom-agents/memory/`)
6. Initialize session persistence (`.custom-agents/sessions/`)
7. Create app state store (`createAppStateStore(model)`)
8. Create hook manager (`HookManager`)
9. Create task manager (`TaskManager`)
10. Register agents (built-in + persisted custom agents)
11. Register skills (built-in skills)
12. Register tools (all 35+ tools)
13. Create team manager (`TeamManager`)
14. Register team tools
15. Activate plugins (`PluginManager.activateAll()`)
16. Create service manager (`ServiceManager`)
17. Install shutdown handlers (SIGINT/SIGTERM)
18. Emit `session:start` hook

### Shutdown Sequence (`src/utils/shutdown.ts`)

- **Handlers:** Run in reverse (LIFO) order
- **Steps** (from `init.ts`):
  1. Save session transcript
  2. Emit `session:end` hook
  3. Stop all services (`serviceManager.stopAll()`)
  4. Deactivate plugins (`pluginManager.deactivateAll()`)
  5. Abort all operations (`abortController.abort()`)

---

## 4. Query Loop & Agent Execution

### Core Query Loop (`src/query/query.ts`)

**Algorithm:**

1. Prepend system prompt (with memory context if present)
2. Emit `query:before` hook
3. Set state: `isStreaming=true`, `inputMode=busy`
4. **Loop** (up to `config.maxTurns`):
   1. Compact messages if approaching `contextBudget` (~80%)
   2. Stream LLM response (update `currentStreamText` on each token)
   3. Append assistant message to `messages[]`
   4. If no `tool_calls`: **break**
   5. Execute tool calls via orchestration
   6. Append tool results to `messages[]`
   7. Continue loop
5. Emit `query:after` hook
6. **Finally:** restore `inputMode=normal`, clear streaming flags

### Tool Orchestration (`src/tools/orchestration.ts`)

**Execution Flow:**

1. Build `activeToolCalls[]` (all pending)
2. Update state with `activeToolCalls`
3. For each tool call:
   1. Mark tool as `"running"` in `activeToolCalls`
   2. Emit `tool:before` hook
   3. Parse + validate arguments (Zod)
   4. Execute `tool.call(input, context)`
   5. Append `ToolResultMessage`
   6. Emit `tool:after` hook
   7. Mark tool as `"completed"`
4. Clear `activeToolName` and `activeToolCalls`
5. Return all `ToolResultMessages`

### Agent Execution (`src/agents/runAgent.ts`)

**Agent Spawn Flow:**

1. Create TaskManager task (parent task for agent)
2. Call `onTaskCreated(taskId)` → sets `state.activeAgentTaskId`
3. Build agent config (custom `systemPrompt`, `maxTurns`, tool restrictions)
4. Build agent messages (mode-specific: forked copies parent context)
5. Create isolated store for agent (separate `AppState`)
6. Subscribe to agent store → forward `activeToolCalls` to parent via `onAgentActivity`
7. Run query loop with agent-scoped config + store
8. Extract final assistant text as output
9. Transition task to `completed`/`failed`
10. Emit `agent:end` hook
11. Clear `state.activeAgentTaskId` + `agentToolCalls`

> **Key insight:** Agents run in isolated stores — their internal state doesn't pollute the parent, but tool activity is forwarded for UI display.

---

## 5. Task System Architecture

### TaskManager (`src/tasks/TaskManager.ts`)

- **Storage:** In-memory `Map<string, TaskState>`
- **Lifecycle:** `create()` → `transition(to: TaskStatus)` with validation
- **Subscription:** Listeners notified on every state change
- **Filtering:** `list({ status?, parentId? })`
- **Dependencies:** `addDependency()`, `isReady()`, `claim()`, `listClaimable()`

### TaskState (`src/tasks/Task.ts`)

```typescript
interface TaskState {
  id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  description: string;
  createdAt: number;
  updatedAt: number;
  parentId?: string;            // For hierarchical task trees
  output?: string;              // Final result (completed)
  error?: string;               // Error message (failed)
  metadata: Record<string, unknown>;
  blockedBy: string[];          // Task IDs that must complete first
  blocks: string[];             // Task IDs waiting on this one
  claimedBy: string | null;     // Agent ID that claimed this task
  claimedAt: number | null;     // Timestamp of claim
}
```

**Valid Transitions:**

- `pending` → `[running, cancelled]`
- `running` → `[completed, failed, cancelled]`
- `completed` / `failed` / `cancelled` → (terminal)

---

## 6. Hook System

### HookManager (`src/hooks/index.ts`)

- **Pattern:** Event emitter with typed payloads
- **Events:**
  - `session:start` | `session:end`
  - `query:before` | `query:after`
  - `tool:before` | `tool:after`
  - `message:assistant`
  - `agent:start` | `agent:end`
  - `context:compact`
  - `team:create` | `team:start`
  - `team:teammate:start` | `team:teammate:end`
  - `team:message` | `team:complete`
- **Error handling:** Hooks are fire-and-forget (errors logged, never thrown)
- **Multi-handler:** Multiple handlers can register for the same event

---

## 7. Plugin System

### PluginManager (`src/plugins/index.ts`)

**Capabilities:**

- Plugins can contribute: tools, hooks, lifecycle functions
- `activate(log)` → returns cleanup function
- `deactivateAll()` → runs cleanups in reverse order

```typescript
interface PluginDefinition {
  name: string;
  version: string;
  description: string;
  tools?: Tool[];
  hooks?: Record<string, HookHandler>;
  activate?(log: Logger): Promise<(() => void) | void>;
}
```

---

## 8. Key Utilities

### Logger (`src/utils/logger.ts`)

- **Output:** stderr (doesn't interfere with Ink's stdout rendering)
- **Scoping:** `logger.child(scope)` creates hierarchical loggers
- **Muting:** Global `setLoggerMuted(flag)` for clean startup

### ID Generation (`src/utils/id.ts`)

- **Implementation:** `crypto.randomUUID()` (native)

### Shutdown (`src/utils/shutdown.ts`)

- **Signals:** SIGINT, SIGTERM
- **Handlers:** LIFO execution (reverse registration order)
- **Guard:** `shutdownInProgress` flag prevents re-entry

---

## 9. Message Types (`src/types/messages.ts`)

OpenAI-compatible wire format:

```typescript
type Message =
  | SystemMessage   { role: "system";    content: string }
  | UserMessage     { role: "user";      content: string }
  | AssistantMessage { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | ToolResultMessage { role: "tool";    tool_call_id: string; content: string }

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };  // JSON-encoded
}
```

---

## 10. Agent Teams (Implemented)

Parallel multi-agent coordination system:

### State Extensions

- `activeTeams: TeamUIState[]` in AppState — tracks all running teams

### UI Components

- `TeamDisplay.tsx` — real-time parallel agent status with spinner/done/fail icons
- `useTeamState.ts` — React hook bridging TeamManager → AppState

### Tools

| Tool | Purpose |
|------|---------|
| `team_create` | Create + run a team (blocks until all teammates finish) |
| `team_status` | Check team/teammate progress |
| `team_message` | Send message to a teammate or broadcast |
| `team_check_messages` | Read inbox messages |
| `team_task_claim` | Claim an unclaimed, unblocked task |

### Hooks

- `team:create` | `team:start` | `team:teammate:start` | `team:teammate:end` | `team:message` | `team:complete`

### Core Architecture

- **TeamManager** — orchestrator: create, run (parallel via `Promise.allSettled()`), shutdown
- **Mailbox** — in-memory inter-agent messaging (send, receive, peek, broadcast)
- **Scoped ToolRegistry** — each teammate gets only their agent's allowed tools + team tools
- **Shared TaskManager** — teammates and lead see the same tasks, coordinated via dependencies and atomic claiming

---

## File Reference

### State

- `src/state/AppStateStore.ts`
- `src/state/store.ts`
- `src/state/AppState.tsx`

### Components

- `src/components/App.tsx`
- `src/components/ActivityDisplay.tsx`
- `src/components/AgentTaskList.tsx`
- `src/components/TeamDisplay.tsx`
- `src/components/InputBar.tsx`
- `src/components/MessageList.tsx`
- `src/components/ToolCallStatus.tsx`
- `src/components/DiffDisplay.tsx`

### Screens

- `src/screens/REPL.tsx`

### Entry Points

- `src/entrypoints/cli.tsx`
- `src/entrypoints/init.ts`

### Core Systems

- `src/query/query.ts`
- `src/tools/orchestration.ts`
- `src/agents/runAgent.ts`
- `src/agents/AgentRouter.ts`
- `src/agents/AgentDefinition.ts`
- `src/tools/AgentSpawnTool/AgentSpawnTool.ts`

### Teams

- `src/teams/TeamManager.ts`
- `src/teams/TeamTypes.ts`
- `src/teams/Mailbox.ts`
- `src/teams/buildTeammateRegistry.ts`
- `src/teams/teammatePrompt.ts`
- `src/teams/index.ts`

### Tasks & Hooks

- `src/tasks/TaskManager.ts`
- `src/tasks/Task.ts`
- `src/hooks/index.ts`
- `src/hooks/useAgentTasks.ts`
- `src/hooks/useTeamState.ts`
- `src/hooks/useSpinner.ts`

### Utilities

- `src/utils/logger.ts`
- `src/utils/id.ts`
- `src/utils/shutdown.ts`

### Types

- `src/types/messages.ts`
- `src/types/config.ts`

### Plugins

- `src/plugins/index.ts`

---

## Out of Scope

- Multi-process / tmux split panes (keep everything in-process)
- File-based team config persistence
- Session resumption for teams


"Per-agent multi-model orchestration" to the CustomAgents codebase. Here's the full context:

       Requirements

       1. Per-agent model assignment — Different agents can use different models (e.g., explorer uses gpt-4o-mini, coder uses claude-opus)
       2. Custom agent support — Custom agents (created via /agent or agent_create) can also specify a model
       3. Config file — A .custom-agents/models.json file defining model profiles
