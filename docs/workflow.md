# Custom Agents - Full System Workflow

## Architecture Overview

```
+-----------------------------------------------------------------------+
|                           SYSTEM LAYERS                                |
|                                                                        |
|  1. CLI & Startup          src/index.ts -> entrypoints/cli.tsx         |
|  2. Initialization         entrypoints/init.ts                         |
|  3. React + Ink UI         components/ + screens/                      |
|  4. Core Query Loop        query/query.ts + query/streamOpenAI.ts      |
|  5. Context Compaction     query/compaction.ts                         |
|  6. Tool System            tools/Tool.ts + tools/registry.ts           |
|  7. Agent Orchestration    agents/AgentDefinition.ts + runAgent.ts     |
|  8. Task System            tasks/Task.ts + TaskManager.ts              |
|  9. Plugin / Skill / Hook  plugins/ + skills/ + hooks/                 |
| 10. Memory System          memory/index.ts                             |
| 11. Persistence            persistence/SessionPersistence.ts           |
| 12. Services               services/index.ts                           |
+-----------------------------------------------------------------------+
```

## Full Request Lifecycle

```
  bun run src/index.ts
         |
         v
  +--------------+
  |   index.ts   |   Shebang entry point
  |   (2 lines)  |   Imports and calls main() from cli.tsx
  +--------------+
         |
         v
  +-------------------+
  |   cli.tsx          |   Parses --help/--version flags
  |   main()           |   Calls initialize() then render(<App />)
  +-------------------+
         |
         +------> initialize()
         |              |
         |              v
         |    +-------------------------------------------+
         |    |   init.ts - initialize()                   |
         |    |                                            |
         |    |   1. loadEnvConfig()   Validate .env       |
         |    |   2. createLogger()    stderr logger       |
         |    |   3. generateId()      UUID session ID     |
         |    |   4. MemoryStore()     file-based KV       |
         |    |   5. SessionPersistence()  transcript IO   |
         |    |   6. createAppStateStore() reactive store  |
         |    |   7. ToolRegistry()    register 6 tools    |
         |    |   8. TaskManager()     background tasks    |
         |    |   9. AgentRouter()     agent definitions   |
         |    |  10. SkillRegistry()   slash commands      |
         |    |  11. PluginManager()   extension system    |
         |    |  12. ServiceManager()  long-lived procs    |
         |    |  13. HookManager()     lifecycle events    |
         |    |  14. installShutdownHandlers() SIGINT/TERM |
         |    |  15. hooks.emit("session:start")           |
         |    +-------------------------------------------+
         |              |
         |              v Returns InitResult
         |
         +------> render(<App />)   Launch Ink terminal UI
                        |
                        v
  +---------------------------------------------------------------+
  |  App.tsx                                                       |
  |                                                                |
  |  RuntimeContext.Provider   <-- config, registry, hooks,        |
  |    |                          log, memory, sessionPersistence, |
  |    |                          taskManager, agentRouter,        |
  |    |                          skillRegistry                    |
  |    v                                                           |
  |  AppStateProvider          <-- reactive store                  |
  |    |                                                           |
  |    v                                                           |
  |  REPL (screen)             <-- main interactive screen         |
  +---------------------------------------------------------------+
```

## REPL Screen - User Interaction Flow

```
  +------------------------------------------------------+
  |  REPL.tsx                                             |
  |                                                       |
  |  +-----------+  Header: "Custom Agents v0.1.0"        |
  |  |           |  model + session info                  |
  |  +-----------+                                        |
  |                                                       |
  |  +---------------+  MessageList: renders all messages |
  |  | You: ...      |  - user (blue)                     |
  |  | Assistant: ...|  - assistant (magenta)              |
  |  | [tool: ...]   |  - tool results (yellow, dimmed)   |
  |  +---------------+  - system messages hidden          |
  |                                                       |
  |  +---------------+  StreamingText: live streaming      |
  |  | Assistant: ▌  |  Shows partial response + cursor    |
  |  +---------------+                                    |
  |                                                       |
  |  +---------------+  ToolCallStatus: active tool name   |
  |  | Running: grep |  Shown while tool is executing      |
  |  +---------------+                                    |
  |                                                       |
  |  +---------------+  Error display (red)                |
  |  | Error: ...    |  Shows lastError from state         |
  |  +---------------+                                    |
  |                                                       |
  |  > user input█    InputBar: text input with cursor     |
  |                   Enter=submit, Ctrl+U=clear           |
  |                   Disabled when inputMode="busy"       |
  +------------------------------------------------------+
```

