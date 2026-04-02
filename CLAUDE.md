# CLAUDE.md — CustomAgents

## Project Overview

**CustomAgents** is a terminal-based AI coding assistant runtime. It provides specialized AI agents (explorer, coder, reviewer) that help developers explore, understand, generate, and review code. The app runs in the terminal using React + Ink and communicates with OpenAI-compatible APIs.

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
├── agents/          # Agent system (explorer, coder, reviewer)
├── components/      # Ink terminal UI components (App, InputBar, MessageList, etc.)
├── entrypoints/     # cli.tsx (launch), init.ts (subsystem initialization)
├── hooks/           # Typed lifecycle event system
├── memory/          # File-based persistent memory (project/user/session scope)
├── persistence/     # Session transcript persistence
├── plugins/         # Extensibility layer (tools, hooks, skills)
├── query/           # Core AI query loop (query.ts, streamOpenAI.ts, compaction.ts)
├── screens/         # Terminal screens (REPL)
├── services/        # Background services
├── skills/          # User-invocable slash commands
├── state/           # Application state management (store, AppStateStore)
├── tasks/           # Task tracking system (Task, TaskManager)
├── tools/           # Tool-use architecture
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
Three built-in agents, each with different capabilities and constraints:

| Agent    | Purpose                  | Allowed Tools                  | Max Turns |
|----------|--------------------------|--------------------------------|-----------|
| explorer | Codebase exploration     | grep, glob, file_read           | 8         |
| coder    | Code gen & editing       | grep, glob, file_read, file_edit, file_write | 15 |
| reviewer | Code review & analysis   | grep, glob, file_read, shell   | 10        |

### Tool System (`src/tools/`)

All tools implement the `Tool<TInput>` interface (`src/tools/Tool.ts`):
- `name`, `description`, `parameters` (Zod schema), `isReadOnly`, `call()`
- Receive a `ToolUseContext` with messages, config, state, abort signal, and logger

**Built-in tools:**
- **File operations**: `FileReadTool`, `FileWriteTool`, `FileEditTool`
- **Search**: `GrepTool`, `GlobTool`, `ToolSearchTool`
- **Shell**: `ShellTool`
- **Agent orchestration**: `AgentSpawnTool`
- **Task management**: `TaskCreateTool`, `TaskUpdateTool`, `TaskGetTool`, `TaskListTool`, `TaskOutputTool`, `TaskStopTool`
- **Web**: `WebSearchTool`, `WebFetchTool`
- **Mode control**: `EnterPlanModeTool`, `ExitPlanModeTool`
- **UI/UX**: `BriefTool`, `ConfigTool`, `REPLTool`, `SleepTool`
- **Code quality**: `LSPTool`, `NotebookEditTool`
- **Other**: `AskUserQuestionTool`, `SendMessageTool`, `SyntheticOutputTool`, `TodoWriteTool`

Tools are registered via `ToolRegistry` (`src/tools/registry.ts`), which converts them to OpenAI function-calling format using `zod-to-json-schema`.

### State Management (`src/state/`)
- `AppStateStore` / `AppStore`: Centralized immutable state with updater pattern
- `AppState`: Tracks streaming, input mode, active tools, messages, errors

### Hook/Event System (`src/hooks/`)
Typed lifecycle events: `session:start/end`, `query:before/after`, `tool:before/after`, `message:assistant`

### Memory & Persistence
- **Memory** (`src/memory/`): File-based key-value memory at project/user/session scope
- **Persistence** (`src/persistence/`): Saves conversation transcripts for session resumption

### Plugin System (`src/plugins/`)
Plugins can contribute new tools, hooks, and skills.

### Skills / Slash Commands (`src/skills/`)
User-invocable commands: `/explain`, `/commit`, `/status`, `/find`

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
- **Context compaction** (`src/query/compaction.ts`) uses LLM summarization when budget is exceeded
- **Graceful shutdown** via `src/utils/shutdown.ts` (SIGINT, SIGTERM)
- **Strict TypeScript** — no `any`, use `esModuleInterop`, `forceConsistentCasingInFileNames`
- **Tests** use `bun test` — colocated `*.test.ts` next to source files
- **Diff utilities** in `src/utils/diff.ts` — used for rendering file edits
