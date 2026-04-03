# CLAUDE.md — CustomAgents

## Project Overview

**CustomAgents** is a terminal-based AI coding assistant runtime. It provides specialized AI agents (explorer, coder, reviewer) that help developers explore, understand, generate, and review code. Agents can work individually or as **parallel teams** coordinated via an in-memory mailbox and shared task system. The app runs in the terminal using React + Ink and communicates with OpenAI-compatible APIs.

## Tech Stack

| Layer       | Technology |
|-------------|------------|
| Runtime     | Bun        |
| Language    | TypeScript (strict, ESNext) |
| UI          | React 18 + Ink (terminal) |
| Validation  | Zod |
| LLM API     | OpenAI-compatible streaming (OpenRouter, OpenAI, Ollama, LM Studio) |

## Commands

```bash
bun run src/index.ts          # Start the app
bun --watch run src/index.ts  # Dev mode (hot reload)
bun test                      # Run tests
bun x tsc --noEmit            # Type check
```

## Project Structure

```
src/
├── agents/          # Agent system (explorer, coder, reviewer, custom agents)
├── components/      # Ink terminal UI components (App, InputBar, MessageList, TeamDisplay, etc.)
├── entrypoints/     # cli.tsx (launch), init.ts (subsystem initialization)
├── hooks/           # Typed lifecycle event system + React hooks (useTeamState, useAgentTasks)
├── memory/          # File-based persistent memory with in-memory cache (project/user/session scope)
├── persistence/     # Session transcript persistence
├── plugins/         # Extensibility layer (tools, hooks, skills)
├── query/           # Core AI query loop (query.ts, streamOpenAI.ts, compaction.ts)
├── screens/         # Terminal screens (REPL)
├── services/        # Background services
├── skills/          # User-invocable slash commands
├── state/           # Application state management (store, AppStateStore)
├── tasks/           # Task tracking with dependencies + atomic claiming
├── kanban/          # Persistent Kanban board (KanbanStore, cards, sub-tasks, board formatting)
├── teams/           # Agent Teams (parallel multi-agent coordination, mailbox, scoped registries)
├── tools/           # 35+ built-in tools
├── types/           # Shared types (config, messages)
└── utils/           # Utilities (logger, id, env, shutdown, diff, fileResolver)
```

## Core Architecture

### Query Loop (`src/query/query.ts`)
The engine of the assistant. On each turn:
1. Compacts context if approaching token budget (default: 120K)
2. Streams LLM response via OpenAI-compatible API
3. If tool calls present: executes tools via orchestration, appends results, loops
4. If no tool calls: turn is complete

### Agent System (`src/agents/`)
Five built-in agents, each with different capabilities and constraints:

| Agent      | Purpose                    | Key Tools                                       | Max Turns |
|------------|----------------------------|-------------------------------------------------|-----------|
| explorer   | Codebase exploration       | grep, glob, file_read, shell, web_search/fetch, tool_search, task_*, kanban | 8 |
| coder      | Code gen & editing         | grep, glob, file_read/write/edit, shell, lsp, repl, notebook_edit, web_*, task_*, todo_write, kanban | 15 |
| reviewer   | Code review & analysis     | grep, glob, file_read, shell, lsp, web_search/fetch, tool_search, task_*, kanban | 10 |
| documenter | Documentation generation   | grep, glob, file_read/write/edit, shell, web_*, tool_search, task_*, todo_write, kanban | 12 |
| architect  | Architecture & design      | grep, glob, file_read, shell, lsp, web_*, tool_search, task_*, todo_write, kanban | 12 |

Custom agents can be created via `/agent` or `agent_create` tool, persisted in `.custom-agents/agents.json`.
Custom skills can be created via `/skill` or `skill_create` tool, persisted in `.custom-agents/skills.json`.

### Agent Teams (`src/teams/`)
Parallel multi-agent coordination system:

- **TeamManager** (`TeamManager.ts`) — orchestrator: create, run (via `Promise.allSettled()`), shutdown, subscribe
- **Mailbox** (`Mailbox.ts`) — in-memory inter-agent messaging (send, receive, peek, broadcast to "all")
- **Scoped registries** (`buildTeammateRegistry.ts`) — each teammate gets only their agent's allowed tools + team/task tools
- **Teammate prompt** (`teammatePrompt.ts`) — injects team context (roster, IDs, communication rules) into each agent's system prompt
- **Types** (`TeamTypes.ts`) — `TeamStatus`: forming → running → completed/failed/shutdown

Key design: single-process Bun event loop = no race conditions for `claim()`. Teammates share a global `TaskManager` for task coordination.

### Tool System (`src/tools/`)

All tools implement the `Tool<TInput>` interface (`src/tools/Tool.ts`):
- `name`, `description`, `parameters` (Zod schema), `isReadOnly`, `call()`
- Receive a `ToolUseContext` with messages, config, state, abort signal, and logger