### User Submit Flow

```
  User types "find all .ts files" + Enter
         |
         v
  InputBar.onSubmit(text)
         |
         v
  REPL.handleSubmit(text)
    |
    |  1. Check if slash command (e.g. /explain, /commit)
    |     YES -> expand via SkillRegistry -> use expanded prompt
    |     NO  -> use text as-is
    |
    |  2. Create UserMessage { role: "user", content: text }
    |  3. store.set() -> append to messages
    |  4. memory.buildContext(["project","user"]) -> load persistent memory
    |  5. runQueryLoop(messages, queryConfig)
    |  6. On completion: sessionPersistence.save()
    |
    v
```

## Core Query Loop (The Engine)

```
  runQueryLoop(messages, queryConfig, callbacks)
         |
         |  queryConfig = { config, registry, hooks, getAppState,
         |                  setAppState, abortSignal, log, memoryContext }
         |
         v
  1. Build system prompt
     |  Prepend system message if not present
     |  Append memory context: "--- Persistent Memory ---\n..."
     |
  2. Convert tools -> OpenAI function-calling format
     |  registry.toOpenAITools() -> uses zod-to-json-schema
     |
  3. hooks.emit("query:before")
     |
  4. Set state: isStreaming=true, inputMode="busy"
     |
     v
  +==============================================================+
  |  TURN LOOP  (max 20 turns, checked by config.maxTurns)       |
  |                                                                |
  |  IF abortSignal.aborted -> return { aborted: true }           |
  |                                                                |
  |  turnCount++                                                   |
  |  Clear currentStreamText                                       |
  |                                                                |
  |  +--------------------------------------------------------+   |
  |  |  compactMessages() - query/compaction.ts                |   |
  |  |                                                         |   |
  |  |  Estimate tokens for messages[]                         |   |
  |  |  IF tokens > 80% of contextBudget:                      |   |
  |  |    1. TRUNCATE old tool results (>200 chars)            |   |
  |  |    2. COLLAPSE tool call sequences into summaries       |   |
  |  |    3. SUMMARIZE: drop oldest messages, add marker       |   |
  |  |  Emit "context:compact" hook if compacted               |   |
  |  |  Update messages[] and state in place                   |   |
  |  +--------------------------------------------------------+   |
  |                                                                |
  |  +--------------------------------------------------------+   |
  |  |  streamChatCompletion()                                 |   |
  |  |                                                         |   |
  |  |  POST https://openrouter.ai/api/v1/chat/completions    |   |
  |  |  Body: { model, messages, tools, stream: true }         |   |
  |  |  Headers: Authorization: Bearer <apiKey>                |   |
  |  |                                                         |   |
  |  |  Parse SSE stream:                                      |   |
  |  |    data: {"choices":[{"delta":{"content":"Hello"}}]}    |   |
  |  |    data: {"choices":[{"delta":{"tool_calls":[...]}}]}   |   |
  |  |    data: [DONE]                                         |   |
  |  |                                                         |   |
  |  |  For each text chunk:                                   |   |
  |  |    -> callbacks.onStreamToken(token)                    |   |
  |  |    -> setAppState: currentStreamText += token           |   |
  |  |                                                         |   |
  |  |  For each tool_call fragment:                           |   |
  |  |    -> accumulate into toolCallMap (by index)            |   |
  |  |    -> merge id, name, arguments strings                 |   |
  |  |                                                         |   |
  |  |  Returns: AssistantMessage { role, content, tool_calls }|   |
  |  +--------------------------------------------------------+   |
  |                                                                |
  |  Append AssistantMessage to messages[]                         |
  |  hooks.emit("message:assistant")                               |
  |  Update state: messages, clear currentStreamText               |
  |                                                                |
  |  IF no tool_calls -> BREAK (final answer)                      |
  |                                                                |
  |  IF tool_calls present:                                        |
  |    +------------------------------------------------------+   |
  |    |  executeToolCalls() - tools/orchestration.ts          |   |
  |    |                                                       |   |
  |    |  For EACH tool call (sequential):                     |   |
  |    |    1. Set state: activeToolName = toolName            |   |
  |    |    2. Look up tool in registry                        |   |
  |    |       NOT FOUND -> return error message               |   |
  |    |    3. hooks.emit("tool:before")                       |   |
  |    |    4. JSON.parse(toolCall.function.arguments)          |   |
  |    |    5. tool.parameters.safeParse(args) via Zod         |   |
  |    |       INVALID -> return validation error              |   |
  |    |    6. tool.call(parsedInput, toolContext)              |   |
  |    |       -> returns { content, isError? }                |   |
  |    |    7. hooks.emit("tool:after")                        |   |
  |    |    8. Build ToolResultMessage                         |   |
  |    |       { role:"tool", tool_call_id, content }          |   |
  |    |                                                       |   |
  |    |  Clear state: activeToolName = null                   |   |
  |    |  Return ToolResultMessage[]                           |   |
  |    +------------------------------------------------------+   |
  |                                                                |
  |  Append tool results to messages[]                             |
  |  Update state: messages                                        |
  |  callbacks.onTurnComplete(turnCount)                           |
  |                                                                |
  |  CONTINUE LOOP -> model sees tool results and responds again   |
  +==============================================================+
         |
         v
  5. hooks.emit("query:after")
  6. FINALLY: restore state -> isStreaming=false, inputMode="normal"
  7. Return { messages, turnCount, aborted }
```

