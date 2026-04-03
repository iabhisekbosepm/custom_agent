# CustomAgents -- Technical Documentation

> **Version:** 0.1.0
> **Runtime:** Bun
> **Language:** TypeScript (strict, ESNext)
> **UI:** React 18 + Ink (terminal)
> **LLM API:** OpenAI-compatible streaming (OpenRouter, OpenAI, Ollama, LM Studio)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Overview](#2-architecture-overview)
3. [Project Structure](#3-project-structure)
4. [Boot Sequence & Initialization](#4-boot-sequence--initialization)
5. [Configuration](#5-configuration)
6. [Core Query Loop](#6-core-query-loop)
7. [Tool System](#7-tool-system)
8. [Agent System](#8-agent-system)
9. [Agent Teams (Parallel Multi-Agent)](#9-agent-teams-parallel-multi-agent)
10. [Task System](#10-task-system)
11. [Hook / Event System](#11-hook--event-system)
12. [State Management](#12-state-management)
13. [Memory System](#13-memory-system)
14. [Persistence System](#14-persistence-system)
15. [Plugin System](#15-plugin-system)
16. [Service System](#16-service-system)
17. [Skill / Slash Command System](#17-skill--slash-command-system)
18. [Terminal UI Components](#18-terminal-ui-components)
19. [Utility Modules](#19-utility-modules)
20. [Data Flow Diagrams](#20-data-flow-diagrams)
21. [Complete File Reference](#21-complete-file-reference)
22. [Development Guide](#22-development-guide)

---

## 1. Project Overview

CustomAgents is a **terminal-based AI coding assistant runtime**. It provides specialized AI agents (explorer, coder, reviewer, documenter, architect, and user-defined agents) that help developers explore, understand, generate, document, design, and review code. The application runs entirely in the terminal using React + Ink for rendering and communicates with any OpenAI-compatible API for LLM inference.

### Key Capabilities

- **Interactive REPL** with streaming responses, tool-use visualization, and file autocomplete
- **Multi-agent orchestration** -- spawn sub-agents for specialized tasks or create teams for parallel work
- **30+ built-in tools** for file I/O, search, shell execution, web access, task management, and more
- **Context compaction** -- automatic token budget management with three-stage compaction
- **Persistent memory** at project, user, and session scopes
- **Session persistence** -- save and resume conversation transcripts
- **Plugin and skill extensibility** -- contribute tools, hooks, and slash commands
- **Side-by-side diff viewer** with vim-like keyboard navigation
- **Custom agent creation** -- define new agents from natural language that persist across sessions
- **Custom skill creation** -- define new slash commands from natural language that persist across sessions

### Dependencies

| Package | Purpose |
|---------|---------|
| `ink` (5.x) | Terminal React renderer |
| `react` (18.x) | Component model |
| `zod` (3.x) | Schema validation for tool parameters |
| `zod-to-json-schema` (3.x) | Convert Zod schemas to OpenAI function-calling format |
| `diff` (8.x) | Line-level diff computation |

---

## 2. Architecture Overview

```
                    +-----------+
                    |  Terminal  |
                    |   (Ink)   |
                    +-----+-----+
                          |
                    +-----v-----+
                    |    REPL    |  <-- screens/REPL.tsx
                    +-----+-----+
                          |
              +-----------+-----------+
              |                       |
        +-----v-----+          +-----v-----+
        |  InputBar  |          | MessageList|
        | (user I/O) |          | (history)  |
        +-----+------+          +-----------+
              |
              | user message
              v
    +-------------------+        +----------------+
    |   Query Loop      | <----> |  State Store   |
    | (query/query.ts)  |        | (AppStateStore)|
    +--------+----------+        +----------------+
             |
    +--------v----------+
    | Stream OpenAI API |
    | (streamOpenAI.ts) |
    +--------+----------+
             |
             v
    +-------------------+     +------------------+
    |  Tool Orchestrator| --> |  Tool Registry   |
    | (orchestration.ts)|     | (30+ tools)      |
    +--------+----------+     +------------------+
             |
    +--------v----------+
    |  Hook Manager     |  lifecycle events
    +-------------------+
```

### Core Flow

1. User types input in the terminal `InputBar`
2. REPL handles slash commands or sends to the **Query Loop**
3. Query Loop streams response from the LLM via `streamChatCompletion`
4. If the response contains tool calls, the **Tool Orchestrator** executes them
5. Tool results are appended to conversation and the loop continues
6. When no more tool calls, the final text is rendered in `MessageList`
7. Throughout, **AppState** drives reactive UI updates

---

## 3. Project Structure

```
src/
├── index.ts                    # Entry point: #!/usr/bin/env bun
├── entrypoints/
│   ├── cli.tsx                 # CLI argument parsing, Ink render launch
│   └── init.ts                 # Full initialization: config, stores, tools, agents
├── query/
│   ├── query.ts                # Core query loop engine
│   ├── queryTypes.ts           # QueryConfig, QueryCallbacks, QueryResult
│   ├── streamOpenAI.ts         # SSE streaming from OpenAI-compatible API
│   ├── compaction.ts           # Three-stage context compaction pipeline
│   ├── compaction.test.ts      # Compaction unit tests
│   └── compact-command.test.ts # /compact command integration tests
├── agents/
│   ├── AgentDefinition.ts      # AgentDefinition & AgentInstance types
│   ├── AgentRouter.ts          # Registry mapping agent names -> definitions
│   ├── builtinAgents.ts        # Explorer, Coder, Reviewer definitions
│   ├── runAgent.ts             # Agent spawning & isolated query loop execution
│   └── customAgentStore.ts     # Disk persistence for user-created agents
├── kanban/
│   ├── KanbanStore.ts          # Persistent kanban board (cards, tasks, columns)
│   └── KanbanStore.test.ts     # KanbanStore unit tests
├── teams/
│   ├── TeamTypes.ts            # Team, Teammate types and status enums
│   ├── Mailbox.ts              # In-memory inter-agent messaging
│   ├── TeamManager.ts          # Team lifecycle: create, parallel run, shutdown
│   ├── buildTeammateRegistry.ts# Scoped ToolRegistry per teammate
│   ├── teammatePrompt.ts       # System prompt addendum for team context
│   └── index.ts                # Barrel exports
├── tasks/
│   ├── Task.ts                 # TaskState, CreateTaskOptions, transitions
│   └── TaskManager.ts          # Task CRUD, dependencies, claiming, listeners
├── tools/
│   ├── Tool.ts                 # Tool<TInput> interface, ToolUseContext, ToolResult
│   ├── registry.ts             # ToolRegistry + OpenAI format conversion
│   ├── orchestration.ts        # executeToolCalls: parse, validate, execute, report
│   ├── shared/utils.ts         # Shared helpers: truncateOutput, formatTaskState, stripHtmlTags
│   ├── FileReadTool/           # Read file contents with line numbers
│   ├── FileWriteTool/          # Create or overwrite files
│   ├── FileEditTool/           # Targeted string replacement edits
│   ├── GrepTool/               # Regex search across files (ripgrep-style)
│   ├── GlobTool/               # File pattern matching
│   ├── ShellTool/              # Shell command execution with timeout
│   ├── AgentSpawnTool/         # Spawn a sub-agent (sync/blocking)
│   ├── AgentCreateTool/        # Create custom agent definitions
│   ├── TaskCreateTool/         # Create tasks with optional dependencies
│   ├── TaskListTool/           # List tasks with filters
│   ├── TaskGetTool/            # Get task by ID
│   ├── TaskUpdateTool/         # Update task status
│   ├── TaskOutputTool/         # Retrieve completed task output
│   ├── TaskStopTool/           # Cancel a task
│   ├── TeamCreateTool/         # Create + run agent teams (parallel)
│   ├── TeamMessageTool/        # Send messages via team mailbox
│   ├── TeamCheckMessagesTool/  # Read team mailbox inbox
│   ├── TeamStatusTool/         # Check team/teammate progress
│   ├── TeamTaskClaimTool/      # Atomically claim team tasks
│   ├── WebFetchTool/           # HTTP GET with HTML stripping
│   ├── WebSearchTool/          # DuckDuckGo web search
│   ├── AskUserQuestionTool/    # Prompt user for input
│   ├── SleepTool/              # Pause execution (max 30s)
│   ├── ToolSearchTool/         # Search tools by name/description
│   ├── TodoWriteTool/          # Append to persistent todo file
│   ├── NotebookEditTool/       # Edit Jupyter notebook cells
│   ├── LSPTool/                # TypeScript/ESLint diagnostics
│   ├── REPLTool/               # Execute code snippets
│   ├── ConfigTool/             # View current configuration
│   ├── BriefTool/              # Toggle compact output mode
│   ├── EnterPlanModeTool/      # Enter planning mode
│   ├── ExitPlanModeTool/       # Exit planning mode
│   ├── KanbanTool/             # Kanban board management (cards, tasks, columns)
│   ├── SkillCreateTool/        # Create custom slash command definitions
│   ├── SkillListTool/          # List all available skills
│   ├── SendMessageTool/        # Append system messages
│   └── SyntheticOutputTool/    # Return pre-formatted content
├── state/
│   ├── store.ts                # Generic reactive Store<T> (useSyncExternalStore compatible)
│   ├── AppStateStore.ts        # AppState interface, factory, TeamUI types
│   └── AppState.tsx            # React context provider + hooks
├── hooks/
│   ├── index.ts                # HookManager + HookPayloads type map
│   ├── useSpinner.ts           # Animated spinner hook (braille frames)
│   ├── useAgentTasks.ts        # Subscribe to agent subtask changes
│   └── useTeamState.ts         # Subscribe TeamManager -> AppState.activeTeams
├── components/
│   ├── App.tsx                 # Root component, RuntimeContext provider
│   ├── InputBar.tsx            # Text input with @file autocomplete
│   ├── MessageList.tsx         # Conversation history renderer
│   ├── ActivityDisplay.tsx     # Streaming/tool activity + team display
│   ├── AgentTaskList.tsx       # Agent subtask progress tree
│   ├── TeamDisplay.tsx         # Team progress visualization
│   ├── DiffDisplay.tsx         # Multi-file diff container
│   └── DiffViewer.tsx          # Side-by-side diff renderer
├── screens/
│   └── REPL.tsx                # Main screen: header, messages, activity, input
├── memory/
│   └── index.ts                # File-based key-value MemoryStore
├── persistence/
│   └── SessionPersistence.ts   # Session transcript save/load/list
├── plugins/
│   └── index.ts                # PluginManager + PluginDefinition
├── services/
│   └── index.ts                # ServiceManager for long-lived background services
├── skills/
│   ├── index.ts                # SkillRegistry + SkillDefinition
│   ├── builtinSkills.ts        # /explain, /commit, /status, /find, /skill, etc.
│   └── customSkillStore.ts     # Disk persistence for user-created skills
├── types/
│   ├── config.ts               # EnvConfigSchema (Zod), AppConfig interface
│   └── messages.ts             # OpenAI wire format message types
└── utils/
    ├── id.ts                   # UUID generation via crypto.randomUUID()
    ├── env.ts                  # Environment variable loading + validation
    ├── logger.ts               # Hierarchical logger (writes to stderr)
    ├── shutdown.ts             # SIGINT/SIGTERM graceful shutdown
    ├── diff.ts                 # Side-by-side diff computation
    ├── fileResolver.ts         # @file reference resolution + fuzzy autocomplete
    ├── toolArgsSummary.ts      # Tool argument summarization for UI
    ├── diff.test.ts            # Diff utility tests
    └── fileResolver.test.ts    # File resolver tests
```

---

## 4. Boot Sequence & Initialization

### Entry Point

```
src/index.ts  -->  src/entrypoints/cli.tsx  -->  src/entrypoints/init.ts
```

**`src/index.ts`** is a shebang script (`#!/usr/bin/env bun`) that calls `main()`.

**`src/entrypoints/cli.tsx`** handles `--help`/`--version` flags, then calls `initialize()` and renders the Ink `<App>` component.

**`src/entrypoints/init.ts`** (`initialize()`) performs the full boot sequence:

```
1. loadEnvConfig()           -- Validate environment variables via Zod
2. Build AppConfig           -- apiKey, baseUrl, model, systemPrompt, contextBudget
3. createLogger()            -- Hierarchical stderr logger
4. generateId()              -- Session ID (UUID)
5. new MemoryStore()         -- File-based persistent memory
6. new SessionPersistence()  -- Conversation transcript persistence
7. createAppStateStore()     -- Reactive UI state
8. new HookManager()         -- Lifecycle event system
9. new TaskManager()         -- Background task tracking
10. new AgentRouter()        -- Register built-in + custom agents
11. new SkillRegistry()      -- Register built-in slash commands
11a. new CustomSkillStore()  -- Load persisted custom skills
11b. new KanbanStore()       -- Persistent project kanban board
12. new ToolRegistry()       -- Register all 35+ tools (incl. skill_create, skill_list, kanban)
13. new TeamManager()        -- Parallel multi-agent coordination
14. new PluginManager()      -- Activate plugins
15. new ServiceManager()     -- Background service lifecycle
16. installShutdownHandlers()-- SIGINT/SIGTERM handlers
17. onShutdown(...)          -- Save session, emit hooks, abort, stop services
18. hooks.emit("session:start")
```

### Initialization Order (Dependency Graph)

```
EnvConfig --> AppConfig --> Logger
                       --> SessionId
                       --> MemoryStore
                       --> SessionPersistence
                       --> AppStateStore
                       --> HookManager
                       --> TaskManager
                       --> AgentRouter (builtinAgents + customAgents)
                       --> SkillRegistry (builtinSkills + customSkills)
                       --> CustomSkillStore (load persisted custom skills)
                       --> KanbanStore (persistent project board)
                       --> ToolRegistry (all tools, needs AgentRouter + TaskManager + SkillRegistry + KanbanStore)
                       --> TeamManager (needs AgentRouter + TaskManager + HookManager + ToolRegistry)
                       --> PluginManager
                       --> ServiceManager
                       --> ShutdownHandlers
```

---

## 5. Configuration

### Environment Variables (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | *(required)* | API key for OpenAI-compatible service |
| `OPENAI_BASE_URL` | `https://openrouter.ai/api/v1` | API endpoint base URL |
| `MODEL` | `openai/gpt-4o` | Model identifier |
| `LOG_LEVEL` | `info` | Logging level: debug, info, warn, error |
| `MAX_TURNS` | `20` | Maximum tool-use turns per query |
| `CONTEXT_BUDGET` | `120000` | Max estimated tokens before compaction triggers |

Validated at startup via Zod schema (`EnvConfigSchema` in `src/types/config.ts`). Bun auto-loads `.env` files.

### AppConfig (Runtime)

```typescript
interface AppConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  logLevel: "debug" | "info" | "warn" | "error";
  maxTurns: number;
  systemPrompt: string;
  contextBudget: number;
}
```

The `systemPrompt` is a comprehensive instruction set (~2KB) describing all available tools and workflows. It is built during initialization and can be extended by agents and teams.

---

## 6. Core Query Loop

**File:** `src/query/query.ts` -- `runQueryLoop()`

The query loop is the engine of the assistant. It implements a streaming tool-use loop that continues until the model produces a response without tool calls or the turn limit is reached.

### Algorithm

```
runQueryLoop(messages, config):
  1. Prepend system prompt (with optional memory context)
  2. Convert tools to OpenAI format
  3. Emit "query:before" hook
  4. Set AppState to streaming/busy

  LOOP (while turnCount < maxTurns):
    5. Check abort signal
    6. Run context compaction if approaching budget
    7. Stream chat completion from API
    8. Append assistant message to conversation
    9. Emit "message:assistant" hook

    IF no tool_calls:
      BREAK (turn complete)

    10. Execute tool calls via orchestration
    11. Append tool results to conversation
    12. Continue loop (model sees results)

  13. Emit "query:after" hook
  14. Restore UI state (not streaming, not busy)
  15. Return { messages, turnCount, aborted }
```

### Streaming (`src/query/streamOpenAI.ts`)

`streamChatCompletion()` uses the Fetch API with SSE parsing:

1. POST to `{baseUrl}/chat/completions` with `stream: true`
2. Parse SSE `data:` lines incrementally
3. Accumulate text content tokens (calling `onToken` for each)
4. Accumulate tool call fragments (id, name, arguments) across deltas
5. Return fully assembled `AssistantMessage`

Supports any OpenAI-compatible API (OpenRouter, OpenAI, Ollama, LM Studio).

### Context Compaction (`src/query/compaction.ts`)

Three strategies, applied in order until under budget (80% of `contextBudget`):

| Strategy | Method | Impact |
|----------|--------|--------|
| **Truncate** | Shorten old tool results to 200 chars | Minimal information loss |
| **Collapse** | Replace tool-call + result pairs with compact summaries | Moderate loss |
| **Summarize** | Drop oldest messages, insert compaction marker | Most aggressive |

Token estimation: `Math.ceil(text.length / 3.5)` (conservative approximation).

The `/compact` slash command forces compaction targeting 50% of budget.

---

## 7. Tool System

### Tool Interface (`src/tools/Tool.ts`)

```typescript
interface Tool<TInput = unknown> {
  name: string;                                    // Unique identifier
  description: string;                             // For the LLM
  parameters: z.ZodType<TInput, z.ZodTypeDef>;    // Zod schema
  isReadOnly: boolean;                             // Side-effect free?
  call(input: TInput, context: ToolUseContext): Promise<ToolResult>;
}

interface ToolUseContext {
  toolCall: ToolCall;
  messages: Message[];
  config: AppConfig;
  getAppState: () => AppState;
  setAppState: (updater: Updater<AppState>) => void;
  abortSignal: AbortSignal;
  log: Logger;
}

interface ToolResult {
  content: string;
  isError?: boolean;
}
```

### Tool Registry (`src/tools/registry.ts`)

`ToolRegistry` stores tools by name and converts them to OpenAI function-calling format via `zod-to-json-schema`.

```typescript
class ToolRegistry {
  register(tool: Tool): void
  get(name: string): Tool | undefined
  list(): Tool[]
  toOpenAITools(): OpenAIToolDefinition[]  // For API requests
}
```

### Tool Orchestration (`src/tools/orchestration.ts`)

`executeToolCalls()` processes all tool calls from one assistant turn:

1. Initialize all tool calls as "pending" in UI state
2. For each tool call sequentially:
   a. Mark as "running" in UI
   b. Look up tool in registry (error if not found)
   c. Emit `tool:before` hook
   d. Parse JSON arguments, validate against Zod schema
   e. Call `tool.call()` with context
   f. Emit `tool:after` hook
   g. Mark as "completed" in UI
3. Return `ToolResultMessage[]` for conversation

### Complete Tool Inventory

#### File Operations
| Tool | Name | Read-Only | Pattern | Description |
|------|------|-----------|---------|-------------|
| FileReadTool | `file_read` | Yes | Static | Read file contents with line numbers |
| FileWriteTool | `file_write` | No | Static | Create or fully replace a file |
| FileEditTool | `file_edit` | No | Static | Targeted string replacement edits |

#### Search
| Tool | Name | Read-Only | Pattern | Description |
|------|------|-----------|---------|-------------|
| GrepTool | `grep` | Yes | Static | Regex search across files |
| GlobTool | `glob` | Yes | Static | File pattern matching |
| ToolSearchTool | `tool_search` | Yes | Factory | Search available tools by name/description |

#### Shell
| Tool | Name | Read-Only | Pattern | Description |
|------|------|-----------|---------|-------------|
| ShellTool | `shell` | No | Static | Execute shell commands with 30s timeout |

#### Agent Orchestration
| Tool | Name | Read-Only | Pattern | Description |
|------|------|-----------|---------|-------------|
| AgentSpawnTool | `agent_spawn` | No | Factory | Spawn a sub-agent (blocks until done) |
| AgentCreateTool | `agent_create` | No | Factory | Define a new custom agent |

#### Skill Management
| Tool | Name | Read-Only | Pattern | Description |
|------|------|-----------|---------|-------------|
| SkillCreateTool | `skill_create` | No | Factory | Create a custom slash command that persists across sessions |
| SkillListTool | `skill_list` | Yes | Factory | List all available skills/slash commands |

#### Task Management
| Tool | Name | Read-Only | Pattern | Description |
|------|------|-----------|---------|-------------|
| TaskCreateTool | `task_create` | No | Factory | Create task with optional dependencies |
| TaskListTool | `task_list` | Yes | Factory | List tasks with status/parent filters |
| TaskGetTool | `task_get` | Yes | Factory | Get task details by ID |
| TaskUpdateTool | `task_update` | No | Factory | Transition task status |
| TaskOutputTool | `task_output` | Yes | Factory | Retrieve completed task output |
| TaskStopTool | `task_stop` | No | Factory | Cancel a task |

#### Team Coordination
| Tool | Name | Read-Only | Pattern | Description |
|------|------|-----------|---------|-------------|
| TeamCreateTool | `team_create` | No | Factory | Create + run agent team (blocks) |
| TeamMessageTool | `team_message` | No | Factory | Send messages via team mailbox |
| TeamCheckMessagesTool | `team_check_messages` | Yes | Factory | Read team inbox |
| TeamStatusTool | `team_status` | Yes | Factory | Check team/teammate progress |
| TeamTaskClaimTool | `team_task_claim` | No | Factory | Atomically claim shared tasks |

#### Web Access
| Tool | Name | Read-Only | Pattern | Description |
|------|------|-----------|---------|-------------|
| WebFetchTool | `web_fetch` | Yes | Static | HTTP GET with HTML tag stripping |
| WebSearchTool | `web_search` | Yes | Static | DuckDuckGo search |

#### Utility
| Tool | Name | Read-Only | Pattern | Description |
|------|------|-----------|---------|-------------|
| AskUserQuestionTool | `ask_user` | Yes | Static | Prompt user for input |
| SleepTool | `sleep` | Yes | Static | Pause execution (max 30s) |
| TodoWriteTool | `todo_write` | No | Static | Append to persistent todo file |

#### Code Quality
| Tool | Name | Read-Only | Pattern | Description |
|------|------|-----------|---------|-------------|
| NotebookEditTool | `notebook_edit` | No | Static | Edit Jupyter notebook cells |
| LSPTool | `lsp_diagnostics` | Yes | Static | TypeScript / ESLint diagnostics |
| REPLTool | `repl` | No | Static | Execute code snippets |

#### Config & Mode
| Tool | Name | Read-Only | Pattern | Description |
|------|------|-----------|---------|-------------|
| ConfigTool | `config_view` | Yes | Static | View configuration |
| BriefTool | `brief_toggle` | No | Static | Toggle compact output |
| EnterPlanModeTool | `enter_plan_mode` | No | Static | Enter planning mode |
| ExitPlanModeTool | `exit_plan_mode` | No | Static | Exit planning mode |

#### Kanban Board
| Tool | Name | Read-Only | Pattern | Description |
|------|------|-----------|---------|-------------|
| KanbanTool | `kanban` | No | Factory | Manage project kanban board (add/move/archive cards, add/toggle/remove tasks, list board) |

#### Communication
| Tool | Name | Read-Only | Pattern | Description |
|------|------|-----------|---------|-------------|
| SendMessageTool | `send_message` | No | Static | Append system messages |
| SyntheticOutputTool | `synthetic_output` | Yes | Static | Return pre-formatted content |

**Static vs Factory:** Static tools are plain objects. Factory tools are functions that close over runtime dependencies (e.g., `createTaskCreateTool(taskManager)`).

---

## 8. Agent System

### Agent Definition (`src/agents/AgentDefinition.ts`)

```typescript
interface AgentDefinition {
  name: string;              // "explorer", "coder", "reviewer", "documenter", "architect", or custom
  description: string;       // Shown when listing agents
  systemPrompt: string;      // Injected at conversation start
  allowedTools: string[];    // Empty = all tools
  maxTurns: number;          // Per-agent turn limit
  mode: AgentMode;           // "sync" | "background" | "forked"
  prepareMessages?: (msgs: Message[]) => Message[];
}
```

### Built-in Agents (`src/agents/builtinAgents.ts`)

| Agent | Key Tools | Max Turns | Purpose |
|-------|-----------|-----------|---------|
| **explorer** | grep, glob, file_read, shell, web_search/fetch, tool_search, task_*, kanban | 8 | Read-only codebase exploration |
| **coder** | grep, glob, file_read/write/edit, shell, lsp_diagnostics, repl, notebook_edit, web_*, task_*, todo_write, kanban | 15 | Code generation and editing |
| **reviewer** | grep, glob, file_read, shell, lsp_diagnostics, web_search/fetch, tool_search, task_*, kanban | 10 | Code review and analysis |
| **documenter** | grep, glob, file_read/write/edit, shell, web_search/fetch, tool_search, task_*, todo_write, kanban | 12 | Documentation generation (READMEs, API docs, changelogs) |
| **architect** | grep, glob, file_read, shell, lsp_diagnostics, web_search/fetch, tool_search, task_*, todo_write, kanban | 12 | Architecture analysis, design, and planning |

All agents have access to `tool_search` for discovering available tools, task management tools (`task_create`, `task_list`, `task_get`, `task_update`) for tracking work, and the `kanban` tool for real-time board progress updates.

### Agent Execution (`src/agents/runAgent.ts`)

`runAgent()` spawns an isolated query loop for an agent:

```
runAgent(definition, userMessage, config, registry, ...):
  1. Create a tracking task in TaskManager
  2. Build agent-scoped config (maxTurns, systemPrompt + task tracking + kanban tracking instructions)
  3. Build SCOPED ToolRegistry from agent's allowedTools + task tools + kanban tool
  4. Inject kanban board summary (from KanbanStore.getSummary()) into system prompt if available
  5. Build message array (system + optional parent messages + user message)
  6. Create ISOLATED AppState store for the agent
  7. Subscribe to agent's internal tool calls for parent UI forwarding
  8. Emit "agent:start" hook
  9. Run query loop with agent's scoped config + scoped registry
  10. Extract final assistant text as output
  11. Transition task to completed/failed
  12. Emit "agent:end" hook
```

Key design: solo agents now receive the same scoped tool registry as team agents — they only see the tools in their `allowedTools` plus task management and kanban tools. This prevents tool overload and ensures kanban tracking works reliably.

### Agent Router (`src/agents/AgentRouter.ts`)

Registry mapping agent names to definitions. Supports `register()`, `get()`, `list()`, `has()`, and `registerOrReplace()`.

### Custom Agent Store (`src/agents/customAgentStore.ts`)

Persists user-created agent definitions to `.custom-agents/agents.json`. Supports load, save, add (upsert), and remove operations. Custom agents are loaded during initialization and registered in the AgentRouter.

---

## 9. Agent Teams (Parallel Multi-Agent)

The Agent Teams system enables a lead agent to spawn N teammate agents that run **concurrently**, share a task list with dependencies, and communicate via an in-memory mailbox.

### Architecture

```
Lead Agent (query loop)
  |
  v  team_create tool call
+----------------------------------+
|          TeamManager             |
|  +--------+  +--------+  +---+  |
|  |Teammate|  |Teammate|  |...|  |   <-- Promise.allSettled()
|  | (query |  | (query |  |   |  |       (parallel execution)
|  |  loop) |  |  loop) |  |   |  |
|  +---+----+  +---+----+  +---+  |
|      |           |               |
|  +---v-----------v-----------+   |
|  |       Shared Mailbox      |   |
|  +---------------------------+   |
|  +---------------------------+   |
|  |  Shared TaskManager       |   |
|  |  (dependencies, claiming) |   |
|  +---------------------------+   |
+----------------------------------+
```

### Components

#### Mailbox (`src/teams/Mailbox.ts`)

In-memory message passing between teammates:

```typescript
class Mailbox {
  send(opts: { from, to, content }): MailboxMessage
  receive(agentId): MailboxMessage[]    // Marks as read
  peek(agentId): MailboxMessage[]       // Doesn't mark
  subscribe(agentId, listener): () => void
  history(): MailboxMessage[]
  clear(): void
}
```

Messages can target a specific teammate ID, `"all"` (broadcast), or `"lead"`.

#### TeamManager (`src/teams/TeamManager.ts`)

Core orchestrator for team lifecycle:

- **`create(opts)`** -- Creates team state, root task, per-teammate child tasks, mailbox
- **`run(teamId, config, registry)`** -- Launches all teammates via `Promise.allSettled()`:
  - Each teammate gets an isolated AppState store
  - Each teammate gets a scoped ToolRegistry (agent's allowed tools + team tools + task tools)
  - Each teammate's system prompt is augmented with team context
  - Tool activity is forwarded to team state for UI rendering
- **`get(teamId)`**, **`list()`** -- Query team state
- **`shutdown(teamId)`** -- Stop team and clear mailbox
- **`subscribe(listener)`** -- React to team state changes

#### Scoped Registry (`src/teams/buildTeammateRegistry.ts`)

Each teammate receives a fresh `ToolRegistry` containing only:
- The agent definition's `allowedTools` (or all if empty)
- Task management tools: `task_create`, `task_list`, `task_get`, `task_update`
- Kanban tool: `kanban` (for real-time board progress updates)
- Team coordination tools: `team_message`, `team_check_messages`, `team_task_claim`

#### Teammate Prompt (`src/teams/teammatePrompt.ts`)

Appended to each teammate's system prompt:
- Team name and ID
- Teammate roster with roles and tasks
- Communication instructions (mailbox usage)
- Task coordination rules (claiming, dependencies, subtasks)

### Team Execution Flow

```
1. Lead calls team_create({ name, teammates: [{agent, task}] })
2. TeamManager.create():
   - Resolve agent definitions
   - Create root task + child tasks
   - Initialize mailbox
   - Set status = "forming"
3. TeamManager.run():
   - Set status = "running"
   - Emit "team:start" hook
   - For each teammate (in parallel):
     a. Build scoped ToolRegistry
     b. Build system prompt with team context
     c. Create isolated AppState store
     d. Run query loop
     e. Forward tool activity to team state
     f. Emit "team:teammate:start" / "team:teammate:end"
   - Promise.allSettled() -- wait for all
   - Set status = "completed" or "failed"
   - Complete root task
   - Emit "team:complete" hook
4. Return synthesized summary of all teammate outputs
```

---

## 10. Task System

### Task State (`src/tasks/Task.ts`)

```typescript
interface TaskState {
  id: string;
  status: TaskStatus;          // "pending" | "running" | "completed" | "failed" | "cancelled"
  description: string;
  createdAt: number;
  updatedAt: number;
  parentId?: string;           // For subtasks / team grouping
  output?: string;
  error?: string;
  metadata: Record<string, unknown>;
  blockedBy: string[];         // Dependency tracking
  blocks: string[];            // Reverse dependency links
  claimedBy: string | null;    // Agent claiming (for teams)
  claimedAt: number | null;
}
```

### Valid State Transitions

```
pending  --> running, cancelled
running  --> completed, failed, cancelled
completed, failed, cancelled  --> (terminal)
```

### TaskManager (`src/tasks/TaskManager.ts`)

```typescript
class TaskManager {
  create(opts: CreateTaskOptions): TaskState
  get(id: string): TaskState | undefined
  list(filter?: { status?, parentId? }): TaskState[]
  transition(id, to, payload?): TaskState    // Auto-removes from blockedBy on complete
  addDependency(taskId, blockerTaskId): void // Link dependencies
  isReady(taskId): boolean                   // All blockers completed?
  claim(taskId, agentId): TaskState | null   // Atomic claim for teams
  listClaimable(): TaskState[]               // Pending + unclaimed + unblocked
  subscribe(listener): () => void
}
```

When a task transitions to `"completed"`, it is automatically removed from all other tasks' `blockedBy` arrays, potentially unblocking downstream work.

---

## 11. Hook / Event System

**File:** `src/hooks/index.ts`

The hook system provides typed lifecycle events for observability and extensibility.

### Event Catalog

| Event | Payload | When |
|-------|---------|------|
| `session:start` | `{ sessionId, model }` | After initialization |
| `session:end` | `{ sessionId, messageCount }` | On shutdown |
| `query:before` | `{ messages }` | Before each query loop run |
| `query:after` | `{ messages, turnCount, error? }` | After query loop completes |
| `tool:before` | `{ toolName, toolCall }` | Before each tool execution |
| `tool:after` | `{ toolName, toolCall, result, isError }` | After each tool execution |
| `message:assistant` | `{ message }` | When assistant message received |
| `agent:start` | `{ agentName, agentId, taskId }` | When sub-agent spawns |
| `agent:end` | `{ agentName, agentId, taskId, output }` | When sub-agent finishes |
| `context:compact` | `{ originalTokens, compactedTokens, removedMessages, strategy }` | After compaction |
| `team:create` | `{ teamId, name, teammateCount }` | Team created |
| `team:start` | `{ teamId, name }` | Team execution begins |
| `team:teammate:start` | `{ teamId, teammateId, agentName }` | Teammate begins |
| `team:teammate:end` | `{ teamId, teammateId, agentName, status, output }` | Teammate finishes |
| `team:message` | `{ teamId, from, to, content }` | Mailbox message sent |
| `team:complete` | `{ teamId, name, status, duration }` | Team finishes |

### HookManager

```typescript
class HookManager {
  on<E>(event: E, handler, source?): void     // Register typed handler
  removeBySource(source: string): void         // Remove all hooks from a source
  emit<E>(event: E, payload): Promise<void>    // Fire all handlers (errors logged, not thrown)
  list(event?): RegisteredHook[]
}
```

Hooks are fire-and-forget -- errors are logged but never block the caller.

---

## 12. State Management

### Reactive Store (`src/state/store.ts`)

Minimal reactive store compatible with React's `useSyncExternalStore`:

```typescript
interface Store<T> {
  get(): T
  set(updater: (prev: T) => T): void
  subscribe(listener: () => void): () => void
}
```

Immutable update pattern: `set(prev => ({ ...prev, field: newValue }))`. Skips notification if updater returns the same reference.

### AppState (`src/state/AppStateStore.ts`)

```typescript
interface AppState {
  messages: Message[];           // Full conversation history
  isStreaming: boolean;          // Model actively streaming
  currentStreamText: string;     // Accumulated stream text
  model: string;                 // Active model identifier
  inputMode: "normal" | "busy";  // Whether input is blocked
  activeToolName: string | null;
  lastError: string | null;
  pendingDiffs: DiffResult[];    // For diff viewer
  focusOwner: FocusOwner;        // "input" | "diffViewer" | "autocomplete"
  briefMode: boolean;
  planMode: boolean;
  activeToolCalls: ActiveToolCall[];
  activeAgentTaskId: string | null;
  agentToolCalls: ActiveToolCall[];
  turnStartedAt: number | null;
  turnTokenCount: number;
  activeTeams: TeamUIState[];    // Real-time team state
}
```

### React Integration (`src/state/AppState.tsx`)

- `AppStateProvider` -- React context providing the store
- `useAppState()` -- Read state reactively (re-renders on change)
- `useSetAppState()` -- Get stable updater function

---

## 13. Memory System

**File:** `src/memory/index.ts`

File-based key-value storage organized by scope, with an in-memory cache layer for performance:

| Scope | Lifetime | Path |
|-------|----------|------|
| `project` | Permanent per project | `.custom-agents/memory/project/<key>.json` |
| `user` | Permanent per user | `.custom-agents/memory/user/<key>.json` |
| `session` | Per session only | `.custom-agents/memory/session/<id>/<key>.json` |

Each entry is stored as a JSON file with metadata:

```typescript
interface MemoryEntry {
  key: string;
  value: string;
  kind: MemoryKind;       // "project" | "user" | "session"
  updatedAt: number;      // Unix timestamp (Date.now())
}
```

### In-Memory Cache

`MemoryStore` maintains a `Map<string, MemoryEntry>` cache keyed by `"kind:key"` to avoid redundant disk reads:

- **`get()`** — returns from cache if present; otherwise reads from disk and populates cache
- **`set()`** — writes to disk (`Bun.write`) and updates cache in the same call
- **`delete()`** — removes the file from disk (`fs/promises.unlink`) and evicts from cache

The cache is process-scoped (lives for the duration of the session) and has no TTL — entries remain cached until overwritten or deleted. This is safe because the `MemoryStore` is the sole writer; there are no external processes modifying the files.

### API

```typescript
class MemoryStore {
  init(): Promise<void>                    // Create scope directories on startup
  get(kind, key): Promise<string | null>   // Read (cache-first, then disk)
  set(kind, key, value): Promise<void>     // Write to disk + cache
  delete(kind, key): Promise<boolean>      // Remove from disk + cache
  list(kind): Promise<string[]>            // Enumerate keys via readdir
  buildContext(kinds): Promise<string>     // For system prompt injection
}
```

### Initialization

`memory.init()` is called during startup (`init.ts`) to pre-create all scope directories (`project/`, `user/`, `session/<id>/`), ensuring the folder structure exists before any read or write operations.

Memory context is built from `project` and `user` scopes and appended to the system prompt via the `memoryContext` field in `QueryConfig`.

---

## 14. Persistence System

**File:** `src/persistence/SessionPersistence.ts`

Saves conversation transcripts as JSON files for session resumption:

```
.custom-agents/sessions/<session-id>.json   -- Full transcript
.custom-agents/sessions/_latest.json        -- Points to most recent session
```

Each file contains:
```typescript
{
  manifest: { sessionId, model, createdAt, updatedAt, messageCount },
  messages: Message[]  // System messages excluded
}
```

```typescript
class SessionPersistence {
  init(): Promise<void>                    // Ensure directory exists
  save(sessionId, messages, model): void   // Save transcript
  load(sessionId): Message[] | null        // Load transcript
  getLatestSessionId(): string | null      // Most recent session
  listSessions(): SessionManifest[]        // All sessions sorted by date
}
```

Sessions are saved after each completed query loop run and on shutdown.

---

## 15. Plugin System

**File:** `src/plugins/index.ts`

Plugins can contribute tools, hooks, and have lifecycle management:

```typescript
interface PluginDefinition {
  name: string;
  version: string;
  description: string;
  tools?: Tool[];
  hooks?: Record<string, (...args) => void | Promise<void>>;
  activate?(log: Logger): Promise<(() => void) | void>;
}

class PluginManager {
  register(plugin): void
  activateAll(): Promise<void>
  deactivateAll(): Promise<void>    // Cleanup in LIFO order
  get(name): PluginDefinition | undefined
  list(): PluginDefinition[]
}
```

---

## 16. Service System

**File:** `src/services/index.ts`

Services are long-lived background capabilities (e.g., MCP connections, file watchers, LSP clients):

```typescript
interface ServiceDefinition {
  name: string;
  description: string;
  start(log: Logger): Promise<ServiceHandle>;
}

interface ServiceHandle {
  stop(): Promise<void>;
}

class ServiceManager {
  register(service): void
  start(name): Promise<void>
  stop(name): Promise<void>
  stopAll(): Promise<void>
  isRunning(name): boolean
  listRegistered(): string[]
  listRunning(): string[]
}
```

All running services are stopped during graceful shutdown.

---

## 17. Skill / Slash Command System

**Files:** `src/skills/index.ts`, `src/skills/builtinSkills.ts`, `src/skills/customSkillStore.ts`

Skills are reusable prompt-based or tool-based capabilities invoked via `/slash` commands.

```typescript
interface SkillDefinition {
  name: string;              // The /command name
  description: string;
  type: "prompt" | "tool" | "composite";
  promptTemplate?: string;   // Supports {{input}} placeholder
  requiredTools?: string[];
  userInvocable: boolean;
}
```

### SkillRegistry (`src/skills/index.ts`)

```typescript
class SkillRegistry {
  register(skill): void              // Throws if name already exists
  registerOrReplace(skill): void     // Overwrites if name already exists
  get(name): SkillDefinition | undefined
  list(): SkillDefinition[]
  expand(name, input): string | null // Replace {{input}} in promptTemplate
}
```

### Built-in Skills

| Command | Type | Description |
|---------|------|-------------|
| `/explain <code>` | prompt | Explain code in detail |
| `/commit` | prompt | Generate git commit message for staged changes |
| `/status` | prompt | Show project status (git, tasks, session) |
| `/find <query>` | prompt | Find files or code in the project |
| `/compact` | tool | Force context compaction (handled directly in REPL) |
| `/diff [file]` | tool | Side-by-side diff viewer (handled directly in REPL) |
| `/brief` | prompt | Toggle compact output mode |
| `/plan` | prompt | Enter planning mode |
| `/agent <desc>` | prompt | Create custom agent from natural language |
| `/skill <desc>` | prompt | Create a custom slash command from natural language |
| `/board [args]` | prompt | View and manage the project kanban board (add cards, run tasks, track progress) |

### Custom Skills

Custom skills mirror the custom agent pattern. Users create them via `/skill` or the `skill_create` tool, and they persist across sessions in `.custom-agents/skills.json`.

**Custom Skill Store (`src/skills/customSkillStore.ts`):**

```typescript
interface PersistedSkillDefinition {
  name: string;
  description: string;
  type: "prompt";              // Custom skills are always prompt-based
  promptTemplate: string;      // Must include {{input}} placeholder
  requiredTools?: string[];
  userInvocable: true;         // Always user-invocable
}

class CustomSkillStore {
  load(): Promise<PersistedSkillDefinition[]>   // Read from disk, [] if missing
  save(skills): Promise<void>                    // Write JSON with version wrapper
  add(skill): Promise<void>                      // Upsert by name
  remove(name): Promise<boolean>                 // Delete by name
  static toSkillDefinition(persisted): SkillDefinition  // Convert for registry
}
```

**Key constraints:**
- Custom skills are always `type: "prompt"` (tool-type skills require REPL-level code changes)
- 10 built-in skill names are reserved and cannot be overwritten: `explain`, `commit`, `status`, `find`, `compact`, `diff`, `brief`, `plan`, `agent`, `skill`
- The `promptTemplate` must include the `{{input}}` placeholder
- Newly created skills are immediately available in the current session via `registerOrReplace()`

### Expansion Flow

```
User types: /commit fix login bug
  --> SkillRegistry.expand("commit", "fix login bug")
  --> Returns expanded prompt template with {{input}} replaced
  --> Sent to query loop as a regular user message
```

`/compact` and `/diff` are handled directly by the REPL without going through the LLM.

---

## 18. Terminal UI Components

### Component Tree

```
<App>                          -- RuntimeContext provider
  <AppStateProvider>           -- AppState React context
    <REPL>                     -- Main screen
      <Header>                 -- Box-drawn title, model, cwd
      <MessageList>            -- Conversation history
        <MessageRow>           -- Per-message renderer (user/assistant/tool)
      <ActivityDisplay>        -- Streaming activity
        <AgentTaskList>        -- Sub-agent tool activity + subtasks
        <TeamDisplay>          -- Team progress visualization
      <DiffDisplay>            -- Multi-file diff container
        <DiffViewer>           -- Side-by-side diff with line numbers
      <InputBar>               -- Text input with @file autocomplete
```

### Key Components

#### REPL (`src/screens/REPL.tsx`)
The main screen orchestrating the entire UI. Handles:
- Slash command expansion via SkillRegistry
- `/compact` and `/diff` as direct actions
- File reference resolution (`@file.ts` syntax)
- Query loop invocation with memory context
- Session persistence after each query

#### InputBar (`src/components/InputBar.tsx`)
Text input with:
- `@file` autocomplete via fuzzy matching
- Debounced file search (150ms)
- Arrow keys for suggestion navigation, Tab to complete
- Ctrl+U to clear line, Escape to dismiss autocomplete

#### ActivityDisplay (`src/components/ActivityDisplay.tsx`)
Shows real-time activity:
- Spinning indicators for active tools
- Tool name + argument summary
- Elapsed time and token count
- Embeds `AgentTaskList` when `agent_spawn` is running
- Embeds `TeamDisplay` when `team_create` is running

#### TeamDisplay (`src/components/TeamDisplay.tsx`)
Renders active teams:
- Team name + status header
- Per-teammate: status icon (spinner/checkmark/X), agent name, task, active tools

#### DiffDisplay + DiffViewer
Vim-like side-by-side diff viewer:
- `j/k` scroll, `g/G` jump, Space/Ctrl+D/U page
- Tab to cycle between multiple file diffs
- `q` to dismiss
- Color-coded: red (removed), green (added), gray (unchanged)

### React Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useAppState()` | `AppState.tsx` | Read reactive app state |
| `useSetAppState()` | `AppState.tsx` | Get stable state updater |
| `useRuntime()` | `App.tsx` | Access runtime context (config, registry, etc.) |
| `useSpinner(active)` | `useSpinner.ts` | Animated braille spinner frames |
| `useAgentTasks(tm, parentId)` | `useAgentTasks.ts` | Subscribe to agent subtask changes |
| `useTeamState(tm, setState)` | `useTeamState.ts` | Forward team state to AppState |

---

## 19. Utility Modules

### `src/utils/id.ts`
UUID generation: `crypto.randomUUID()`.

### `src/utils/env.ts`
Loads and validates environment variables via Zod. Fails fast with clear error messages.

### `src/utils/logger.ts`
Hierarchical logger writing to stderr (to avoid interfering with Ink's stdout):
- Levels: debug, info, warn, error
- Child loggers: `log.child("scope")` creates `[parent:scope]` prefix
- Global mute toggle for clean startup

### `src/utils/shutdown.ts`
Graceful shutdown with LIFO cleanup handler execution:
- `onShutdown(fn)` -- register cleanup
- `installShutdownHandlers()` -- listen for SIGINT/SIGTERM

### `src/utils/diff.ts`
Side-by-side diff computation using the `diff` library:
- `computeSideBySideDiff(filePath, old, new)` returns `DiffResult`
- Adjacent removed+added blocks paired into "modified" rows
- Truncated at 200 rows

### `src/utils/fileResolver.ts`
- `resolveFileReferences(text, cwd)` -- Resolves `@path/to/file.ext` tokens, appends file contents
- `fuzzyMatchFiles(partial, cwd)` -- Subprocess-based file search for autocomplete (2s timeout)

### `src/utils/toolArgsSummary.ts`
Summarizes tool arguments for UI display. Priority keys shown first (`file_path`, `pattern`, `command`...), large content keys skipped.

### `src/tools/shared/utils.ts`
- `truncateOutput(text, max)` -- Truncate with char count indicator
- `formatTaskState(task)` -- Human-readable task summary
- `stripHtmlTags(html)` -- HTML to plain text conversion

---

## 20. Data Flow Diagrams

### User Input Flow

```
User types "explain @src/query/query.ts"
  |
  v
InputBar.onSubmit(text)
  |
  v
REPL.handleSubmit(text)
  |
  +--> Is it /compact?  --> compactMessages() directly
  +--> Is it /diff?     --> handleDiff() directly
  +--> Is it /slash?    --> skillRegistry.expand() --> expandedText
  +--> Otherwise        --> raw text
  |
  v
resolveFileReferences(text, cwd)
  |  Resolves @tokens, appends file contents
  v
memory.buildContext(["project", "user"])
  |  Loads persistent memory for system prompt
  v
runQueryLoop(messages, { config, registry, hooks, ... })
  |
  |  STREAMING LOOP
  |  +---> streamChatCompletion() --> onToken() --> AppState.currentStreamText
  |  +---> If tool_calls: executeToolCalls() --> ToolResultMessage[]
  |  +---> Loop until no more tool calls or max turns
  |
  v
sessionPersistence.save(sessionId, messages, model)
```

### Agent Spawn Flow

```
Query loop encounters agent_spawn tool call
  |
  v
AgentSpawnTool.call({ agent: "explorer", message: "find..." })
  |
  v
agentRouter.get("explorer")  --> AgentDefinition
  |
  v
runAgent({
  definition, userMessage, config, registry, hooks, taskManager, kanbanStore
})
  |
  v
taskManager.create() --> Task (tracking)
  |
  v
Build SCOPED ToolRegistry (allowedTools + task tools + kanban)
  |
  v
Inject kanban board summary + tracking prompt into system prompt
  |
  v
createStore<AppState>()  --> Isolated agent state
  |
  v
runQueryLoop(agentMessages, agentConfig, scopedRegistry)  --> Runs in agent's own loop
  |
  +--> Agent's tool activity forwarded to parent UI via store subscription
  +--> Agent uses kanban tool to toggle sub-tasks as work completes
  |
  v
Return output text to parent conversation
```

### Team Parallel Execution Flow

```
Query loop encounters team_create tool call
  |
  v
TeamCreateTool.call({ name: "analysis", teammates: [...] })
  |
  v
teamManager.create(opts)
  |
  +--> Create root task
  +--> Create per-teammate child tasks
  +--> Initialize Mailbox
  +--> Set status = "forming"
  |
  v
teamManager.run(teamId, config, registry)
  |
  v
Promise.allSettled([             <-- All run concurrently
  runTeammate(teammate1),
  runTeammate(teammate2),
  ...
])
  |
  Each teammate:
  +--> buildTeammateRegistry()   -- Scoped tools
  +--> buildTeammatePromptAddendum() -- Team context
  +--> createStore<AppState>()   -- Isolated state
  +--> runQueryLoop()            -- Agent's own loop
  |     +--> Can use team_message, team_check_messages, team_task_claim
  |     +--> Can create/claim tasks with dependencies
  |     +--> Tool activity forwarded to TeamState
  |
  v
Collect results, complete root task
Return synthesized summary to lead agent
```

### Shutdown Flow

```
SIGINT / SIGTERM received
  |
  v
runShutdown(signal)
  |
  v (LIFO order)
  1. abortController.abort()     -- Cancel in-flight requests
  2. serviceManager.stopAll()    -- Stop background services
  3. pluginManager.deactivateAll() -- Plugin cleanup
  4. sessionPersistence.save()   -- Save conversation
  5. hooks.emit("session:end")   -- Notify listeners
  |
  v
process.exit(0)
```

---

## 21. Complete File Reference

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| `src/index.ts` | 4 | -- | Entry point shebang |
| `src/entrypoints/cli.tsx` | 97 | `main()`, `VERSION` | CLI parsing + Ink render |
| `src/entrypoints/init.ts` | 338 | `initialize()`, `InitResult` | Full runtime initialization |
| `src/query/query.ts` | 189 | `runQueryLoop()` | Core streaming tool-use loop |
| `src/query/queryTypes.ts` | 36 | `QueryConfig`, `QueryCallbacks`, `QueryResult` | Query loop type definitions |
| `src/query/streamOpenAI.ts` | 159 | `streamChatCompletion()` | SSE streaming from API |
| `src/query/compaction.ts` | 337 | `compactMessages()`, `estimateTokens()` | Three-stage context compaction |
| `src/agents/AgentDefinition.ts` | 36 | `AgentDefinition`, `AgentInstance`, `AgentMode` | Agent type definitions |
| `src/agents/AgentRouter.ts` | 35 | `AgentRouter` | Agent name -> definition registry |
| `src/agents/builtinAgents.ts` | 57 | `ExplorerAgent`, `CoderAgent`, `ReviewerAgent` | Built-in agent definitions |
| `src/agents/runAgent.ts` | 155 | `runAgent()` | Agent spawn + isolated query loop |
| `src/agents/customAgentStore.ts` | 68 | `CustomAgentStore` | Disk persistence for custom agents |
| `src/kanban/KanbanStore.ts` | ~200 | `KanbanStore` | Persistent kanban board (cards, tasks, columns, summary) |
| `src/kanban/KanbanStore.test.ts` | ~225 | Tests | KanbanStore unit tests |
| `src/tools/KanbanTool/KanbanTool.ts` | ~200 | `createKanbanTool()` | Kanban board management tool |
| `src/tools/KanbanTool/formatBoard.ts` | ~80 | `formatBoard()` | Board display formatting |
| `src/teams/TeamTypes.ts` | 48 | Team types + interfaces | Type definitions for teams |
| `src/teams/Mailbox.ts` | 93 | `Mailbox` | In-memory inter-agent messaging |
| `src/teams/TeamManager.ts` | 260 | `TeamManager` | Team lifecycle orchestrator |
| `src/teams/buildTeammateRegistry.ts` | 42 | `buildTeammateRegistry()` | Scoped tool registry per teammate |
| `src/teams/teammatePrompt.ts` | 42 | `buildTeammatePromptAddendum()` | System prompt for team context |
| `src/teams/index.ts` | 14 | Barrel exports | Module re-exports |
| `src/tasks/Task.ts` | 86 | `TaskState`, `createTask()`, `transitionTask()` | Task state + transitions |
| `src/tasks/TaskManager.ts` | 136 | `TaskManager` | Task CRUD + dependencies + claiming |
| `src/tools/Tool.ts` | 41 | `Tool`, `ToolUseContext`, `ToolResult` | Core tool interface |
| `src/tools/registry.ts` | 46 | `ToolRegistry` | Tool storage + OpenAI format |
| `src/tools/orchestration.ts` | 166 | `executeToolCalls()` | Tool execution pipeline |
| `src/state/store.ts` | 40 | `Store`, `createStore()` | Generic reactive store |
| `src/state/AppStateStore.ts` | 85 | `AppState`, `createAppStateStore()` | App state + UI types |
| `src/state/AppState.tsx` | 40 | `useAppState()`, `useSetAppState()` | React context + hooks |
| `src/hooks/index.ts` | 96 | `HookManager`, `HookPayloads` | Lifecycle event system |
| `src/hooks/useSpinner.ts` | 21 | `useSpinner()` | Animated spinner |
| `src/hooks/useAgentTasks.ts` | 33 | `useAgentTasks()` | Agent subtask subscription |
| `src/hooks/useTeamState.ts` | 58 | `useTeamState()` | Team state -> AppState bridge |
| `src/components/App.tsx` | 91 | `App`, `RuntimeContextValue`, `useRuntime()` | Root component |
| `src/components/InputBar.tsx` | 186 | `InputBar` | Text input + autocomplete |
| `src/components/MessageList.tsx` | 67 | `MessageList` | Conversation renderer |
| `src/components/ActivityDisplay.tsx` | 84 | `ActivityDisplay` | Tool/streaming activity |
| `src/components/AgentTaskList.tsx` | 68 | `AgentTaskList` | Agent subtask progress |
| `src/components/TeamDisplay.tsx` | 78 | `TeamDisplay` | Team progress UI |
| `src/components/DiffDisplay.tsx` | 136 | `DiffDisplay` | Multi-file diff container |
| `src/components/DiffViewer.tsx` | 114 | `DiffViewer` | Side-by-side diff |
| `src/screens/REPL.tsx` | 343 | `REPL` | Main interactive screen |
| `src/memory/index.ts` | 141 | `MemoryStore` | File-based persistent memory |
| `src/persistence/SessionPersistence.ts` | 148 | `SessionPersistence` | Conversation transcript save/load |
| `src/plugins/index.ts` | 70 | `PluginManager`, `PluginDefinition` | Plugin lifecycle |
| `src/services/index.ts` | 86 | `ServiceManager`, `ServiceDefinition` | Background service lifecycle |
| `src/skills/index.ts` | 53 | `SkillRegistry`, `SkillDefinition` | Slash command system |
| `src/skills/builtinSkills.ts` | 127 | 10 built-in skills | Skill definitions |
| `src/skills/customSkillStore.ts` | 80 | `CustomSkillStore`, `PersistedSkillDefinition` | Disk persistence for custom skills |
| `src/tools/SkillCreateTool/SkillCreateTool.ts` | 97 | `createSkillCreateTool()` | Create custom slash commands |
| `src/tools/SkillListTool/SkillListTool.ts` | 56 | `createSkillListTool()` | List all skills |
| `src/types/config.ts` | 35 | `EnvConfigSchema`, `AppConfig` | Configuration types |
| `src/types/messages.ts` | 43 | `Message`, `ToolCall`, etc. | OpenAI wire format types |
| `src/utils/id.ts` | 5 | `generateId()` | UUID generation |
| `src/utils/env.ts` | 22 | `loadEnvConfig()` | Env variable loading |
| `src/utils/logger.ts` | 58 | `Logger`, `createLogger()` | Hierarchical stderr logger |
| `src/utils/shutdown.ts` | 35 | `onShutdown()`, `installShutdownHandlers()` | Graceful shutdown |
| `src/utils/diff.ts` | 142 | `computeSideBySideDiff()` | Diff computation |
| `src/utils/fileResolver.ts` | 147 | `resolveFileReferences()`, `fuzzyMatchFiles()` | @file resolution |
| `src/utils/toolArgsSummary.ts` | 58 | `summarizeToolArgs()` | Tool arg display |
| `src/tools/shared/utils.ts` | 42 | `truncateOutput()`, `formatTaskState()`, `stripHtmlTags()` | Shared tool helpers |

---

## 22. Development Guide

### Commands

```bash
bun run src/index.ts          # Start the application
bun --watch run src/index.ts  # Development mode with hot reload
bun test                      # Run all tests (38 tests across 4 files)
bun x tsc --noEmit            # Type check (strict mode)
```

### Key Conventions

1. **All imports use `.js` extension** -- Bun resolves `.ts` files automatically with ES modules
2. **Zod schemas** define all tool parameters; use `z.infer<typeof Schema>` for TypeScript types
3. **Strict TypeScript** -- no `any`, `esModuleInterop`, `forceConsistentCasingInFileNames`
4. **Tests colocated** -- `*.test.ts` files sit next to their source files
5. **Logger writes to stderr** -- avoids interfering with Ink's stdout rendering
6. **Factory pattern** for tools needing runtime dependencies (TaskManager, AgentRouter, etc.)
7. **Immutable state updates** -- always spread + update, never mutate

### Adding a New Tool

1. Create `src/tools/MyTool/MyTool.ts`
2. Define Zod input schema
3. Implement `Tool<TInput>` interface (or factory function)
4. Register in `src/entrypoints/init.ts`
5. Add description to system prompt
6. Type check: `bun x tsc --noEmit`

### Adding a New Agent

1. Create agent definition in `src/agents/builtinAgents.ts` (or via `/agent` command)
2. Specify `allowedTools`, `maxTurns`, `systemPrompt`, and `mode`
3. Agent is automatically available via `agent_spawn` tool

### Adding a New Skill

**Built-in skill:**
1. Define `SkillDefinition` in `src/skills/builtinSkills.ts`
2. Add to the `builtinSkills` array
3. Users can invoke via `/skillname` in the REPL

**Custom skill (runtime):**
1. Use `/skill <description>` or the `skill_create` tool
2. Skill is persisted to `.custom-agents/skills.json` and available immediately
3. Custom skills are always prompt-based and survive restarts

### Data Directory Layout

```
.custom-agents/
├── memory/
│   ├── project/<key>.json
│   ├── user/<key>.json
│   └── session/<id>/<key>.json
├── sessions/
│   ├── <session-id>.json
│   └── _latest.json
├── agents.json                  # Custom agent definitions
├── skills.json                  # Custom skill definitions
└── kanban.json                  # Persistent kanban board (cards, tasks, columns)
```

---

*Generated for CustomAgents v0.1.0*
