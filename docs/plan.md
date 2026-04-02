# Implementation Plan: Custom AI Coding Assistant Runtime (First Slice)
_Plan made by Abhisek Bose — July 5, 2025_

## About the Author

**Abhisek Bose** — AI Product Architect at CodeClouds
- 8–9 years of experience in software architecture, AI systems, and product development
- Location: Greater Kolkata Area
- Education: Punjab Technical University
- Expertise: Solution Architecture, Web & Mobility, Blockchain, SaaS, AI/ML
- Background: Tier5 Technology, Arodek, Bajoria Entertainment, KineTech, Webstylio
- GitHub: [github.com/abhisekbose](https://github.com/abhisekbose)
- LinkedIn: [linkedin.com/in/abhisek-bose](https://in.linkedin.com/in/abhisek-bose)

## Context

Building a custom AI coding assistant runtime from scratch in TypeScript/Bun, following the architecture described in `Requirement.md` and modeled after the reference systems in `full-system-onboarding.md` and `agent-system-onboarding.md`. No external agent frameworks. The first vertical slice delivers an end-to-end working loop: CLI boots, REPL renders, user sends message, query loop streams from an OpenAI-compatible API, model can invoke tools (file read + shell), results flow back, model responds.

## Decisions

- **Runtime**: Bun (native TS, fast startup, built-in test runner)
- **LLM API**: OpenAI-compatible (works with OpenAI, Ollama, LM Studio)
- **Scope**: Minimal working loop with 2 real tools

## Folder Structure

```
CustomAgents/
  package.json
  tsconfig.json
  bunfig.toml
  .env.example
  src/
    index.ts                           # Entrypoint, hands off to CLI
    entrypoints/
      cli.tsx                          # CLI arg parsing + Ink render launch
      init.ts                          # Config, store, registry, shutdown setup
    types/
      messages.ts                      # OpenAI message format types
      config.ts                        # EnvConfig (Zod), AppConfig
    state/
      store.ts                         # Generic createStore<T> with subscribe
      AppStateStore.ts                 # AppState shape + defaults
      AppState.tsx                     # React context + useAppState hooks
    query/
      queryTypes.ts                    # QueryConfig, QueryCallbacks, QueryResult
      streamOpenAI.ts                  # OpenAI SSE streaming client
      query.ts                         # Core turn loop (the engine)
    tools/
      Tool.ts                          # Tool interface + ToolUseContext
      registry.ts                      # ToolRegistry (register/get/list/toOpenAI)
      orchestration.ts                 # Execute tool calls, validate, build context
      FileReadTool/
        FileReadTool.ts                # Read file with line numbers
      ShellTool/
        ShellTool.ts                   # Execute shell commands
    screens/
      REPL.tsx                         # Main interactive screen
    components/
      App.tsx                          # Root wrapper with providers
      InputBar.tsx                     # User text input
      MessageList.tsx                  # Render message history
      StreamingText.tsx                # Render streaming tokens
      ToolCallStatus.tsx               # Show tool execution status
    tasks/
      Task.ts                          # Task types/status (stub for later)
    agents/
      AgentDefinition.ts               # AgentDefinition type (stub for later)
    plugins/index.ts                   # Stub
    skills/index.ts                    # Stub
    hooks/index.ts                     # Stub
    memory/index.ts                    # Stub
    services/index.ts                  # Stub
    utils/
      logger.ts                        # Structured logger (stderr, levels, child)
      env.ts                           # Load + validate .env via Zod
      id.ts                            # ID generation
      shutdown.ts                      # Graceful SIGINT/SIGTERM handling
```

~35 files, ~25 with real implementation. Stubs establish the directory structure for layers 5-10.

## Implementation Steps (in dependency order)

### Step 1: Project Setup
- `package.json` with deps: `react`, `ink`, `zod`, `zod-to-json-schema`, `nanoid`
- `tsconfig.json`: strict, jsx react-jsx, module esnext, paths `@/` -> `src/`
- `bunfig.toml`, `.env.example`

### Step 2: Utility Layer
- **`utils/logger.ts`**: Levels debug/info/warn/error, writes to stderr, `.child(scope)` method
- **`utils/env.ts`**: Load `.env`, validate with `EnvConfigSchema`, fail fast on invalid
- **`utils/id.ts`**: Wrapper around `crypto.randomUUID()`
- **`utils/shutdown.ts`**: Cleanup handler registry, SIGINT/SIGTERM handling

### Step 3: Type Definitions
- **`types/messages.ts`**: `SystemMessage`, `UserMessage`, `AssistantMessage`, `ToolResultMessage`, `ToolCall`, `Message` union -- all in OpenAI wire format
- **`types/config.ts`**: `EnvConfigSchema` (Zod), `EnvConfig`, `AppConfig`

### Step 4: AppState Store
- **`state/store.ts`**: Generic `createStore<T>` with `get()`, `set(updater)`, `subscribe(listener)`
- **`state/AppStateStore.ts`**: `AppState` interface (messages, isStreaming, currentStreamText, model, inputMode, tasks, etc.) + `createDefaultAppState()`
- **`state/AppState.tsx`**: `AppStateProvider`, `useAppState()`, `useSetAppState()` via `useSyncExternalStore`

### Step 5: Tool Interface + Registry
- **`tools/Tool.ts`**: `Tool<TInput>` interface (name, description, parameters as Zod, isReadOnly, call), `ToolUseContext` (toolCall, messages, config, getAppState, setAppState, abortSignal, log), `ToolResult`
- **`tools/registry.ts`**: `ToolRegistry` class with register/get/list/toOpenAITools (Zod -> JSON Schema conversion)

### Step 6: Tool Implementations
- **`tools/FileReadTool/FileReadTool.ts`**: Uses `Bun.file()`, returns line-numbered content, supports offset/limit
- **`tools/ShellTool/ShellTool.ts`**: Uses `Bun.spawn()`, captures stdout/stderr, timeout support

### Step 7: OpenAI Streaming Client
- **`query/streamOpenAI.ts`**: `fetch()` with SSE parsing, incremental tool call fragment accumulation, `onToken` callback for each text chunk

### Step 8: Query Loop + Orchestration
- **`query/queryTypes.ts`**: `QueryConfig`, `QueryCallbacks`, `QueryResult`
- **`query/query.ts`**: The turn loop:
  1. Build request from messages + system prompt + tools
  2. Stream response, fire onStreamToken callbacks
  3. If tool_calls: execute via orchestration, append results, loop
  4. If no tool_calls: done
  5. Exit on max turns or abort signal
- **`tools/orchestration.ts`**: For each tool call: find tool, validate args with Zod, build ToolUseContext, call tool, catch errors, always return ToolResultMessage

### Step 9: CLI Entrypoint + Init
- **`src/index.ts`**: `#!/usr/bin/env bun` + call `main()`
- **`entrypoints/init.ts`**: `initialize()` -> validate env, build AppConfig, create logger, create store, create ToolRegistry, register tools, register shutdown handlers, return `InitResult`
- **`entrypoints/cli.tsx`**: Parse --help/--version, call `initialize()`, call `render(<App .../>)`

### Step 10: React/Ink UI
- **`components/App.tsx`**: `AppStateProvider` + `RuntimeContext.Provider` (config, toolRegistry, logger) + `<REPL />`
- **`screens/REPL.tsx`**: Display messages, streaming text, input bar. On submit: add user message to state, call `runQueryLoop()` (async, non-blocking). Query loop updates store, REPL re-renders reactively
- **`components/InputBar.tsx`**: Text input, disabled during streaming/tool execution
- **`components/MessageList.tsx`**: Render message array with role-based styling
- **`components/StreamingText.tsx`**: Show `currentStreamText` with cursor
- **`components/ToolCallStatus.tsx`**: Show tool name during execution

### Step 11: Stubs for Later Layers
- `tasks/Task.ts`: TaskStatus, TaskStateBase types
- `agents/AgentDefinition.ts`: AgentDefinition interface
- Empty barrel files for plugins/, skills/, hooks/, memory/, services/

## Key Architecture Decisions

### Query loop is a while-loop, not event-driven
Sequential turns in a `while (turnCount < maxTurns)` loop. Clear, debuggable, bounded. Callbacks provide hooks for UI updates without breaking sequential flow.

### REPL <-> Query loop decoupling
They communicate only through the AppState store. REPL calls `runQueryLoop()` (plain async function, not a hook). Query loop calls `store.set()`. REPL re-renders via `useSyncExternalStore`. No event emitters, no observables. Query loop works without UI (for agents, tests, scripts).

### Streaming via separate state field
`currentStreamText` accumulates tokens during streaming. When the turn ends, it's cleared and the complete `AssistantMessage` is appended to `messages`. Avoids serializing the full message array on every token.

### Tool results always flow back
Every tool_call gets exactly one ToolResultMessage, even on error. The model never sees a dangling tool call without a result.

### Store is not a global singleton
Created in `init.ts`, passed explicitly to App and query loop. Testable, no hidden state.

## Verification

When complete, this flow must work end-to-end:
1. `bun run src/index.ts` -> terminal UI with input prompt
2. Type "Read the contents of package.json" -> model streams response, calls `file_read` tool, reads file, incorporates result
3. Type "Run ls -la" -> model calls `shell` tool, shows output, responds
4. Ctrl+C -> clean exit

## Dependencies

| Package | Purpose |
|---------|---------|
| `react` (18.x) | React core for Ink |
| `ink` (5.x) | Terminal UI rendering |
| `zod` (3.x) | Schema validation |
| `zod-to-json-schema` | Zod -> JSON Schema for OpenAI tools param |
| `nanoid` | ID generation (optional, can use crypto.randomUUID) |
| `@types/react` | React types (dev) |
| `bun-types` | Bun type definitions (dev) |