## Tool System

### Tool Interface

```
  Tool<TInput>
    |- name: string            Unique ID used in function calling
    |- description: string     Sent to model as tool description
    |- parameters: ZodSchema   Input validation + JSON Schema generation
    |- isReadOnly: boolean     Side-effect flag for permission model
    |- call(input, context)    Execute and return { content, isError? }
```

### Tool Registry Pipeline

```
  Tool definition (Zod schema)
         |
         |  register(tool)
         v
  ToolRegistry (Map<string, Tool>)
         |
         |  toOpenAITools()
         v
  zod-to-json-schema conversion
         |
         v
  OpenAI function-calling format:
  {
    type: "function",
    function: {
      name: "grep",
      description: "Search file contents...",
      parameters: { type: "object", properties: {...}, required: [...] }
    }
  }
```

### Built-in Tools

```
  +-------------+------------------+----------+----------------------------------+
  | Name        | File             | ReadOnly | Purpose                          |
  +-------------+------------------+----------+----------------------------------+
  | grep        | GrepTool.ts      | yes      | Regex search via rg/grep         |
  | glob        | GlobTool.ts      | yes      | Find files by pattern            |
  | file_read   | FileReadTool.ts  | yes      | Read file with line numbers      |
  | file_write  | FileWriteTool.ts | no       | Create/overwrite files           |
  | file_edit   | FileEditTool.ts  | no       | Targeted string replacement      |
  | shell       | ShellTool.ts     | no       | Execute bash commands            |
  | agent_spawn | AgentSpawnTool.ts| no       | Spawn a sub-agent by name        |
  +-------------+------------------+----------+----------------------------------+
```

## Context Compaction (Long-Running Session Support)

### The Problem