**Built-in tools (35+):**
- **File operations**: `FileReadTool`, `FileWriteTool`, `FileEditTool`
- **Search**: `GrepTool`, `GlobTool`, `ToolSearchTool`
- **Shell**: `ShellTool`
- **Agent orchestration**: `AgentSpawnTool`, `AgentCreateTool`
- **Team coordination**: `TeamCreateTool`, `TeamStatusTool`, `TeamMessageTool`, `TeamCheckMessagesTool`, `TeamTaskClaimTool`
- **Task management**: `TaskCreateTool`, `TaskUpdateTool`, `TaskGetTool`, `TaskListTool`, `TaskOutputTool`, `TaskStopTool`
- **Skill management**: `SkillCreateTool`, `SkillListTool`
- **Kanban board**: `KanbanTool` (cards, sub-tasks, board management)
- **Web**: `WebSearchTool`, `WebFetchTool`
- **Mode control**: `EnterPlanModeTool`, `ExitPlanModeTool`
- **UI/UX**: `BriefTool`, `ConfigTool`, `REPLTool`, `SleepTool`
- **Code quality**: `LSPTool`, `NotebookEditTool`
- **Other**: `AskUserQuestionTool`, `SendMessageTool`, `SyntheticOutputTool`, `TodoWriteTool`

Tools are registered via `ToolRegistry` (`src/tools/registry.ts`), which converts them to OpenAI function-calling format using `zod-to-json-schema`. Factory pattern is used for tools needing runtime dependencies (task tools, team tools, agent tools).

### Task System (`src/tasks/`)
- **TaskState**: status (pending/running/completed/failed/cancelled), metadata, output/error
- **Dependencies**: `blockedBy: string[]`, `blocks: string[]` — auto-unblocked when blockers complete
- **Claiming**: `claim(taskId, agentId)` — atomic (single-threaded Bun = no races), returns null if already claimed/blocked
- **Helpers**: `addDependency()`, `isReady()`, `listClaimable()`

### State Management (`src/state/`)
- `AppStateStore` / `AppStore`: Centralized immutable state with updater pattern
- `AppState`: Tracks streaming, input mode, active tools, messages, errors, active teams, agent activity
- `activeTeams: TeamUIState[]` — real-time team progress for UI rendering

### Hook/Event System (`src/hooks/`)
Typed lifecycle events (16 total):
- **Session**: `session:start`, `session:end`
- **Query**: `query:before`, `query:after`
- **Tool**: `tool:before`, `tool:after`
- **Agent**: `agent:start`, `agent:end`, `message:assistant`
- **Context**: `context:compact`
- **Team**: `team:create`, `team:start`, `team:teammate:start`, `team:teammate:end`, `team:message`, `team:complete`

### Memory & Persistence
- **Memory** (`src/memory/`): File-based key-value memory at project/user/session scope with in-memory `Map` cache. `init()` creates directories on startup.
- **Persistence** (`src/persistence/`): Saves conversation transcripts for session resumption

### Plugin System (`src/plugins/`)
Plugins can contribute new tools, hooks, and skills.

### Skills / Slash Commands (`src/skills/`)
User-invocable commands: `/explain`, `/commit`, `/status`, `/find`, `/compact`, `/diff`, `/brief`, `/plan`, `/agent`, `/skill`, `/board`

Custom skills can be created via `/skill` or `skill_create` tool, persisted in `.custom-agents/skills.json`. Custom skills are always prompt-based (`type: "prompt"`) and user-invocable. The `CustomSkillStore` (`src/skills/customSkillStore.ts`) mirrors `CustomAgentStore` for disk persistence.

## Configuration

Load from `.env` (see `.env.example`):

```
OPENAI_API_KEY=sk-or-v1-your-key
OPENAI_BASE_URL=https://openrouter.ai/api/v1
MODEL=openrouter/auto
LOG_LEVEL=info
MAX_TURNS=20
CONTEXT_BUDGET=120000
```

## Key Patterns & Conventions

- **All imports use `.js` extension** — Bun resolves `.ts` files automatically with ES modules
- **Zod schemas** define all tool parameters; use `zod.infer` for TypeScript types
- **Tool call orchestration** is centralized in `src/tools/orchestration.ts`
- **Factory pattern** for tools needing runtime deps (e.g., `createTeamCreateTool(teamManager, config, registry)`)
- **Context compaction** (`src/query/compaction.ts`) uses three-stage pipeline: truncate → collapse → summarize
- **Graceful shutdown** via `src/utils/shutdown.ts` (SIGINT, SIGTERM, LIFO handler order)
- **Strict TypeScript** — no `any`, use `esModuleInterop`, `forceConsistentCasingInFileNames`
- **Tests** use `bun test` — colocated `*.test.ts` next to source files
- **Diff utilities** in `src/utils/diff.ts` — used for rendering file edits
- **Agents run in isolated stores** — internal state doesn't pollute parent, but tool activity is forwarded for UI
- **Both solo and team agents get scoped `ToolRegistry`** — only their agent's allowed tools + task + kanban tools
- **Kanban board** (`src/kanban/`) — persistent project board (`.custom-agents/kanban.json`) with columns: backlog → planning → in-progress → review → done. Sub-agents receive board summary + tracking prompts and update tasks in real-time via the `kanban` tool