In a long-running session, the messages array grows unbounded:
- Each tool call adds an assistant message + tool result message
- Tool results (file reads, grep outputs) can be 10-50KB each
- After 10-15 tool calls, context can exceed 100K tokens
- API call fails when context exceeds the model's window

### Solution: Three-Strategy Compaction Pipeline

```
  compactMessages(messages, config, hooks, log)
         |
         |  Estimate tokens: ~3.5 chars/token (conservative)
         |
         v
  tokens > 80% of contextBudget?
    NO  -> return messages unchanged
    YES -> apply strategies in order:
         |
         v
  +==================================================================+
  |                     STRATEGY PIPELINE                             |
  |                                                                   |
  |  Always preserved:                                                |
  |    - System message (index 0)                                     |
  |    - Last 10 messages (the "tail")                                |
  |                                                                   |
  |  Applied to older messages (the "compactable" region):            |
  |                                                                   |
  |  +------------------------------------------------------------+  |
  |  | Strategy 1: TRUNCATE                                        |  |
  |  |                                                             |  |
  |  | Shorten old tool result contents:                           |  |
  |  |   Before: "     1  import React...\n     2  ..." (5000ch)  |  |
  |  |   After:  "     1  import React...\n     2  ..."           |  |
  |  |           "... [truncated: 4800 chars removed]"  (200ch)   |  |
  |  |                                                             |  |
  |  | IF under budget -> DONE                                     |  |
  |  +------------------------------------------------------------+  |
  |         | still over budget                                       |
  |         v                                                         |
  |  +------------------------------------------------------------+  |
  |  | Strategy 2: COLLAPSE                                        |  |
  |  |                                                             |  |
  |  | Replace tool call sequences with compact summaries:         |  |
  |  |                                                             |  |
  |  |   Before (3 messages):                                      |  |
  |  |     assistant: {tool_calls: [{grep, pattern="useState"}]}   |  |
  |  |     tool: "src/App.tsx:5: import { useState }..."           |  |
  |  |                                                             |  |
  |  |   After (1 message):                                        |  |
  |  |     assistant: "[grep pattern="useState" -> src/App.tsx:5:  |  |
  |  |                  import { useState }...]"                   |  |
  |  |                                                             |  |
  |  | IF under budget -> DONE                                     |  |
  |  +------------------------------------------------------------+  |
  |         | still over budget                                       |
  |         v                                                         |
  |  +------------------------------------------------------------+  |
  |  | Strategy 3: SUMMARIZE                                       |  |
  |  |                                                             |  |
  |  | Progressively drop oldest messages from the front:          |  |
  |  |                                                             |  |
  |  |   [system] [marker] [...remaining...] [tail x 10]          |  |
  |  |                                                             |  |
  |  | Marker inserted:                                            |  |
  |  |   "[Earlier conversation was compacted to fit context       |  |
  |  |    window. Key context may have been lost.]"                |  |
  |  |                                                             |  |
  |  | Last resort: also trim from the tail (keep at least 2)     |  |
  |  +------------------------------------------------------------+  |
  +==================================================================+
         |
         v
  Emit "context:compact" hook with stats
  Return compacted messages[]
```

### Integration Point in Query Loop

```
  query.ts — inside the turn loop, BEFORE each streamChatCompletion():

    turnCount++
      |
      v
    compactMessages(messages, { contextBudget }, hooks, log)
      |
      |  IF didCompact:
      |    messages[] replaced in-place
      |    appState updated
      |
      v
    streamChatCompletion(messages, ...)
```

### Configuration

```
  .env:
    CONTEXT_BUDGET=120000     # Max estimated tokens (default: 120,000)

  AppConfig:
    contextBudget: number     # Passed through from env

  Compaction triggers at 80% of contextBudget (96,000 tokens by default).
```

### Token Estimation

```
  estimateTokens(text) = ceil(text.length / 3.5)

  This is intentionally conservative (overestimates slightly).
  OpenAI averages ~4 chars/token, but code and JSON are denser.
  3.5 chars/token gives a safety margin so we compact BEFORE hitting limits.

  Per-message overhead: +4 tokens (role, separators)
  Tool calls: +10 tokens per call (overhead) + name + arguments
```

### Message Regions During Compaction

```
  messages[]
  +------------------------------------------+
  | [0] System message        ALWAYS KEPT     |
  +------------------------------------------+
  | [1..N-10] Compactable     STRATEGIES      |
  |   - Old user messages     APPLY HERE      |
  |   - Old assistant msgs                    |
  |   - Old tool results                      |
  +------------------------------------------+
  | [N-9..N] Tail             ALWAYS KEPT     |
  |   - Recent messages                       |
  |   - Current conversation                  |
  +------------------------------------------+
```

## Agent System

### Agent Lifecycle

```
  Parent session (or tool call)
         |
         |  runAgent({ definition, userMessage, ... })
         v
  1. TaskManager.create() -> task in "pending" state
  2. TaskManager.transition(task, "running")
  3. Create AgentInstance { id, taskId, mode, abortController }
  4. Build agent-scoped AppConfig (own systemPrompt, maxTurns)
  5. Build messages:
     - sync/background: [systemMsg, userMsg]
     - forked: [systemMsg, ...parentMessages, userMsg]
  6. Create isolated AppStateStore for agent
  7. hooks.emit("agent:start")
  8. runQueryLoop() with agent's config and isolated store
  9. Extract last assistant message as output
 10. TaskManager.transition(task, "completed")
 11. hooks.emit("agent:end")
 12. Return { instance, output }
```

### Agent Execution Modes

```
  +-------------+--------------------------------------------------+
  | Mode        | Behavior                                          |
  +-------------+--------------------------------------------------+
  | sync        | Blocks parent. Caller awaits result.             |
  | background  | Fire and forget. Parent continues immediately.    |
  | forked      | Gets copy of parent messages. Runs independently. |
  +-------------+--------------------------------------------------+
```

### Built-in Agents

```
  +----------+------------------------------------------+---------+-----------+
  | Name     | Purpose                                  | Mode    | Max Turns |
  +----------+------------------------------------------+---------+-----------+
  | explorer | Quick codebase exploration & search       | sync    | 8         |
  | coder    | Focused code generation & editing         | sync    | 15        |
  | reviewer | Code review and analysis                  | sync    | 10        |
  +----------+------------------------------------------+---------+-----------+
```

## Task System

### Task State Machine

```
  +---------+          +----------+
  | pending |--------->| running  |
  +---------+          +----------+
       |                /    |    \
       |               /     |     \
       v              v      v      v
  +-----------+  +---------+ +--------+ +-----------+
  | cancelled |  |completed| | failed | | cancelled |
  +-----------+  +---------+ +--------+ +-----------+
                 (terminal)  (terminal)  (terminal)
```

### TaskManager

```
  TaskManager
    |- tasks: Map<string, TaskState>
    |- listeners: Set<TaskListener>
    |
    |- create(opts)           -> TaskState (pending)
    |- transition(id, status) -> TaskState (validated)
    |- get(id)                -> TaskState | undefined
    |- list({ status?, parentId? })
    |- subscribe(listener)    -> unsubscribe()
```

## State Management

### Reactive Store

```
  createStore(initialState)
         |
         v
  Store<T>
    |- get()           -> current snapshot
    |- set(updater)    -> (prev) => next, notifies listeners
    |- subscribe(fn)   -> returns unsubscribe()
         |
         |  Used by React via useSyncExternalStore
         v
  AppStateProvider -> useAppState() hook -> re-renders on change
```

### AppState Shape

```
  AppState {
    messages: Message[]           Full conversation history
    isStreaming: boolean           True during model response
    currentStreamText: string     Partial text while streaming
    model: string                 Active model name
    inputMode: "normal" | "busy"  Blocks input during processing
    activeToolName: string | null Which tool is executing
    lastError: string | null      Error from last query run
  }
```

## Hook System (Lifecycle Events)

```
  Session lifecycle:
    session:start  -> { sessionId, model }
    session:end    -> { sessionId, messageCount }

  Query lifecycle:
    query:before   -> { messages }
    query:after    -> { messages, turnCount, error? }

  Tool lifecycle:
    tool:before    -> { toolName, toolCall }
    tool:after     -> { toolName, toolCall, result, isError }

  Message events:
    message:assistant -> { message }

  Agent lifecycle:
    agent:start    -> { agentName, agentId, taskId }
    agent:end      -> { agentName, agentId, taskId, output }

  Context management:
    context:compact -> { originalTokens, compactedTokens, removedMessages, strategy }

  All hooks are fire-and-forget. Errors are logged, never block the caller.
```

## Memory System

### Storage Layout

```
  .custom-agents/
    memory/
      project/          Shared across all sessions
        <key>.json
      user/             User-level preferences
        <key>.json
      session/          Per-session context
        <sessionId>/
          <key>.json
```

### Memory Entry Format

```json
{
  "key": "preferred-framework",
  "value": "React with TypeScript",
  "kind": "project",
  "updatedAt": 1711972800000
}
```

### Memory Injection

```
  REPL.handleSubmit()
         |
         |  memory.buildContext(["project", "user"])
         v
  "[project memory]
  - preferred-framework: React with TypeScript
  - test-runner: bun test

  [user memory]
  - style: concise responses"
         |
         |  Appended to system prompt as:
         |  "--- Persistent Memory ---\n<context>"
         v
  System prompt in query loop
```

## Persistence

### Session Storage

```
  .custom-agents/
    sessions/
      <session-id>.json     Full transcript (minus system messages)
      _latest.json           Pointer to most recent session ID

  Session JSON format:
  {
    "manifest": {
      "sessionId": "uuid",
      "model": "openrouter/free",
      "createdAt": 1711972800000,
      "updatedAt": 1711972900000,
      "messageCount": 12
    },
    "messages": [ ... ]
  }
```

### Save Triggers

```
  1. After each completed query loop -> REPL.handleSubmit()
  2. On shutdown (SIGINT/SIGTERM) -> onShutdown() in init.ts
```

## Plugin System

```
  PluginDefinition {
    name, version, description
    tools?: Tool[]            Extra tools contributed by plugin
    hooks?: Record<event, fn> Lifecycle hooks
    activate?(log): cleanup?  Called once on load
  }

  PluginManager
    |- register(plugin)
    |- activateAll()         Calls activate() on each plugin
    |- deactivateAll()       Runs cleanup functions in reverse
```

## Skill System (Slash Commands)

```
  SkillDefinition {
    name: string              Slash command name (e.g. "explain")
    description: string
    type: "prompt" | "tool" | "composite"
    promptTemplate?: string   Template with {{input}} placeholder
    requiredTools?: string[]
    userInvocable: boolean
  }

  User types: /explain this function
         |
         v
  SkillRegistry.expand("explain", "this function")
         |
         v
  "Explain the following code in detail. Be thorough but concise.\n\nthis function"
         |
         v
  Fed into query loop as user message
```

## Service System

```
  ServiceDefinition { name, description, start(log) -> ServiceHandle }
  ServiceHandle     { stop() }
  ServiceManager    { register, start, stop, stopAll }

  For future use: MCP servers, file watchers, LSP clients.
```

## Shutdown Sequence

```
  SIGINT or SIGTERM received
         |
         v
  runShutdown()
    |  shutdownInProgress = true
    |
    |  Run cleanup handlers in LIFO order:
    |    1. abortController.abort()    Cancel in-flight requests
    |    2. sessionPersistence.save()  Save transcript
    |       hooks.emit("session:end")  Notify plugins
    |
    v
  process.exit(0)
```

## File-to-Responsibility Map

```
  src/
  |- index.ts                    Entry point (2 lines)
  |
  |- entrypoints/
  |  |- cli.tsx                  CLI arg parsing + Ink render()
  |  |- init.ts                  Full initialization sequence
  |
  |- components/
  |  |- App.tsx                  Root component + RuntimeContext
  |  |- InputBar.tsx             Text input with keyboard handling
  |  |- MessageList.tsx          Renders conversation messages
  |  |- StreamingText.tsx        Live streaming response display
  |  |- ToolCallStatus.tsx       Shows active tool name
  |
  |- screens/
  |  |- REPL.tsx                 Main interactive screen
  |
  |- state/
  |  |- store.ts                 Generic reactive store
  |  |- AppStateStore.ts         App state type + factory
  |  |- AppState.tsx             React context + hooks
  |
  |- query/
  |  |- queryTypes.ts            QueryConfig, QueryCallbacks, QueryResult
  |  |- query.ts                 Core query loop (the engine)
  |  |- compaction.ts            Context compaction for long sessions
  |  |- streamOpenAI.ts          SSE streaming + tool call assembly
  |
  |- tools/
  |  |- Tool.ts                  Tool interface + ToolUseContext
  |  |- registry.ts              ToolRegistry + OpenAI format conversion
  |  |- orchestration.ts         executeToolCalls() sequencer
  |  |- GrepTool/GrepTool.ts     Regex search via rg/grep
  |  |- GlobTool/GlobTool.ts     File pattern matching
  |  |- FileReadTool/...         Read files with line numbers
  |  |- FileWriteTool/...        Write/create files
  |  |- FileEditTool/...         Targeted string replacement
  |  |- ShellTool/...            Execute bash commands
  |  |- AgentSpawnTool/...       Spawn sub-agents
  |
  |- agents/
  |  |- AgentDefinition.ts       AgentDefinition + AgentInstance types
  |  |- AgentRouter.ts           Agent registry (name -> definition)
  |  |- runAgent.ts              Spawn and run an agent
  |  |- builtinAgents.ts         Explorer, coder, reviewer definitions
  |
  |- tasks/
  |  |- Task.ts                  TaskState type + state machine
  |  |- TaskManager.ts           In-memory task manager
  |
  |- hooks/
  |  |- index.ts                 HookManager + typed event payloads
  |
  |- memory/
  |  |- index.ts                 MemoryStore (file-based KV)
  |
  |- persistence/
  |  |- SessionPersistence.ts    Transcript save/load/list
  |
  |- plugins/
  |  |- index.ts                 PluginManager + PluginDefinition
  |
  |- skills/
  |  |- index.ts                 SkillRegistry + SkillDefinition
  |  |- builtinSkills.ts         /explain, /commit, /status skills
  |
  |- services/
  |  |- index.ts                 ServiceManager + ServiceDefinition
  |
  |- types/
  |  |- config.ts                EnvConfigSchema + AppConfig
  |  |- messages.ts              Message union type (OpenAI wire format)
  |
  |- utils/
  |  |- env.ts                   loadEnvConfig() with Zod validation
  |  |- logger.ts                Leveled logger writing to stderr
  |  |- id.ts                    crypto.randomUUID() wrapper
  |  |- shutdown.ts              Graceful shutdown handler registry
```

## Data Flow Summary

```
  User Input
    -> REPL.handleSubmit()
      -> Skill expansion (if /slash command)
      -> memory.buildContext()
      -> runQueryLoop()
        -> [each turn]:
          -> compactMessages() (if approaching context budget)
              -> truncate old tool results
              -> collapse tool call sequences
              -> drop oldest messages if still over budget
          -> streamChatCompletion() (SSE to OpenRouter API)
              -> onToken callbacks (update streaming UI)
          -> AssistantMessage returned
          -> IF tool_calls: executeToolCalls()
              -> Zod validation
              -> tool.call()
              -> ToolResultMessage appended
              -> LOOP (model sees results, responds again)
          -> IF no tool_calls: BREAK
      -> sessionPersistence.save()
    -> UI re-renders via reactive store
```
