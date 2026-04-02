# Full System Onboarding Guide

This document is a junior-friendly onboarding guide to the whole codebase.

It is written for someone who is new to the project and needs to understand:

- what the product is
- how the codebase is organized
- which folders and files own which responsibilities
- how a user action becomes model output, tool calls, tasks, UI updates, and stored state
- where agent logic fits into the bigger picture
- how to debug safely and where to start contributing

This guide is intentionally practical. It focuses on the mental models and file ownership that help you become productive quickly.

For a deeper dive into agent internals specifically, also read `docs/agent-system-onboarding.md`.

## 1. What This Project Is

At a high level, this repository is an interactive AI coding assistant built as a terminal application.

The system is more than “a chat UI that calls a model”. It combines:

- a CLI bootstrap layer
- a React/Ink terminal UI
- a central app state store
- a model query loop
- a tool execution system
- slash commands
- background task management
- agent delegation
- MCP server integration
- plugin and skill loading
- remote and bridge execution modes
- memory, hooks, telemetry, and feature flag systems

The important mindset is this:

```text
User input
  -> session/runtime setup
  -> REPL and app state
  -> query loop
  -> commands and tools
  -> tasks / agents / MCP / plugins
  -> streamed output back into UI and session state
```

Nothing important in this repo lives in isolation. Most behavior is the result of several layers working together.

## 2. The Main Mental Model

If you remember only one diagram, remember this one:

```text
+----------------------+
| CLI / entrypoints    |
+----------+-----------+
           |
           v
+----------------------+
| init + main.tsx      |
| config, flags, setup |
+----------+-----------+
           |
           v
+----------------------+
| App + REPL           |
| UI shell + hooks     |
+----------+-----------+
           |
           v
+----------------------+
| AppState store       |
| global runtime state |
+----------+-----------+
           |
           v
+----------------------+
| query.ts             |
| model/tool loop      |
+----+------+----------+
     |      |
     |      +-----------------------------+
     |                                    |
     v                                    v
+------------+                   +------------------+
| Commands    |                   | Tools / MCP      |
| /slash UX   |                   | external actions |
+------------+                   +------------------+
     |                                    |
     +----------------+-------------------+
                      |
                      v
              +------------------+
              | Tasks / Agents   |
              | async work       |
              +------------------+
                      |
                      v
              +------------------+
              | UI updates       |
              | notifications    |
              +------------------+
```

This tells you how to reason about code ownership:

- entrypoints decide how the process starts
- initialization prepares the environment
- the REPL is the interactive shell
- app state is the shared source of truth
- the query loop is the execution engine
- commands and tools are the action surfaces
- tasks and agents handle long-running or delegated work
- services provide supporting infrastructure

## 3. Top-Level Directory Map

This repo is large, so the first practical skill is learning which folders to ignore, which folders to skim, and which folders you must understand deeply.

### Core runtime folders

- `entrypoints/`
  Process entrypoints and fast-path boot logic before the full app loads.
- `bootstrap/`
  Early session/process state used during startup and runtime.
- `screens/`
  Top-level UI screens, especially the REPL.
- `components/`
  Reusable UI pieces rendered by Ink/React.
- `state/`
  Global app state shape, store creation, and React bindings.
- `query/`
  Supporting code for the query loop.
- `services/`
  Infrastructure modules: API clients, MCP, analytics, memory, compaction, plugins, OAuth, LSP, and more.
- `tools/`
  The tool implementations the model can call.
- `commands/`
  Slash commands and command-specific UI/logic.
- `tasks/`
  Background work tracking and lifecycle management.

### Extension and integration folders

- `plugins/`
  Built-in plugin-related code and supporting runtime pieces.
- `skills/`
  Skill system code and runtime support.
- `bridge/`
  Bridge and remote session machinery.
- `remote/`
  Remote session and transport-related code.
- `server/`
  Server-side support modules used by some features.
- `upstreamproxy/`
  Proxy support for certain remote execution paths.

### Supporting platform folders

- `context/`
  Runtime context providers and contextual data for the app.
- `constants/`
  Static constants and product-level definitions.
- `hooks/`
  React hooks that wire UI to runtime state and permissions.
- `types/`
  Shared type definitions.
- `utils/`
  Cross-cutting utility functions used everywhere.

### Specialized feature folders

- `assistant/`
  Assistant-related supporting logic.
- `buddy/`
  The buddy/tamagotchi subsystem.
- `coordinator/`
  Coordinator mode behavior.
- `memdir/`
  Memory file discovery and relevant-memory lookup logic.
- `voice/`
  Voice-related context and feature code.
- `vim/`
  Vim keybinding and related terminal behaviors.
- `keybindings/`
  Keyboard shortcut support.
- `ink/`
  Ink renderer support and integration helpers.
- `outputStyles/`
  Output rendering and presentation styles.
- `public/`
  Static assets.
- `schemas/`
  Structured validation schemas.
- `migrations/`
  Storage/config/session migrations.
- `native-ts/`
  Native-facing TypeScript helpers.
- `moreright/`
  Internal/specialized feature area.

## 4. Start Reading Here

If you are completely new, read these files first:

1. `entrypoints/cli.tsx`
2. `entrypoints/init.ts`
3. `main.tsx`
4. `replLauncher.tsx`
5. `components/App.tsx`
6. `screens/REPL.tsx`
7. `state/AppStateStore.ts`
8. `state/AppState.tsx`
9. `query.ts`
10. `tools.ts`
11. `commands.ts`
12. `Task.ts`

That sequence gives you the app from process startup down to runtime execution.

## 5. Architecture Layers

This section explains the major layers of the system and the files that define them.

### 5.1 Entry Points and Startup

The startup path begins before the UI exists.

Key files:

- `entrypoints/cli.tsx`
- `entrypoints/init.ts`
- `main.tsx`
- `replLauncher.tsx`

What each one does:

- `entrypoints/cli.tsx`
  This is the early process entrypoint. It handles fast-path CLI cases and decides whether the app can take a short route instead of loading the full interactive runtime.
- `entrypoints/init.ts`
  This is the global initializer. It enables config loading, sets safe env vars, configures TLS/proxy behavior, starts some background initialization, registers cleanup hooks, and prepares services that other systems depend on.
- `main.tsx`
  This is the big bootstrap orchestrator. It wires together config, policy, analytics, plugins, tools, commands, models, hooks, runtime state, and session behavior.
- `replLauncher.tsx`
  This launches the interactive React/Ink app once initialization is ready.

Startup flow:

```text
process start
  -> entrypoints/cli.tsx
  -> entrypoints/init.ts
  -> main.tsx
  -> replLauncher.tsx
  -> <App><REPL /></App>
```

What a junior developer should know:

- Most “why is startup weird?” questions begin in `entrypoints/` or `init.ts`.
- Most “where is this feature enabled?” questions eventually touch `main.tsx`.
- `main.tsx` is large because it is the integration hub, not because it owns every behavior.

### 5.2 App Shell and Interactive UI

Once startup finishes, the app moves into the interactive terminal UI.

Key files:

- `components/App.tsx`
- `screens/REPL.tsx`
- `components/`
- `hooks/`
- `ink/`

Responsibilities:

- `components/App.tsx`
  Wraps the session with the app state provider, stats provider, and FPS metrics provider.
- `screens/REPL.tsx`
  This is the main interactive screen. It coordinates user input, model output, slash commands, tool runs, task state, dialogs, background task navigation, and many session-specific hooks.
- `components/`
  Reusable UI pieces for prompts, tool output, dialogs, memory notifications, tasks, and more.
- `hooks/`
  React hooks that connect user interactions and state transitions to the underlying runtime systems.

Mental model:

- `REPL.tsx` is the interactive control room.
- `components/` render pieces of state.
- `hooks/` connect state changes to actions and side effects.

### 5.3 Global App State

The app has one large shared runtime state model.

Key files:

- `state/AppStateStore.ts`
- `state/AppState.tsx`
- `state/store.ts`
- `state/onChangeAppState.ts`

Responsibilities:

- `AppStateStore.ts`
  Defines the shape of the global state and default values.
- `AppState.tsx`
  Provides React bindings for the store and exports hooks like `useAppState` and `useSetAppState`.
- `store.ts`
  Creates the underlying store implementation.
- `onChangeAppState.ts`
  Handles persistence or side effects when app state changes.

What lives in app state:

- model and session configuration
- UI mode and dialog state
- permission context
- running tasks
- agent and teammate state
- plugin installation/refresh status
- MCP connection and resource state
- notifications
- background task metadata
- many feature-specific runtime flags

Why this matters:

- if the UI is showing something surprising, inspect app state
- if a long-running feature exists, it likely has app state representation
- if a background task seems stuck, its state is usually in `AppState`

### 5.4 Command System

Commands are the slash-driven control surface of the app.

Key files:

- `commands.ts`
- `commands/`
- `utils/messageQueueManager.ts`

Responsibilities:

- `commands.ts`
  Registers and loads commands, including feature-gated and environment-specific ones.
- `commands/`
  Contains implementation logic for individual commands.
- `messageQueueManager.ts`
  Helps prioritize and route queued command work relative to normal user messages.

Mental model:

- slash commands are not the same thing as tools
- commands shape application behavior from the UI side
- tools are actions the model can invoke from the execution loop

Command flow:

```text
user types /command
  -> command parsing and lookup
  -> command-specific handler/UI
  -> state updates and/or query/tool/task behavior
```

### 5.5 Tool System

Tools are the action interface the model can use to interact with the world.

Key files:

- `Tool.ts`
- `tools.ts`
- `tools/`
- `services/tools/toolOrchestration.ts`
- `services/tools/StreamingToolExecutor.ts`

Responsibilities:

- `Tool.ts`
  Defines foundational tool types and tool-use context.
- `tools.ts`
  Builds the master tool registry and controls which tools are available in the current environment.
- `tools/`
  Each folder is a concrete tool implementation such as bash, file read/edit/write, web, agent, task, MCP, workflow, or search tools.
- `toolOrchestration.ts`
  Decides which tool calls can run concurrently and which must run serially.
- `StreamingToolExecutor.ts`
  Supports streamed tool execution behavior within the query loop.

Important distinction:

- commands are user-invoked control actions
- tools are model-invoked execution actions

Tool flow:

```text
model emits tool_use
  -> query.ts detects tool requests
  -> tool orchestration resolves safe execution order
  -> tool implementation runs
  -> tool result becomes a message
  -> query loop continues
```

### 5.6 Query Loop and Model Execution

The heart of the system is the query loop.

Key files:

- `query.ts`
- `query/config.ts`
- `query/deps.ts`
- `services/api/client.ts`
- `services/api/`

Responsibilities:

- `query.ts`
  Runs the main loop that sends messages to the model, handles streaming output, accepts tool requests, manages retries/continuations, and returns assistant output.
- `query/config.ts`
  Builds runtime query configuration.
- `query/deps.ts`
  Assembles the dependencies required by the query loop.
- `services/api/client.ts`
  Creates model API clients across providers such as Anthropic, Bedrock, Foundry, or Vertex.
- `services/api/`
  Contains provider-specific request logic, retry behavior, and API support code.

What the query loop owns:

- preparing normalized messages
- building request config
- streaming model output
- reacting to tool calls
- retry and recovery logic
- compaction and token-limit handling
- stop hooks and post-sampling hooks
- final output production

Core flow:

```text
messages + system prompt + tool context
  -> build request
  -> stream assistant output
  -> if tool calls appear, execute tools
  -> append tool results to messages
  -> continue loop until terminal assistant output
```

This is one of the most important files in the repo.

### 5.7 Tasks and Background Work

Not everything should block the main conversation. That is where tasks come in.

Key files:

- `Task.ts`
- `tasks/`
- `components/tasks/`

Responsibilities:

- `Task.ts`
  Defines task types, statuses, ID generation, and shared task state.
- `tasks/`
  Contains implementations for local agent tasks, remote agent tasks, local shell tasks, workflows, dreams, teammates, and other background work.
- `components/tasks/`
  Renders task lists, dialogs, and task detail views in the UI.

Task mental model:

- tasks are first-class runtime entities
- they have state, status, output files, timing, and notifications
- background agents are not “just promises”; they are tracked tasks

Task statuses:

- `pending`
- `running`
- `completed`
- `failed`
- `killed`

### 5.8 Agent System

Agents are a major subsystem, but they are only one part of the overall runtime.

Key files:

- `tools/AgentTool/`
- `tasks/LocalAgentTask/`
- `tasks/RemoteAgentTask/`
- `tools/shared/spawnMultiAgent.ts`

What the agent system does:

- defines specialized subagents
- routes agent requests into local, remote, worktree, forked, or teammate execution
- runs delegated work with its own tools, permissions, context, and lifecycle
- reports results back through tasks and notifications

You do not need to master agents before understanding the rest of the app, but you do need to know where they fit:

```text
query loop
  -> AgentTool
  -> agent runtime
  -> task tracking
  -> completion notice back to parent session
```

Read `docs/agent-system-onboarding.md` after this guide if you will work in that area.

### 5.9 MCP System

MCP support lets the app connect to external tool/resource providers.

Key files:

- `services/mcp/client.ts`
- `tools/ListMcpResourcesTool/`
- `tools/ReadMcpResourceTool/`
- MCP-related state inside `AppStateStore.ts`

Responsibilities:

- managing MCP client connections and transports
- exposing MCP resources and tools to the runtime
- handling auth and connection state
- mapping external resources into the tool/model ecosystem

Mental model:

- MCP extends the assistant with external capabilities
- the MCP client layer translates those capabilities into the app’s internal tool/resource model

### 5.10 Plugins and Skills

Plugins and skills extend what the app knows how to do.

Key files:

- `utils/plugins/pluginLoader.ts`
- `services/plugins/PluginInstallationManager.ts`
- `utils/plugins/`
- `skills/`
- hook loaders in `utils/sessionStart.ts`

Responsibilities:

- plugin discovery, validation, and refresh
- marketplace reconciliation and background installation
- skill loading and use
- hook registration from configured plugin sources

Important behavior:

- plugin loading has cache and refresh behavior
- marketplace installs can happen in the background
- plugin hooks are loaded before session start hooks are executed
- policy/managed settings can restrict which hooks are allowed

### 5.11 Hooks and Session Lifecycle

Hooks allow code or configured behavior to run at key lifecycle points.

Key files:

- `utils/sessionStart.ts`
- `utils/hooks.ts`
- `utils/hooks/`

Responsibilities:

- session start hooks
- setup hooks
- post-sampling hooks
- file watch registration
- plugin-provided hooks

Why this matters:

- unexpected context injected into a session may come from hooks
- startup side effects often go through hook machinery
- hook policy restrictions can change runtime behavior significantly

### 5.12 Memory Systems

This repo has more than one concept of memory.

Key files:

- `memdir/`
- `services/SessionMemory/sessionMemory.ts`
- `services/SessionMemory/`
- `components/memory/`
- `commands/memory/`

There are two useful categories to understand:

- relevant memory lookup
  The `memdir/` system helps discover and retrieve useful memory files for context.
- session memory
  `services/SessionMemory/sessionMemory.ts` maintains notes about the current conversation in the background using a forked subagent flow.

Why this matters:

- memory can influence prompt context
- memory can appear as attachments or background-updated files
- debugging “why did the model know this?” sometimes leads here

### 5.13 Bridge, Remote, and Multi-Session Systems

Some sessions and agents do not run purely in the local process.

Key files:

- `bridge/bridgeMain.ts`
- `remote/`
- `tasks/RemoteAgentTask/`
- `entrypoints/cli.tsx` fast paths

Responsibilities:

- remote or bridge-backed session spawning
- poll loops and reconnection logic
- work dispatch and session tracking
- remote completion status
- worktree creation/cleanup in some bridged paths

Mental model:

- bridge/remote code is the transport and orchestration layer for sessions that live outside the normal local flow
- remote tasks still need to appear in the local runtime and UI

### 5.14 Analytics, Flags, and Policy

A lot of behavior in this repo is gated.

Key files:

- `services/analytics/growthbook.js`
- `services/analytics/`
- `services/policyLimits/`
- `services/remoteManagedSettings/`

Responsibilities:

- feature flags
- dynamic config
- telemetry/event logging
- remote managed settings
- policy-based restrictions

Why this matters:

- many code paths are conditional
- if you cannot reproduce something another teammate sees, a gate or managed setting may be the reason
- “why is this tool missing?” and “why is this UI hidden?” are often flag questions, not code-bug questions

## 6. End-to-End Flows

These flows are the easiest way to connect the architecture to real behavior.

### 6.1 Normal User Message Flow

```text
User types message in REPL
  -> REPL updates local/UI state
  -> query.ts builds model request
  -> model streams assistant output
  -> if tools are requested, tools execute
  -> results are appended as messages
  -> loop continues until final assistant answer
  -> AppState/UI update with final output
```

Main files involved:

- `screens/REPL.tsx`
- `query.ts`
- `Tool.ts`
- `tools.ts`
- `services/tools/toolOrchestration.ts`

### 6.2 Slash Command Flow

```text
User types /command
  -> command lookup in commands.ts
  -> command-specific handler runs
  -> handler updates state and/or invokes runtime logic
  -> UI reflects result
```

Main files involved:

- `commands.ts`
- `commands/`
- `screens/REPL.tsx`

### 6.3 Tool Call Flow

```text
Assistant emits tool_use block
  -> query.ts captures tool request
  -> tool orchestration batches execution
  -> tool implementation runs
  -> tool result becomes tool_result message
  -> query loop resumes
```

Main files involved:

- `query.ts`
- `services/tools/toolOrchestration.ts`
- `tools/`

### 6.4 Background Agent Flow

```text
Assistant invokes AgentTool
  -> agent definition selected
  -> local or remote run chosen
  -> task registered in AppState
  -> agent executes with its own context
  -> completion notification is emitted
  -> parent session can inspect task output
```

Main files involved:

- `tools/AgentTool/AgentTool.tsx`
- `tools/AgentTool/runAgent.ts`
- `tasks/LocalAgentTask/LocalAgentTask.tsx`
- `tasks/RemoteAgentTask/RemoteAgentTask.tsx`

### 6.5 Plugin Startup Flow

```text
session startup
  -> init/main prepare runtime
  -> plugins/marketplaces are discovered
  -> background installation or refresh may run
  -> plugin hooks are loaded
  -> session start hooks execute
```

Main files involved:

- `entrypoints/init.ts`
- `services/plugins/PluginInstallationManager.ts`
- `utils/plugins/pluginLoader.ts`
- `utils/sessionStart.ts`

### 6.6 Remote / Bridge Session Flow

```text
remote mode enabled
  -> bridge startup and auth
  -> session spawned or resumed remotely
  -> poll/heartbeat loop tracks status
  -> local runtime receives updates
  -> completion/failure is reflected as task/session state
```

Main files involved:

- `bridge/bridgeMain.ts`
- `remote/`
- `tasks/RemoteAgentTask/`

## 7. Which Coding Sections Mean What

This section is meant to answer the common junior question: “I see a file or folder name, but what does it mean in the real system?”

### `main.tsx`

Think of this as the runtime assembler.

It does not implement every feature directly. Instead, it:

- initializes global systems
- loads configs and gates
- wires tools, commands, plugins, and hooks together
- prepares the session
- launches the runtime shell

When you are asking “where is this feature connected into the product?”, `main.tsx` is often the answer.

### `screens/REPL.tsx`

Think of this as the interactive cockpit.

It is where many user-facing runtime behaviors meet:

- input handling
- output rendering
- command invocation
- task dialogs
- background navigation
- session-specific React hooks

If the product feels “alive”, much of that integration is happening here.

### `query.ts`

Think of this as the execution engine.

It is the core turn loop that coordinates:

- model requests
- streamed output
- tool usage
- continuations
- compaction/recovery
- final response creation

If `REPL.tsx` is the cockpit, `query.ts` is the engine room.

### `tools/`

Think of this as the action library.

Each tool is a capability the assistant can use. Some act on files, some run shell commands, some inspect external resources, some manage tasks, and some create agents.

### `commands/`

Think of this as the operator console.

Commands are user-driven controls for interacting with the app itself, not just the world outside the app.

### `services/`

Think of this as the infrastructure layer.

Most code here is not directly rendered in the UI and is not directly invoked by the user. It supports the rest of the system through API clients, MCP, analytics, plugins, memory, policy, retry, compaction, and similar machinery.

### `state/`

Think of this as the runtime source of truth.

If you want to know what the app currently believes about the session, tasks, plugin status, permissions, or dialogs, look here.

### `tasks/`

Think of this as the background job model.

Anything that needs lifecycle tracking beyond the current synchronous turn usually appears here.

### `bridge/` and `remote/`

Think of these as the off-machine or out-of-process execution layer.

They are about how work is coordinated when it is not living entirely in the normal local UI flow.

### `utils/`

Think of this as shared glue.

It contains many low-level helpers. It is useful, but it is also easy to get lost here. Prefer reading a feature’s main entrypoint first, then follow utility calls only as needed.

## 8. How Responsibilities Map Across Files

When a junior developer asks “where should I make this change?”, the answer is usually one of these mappings.

### If you need to change startup behavior

Look at:

- `entrypoints/cli.tsx`
- `entrypoints/init.ts`
- `main.tsx`

### If you need to change the terminal UI

Look at:

- `screens/REPL.tsx`
- `components/`
- `hooks/`
- `components/App.tsx`

### If you need to change global runtime state

Look at:

- `state/AppStateStore.ts`
- `state/AppState.tsx`
- `state/store.ts`

### If you need to add or modify a slash command

Look at:

- `commands.ts`
- `commands/`

### If you need to add or modify a model tool

Look at:

- `tools/`
- `tools.ts`
- `Tool.ts`
- `services/tools/toolOrchestration.ts`

### If you need to change the model loop itself

Look at:

- `query.ts`
- `query/config.ts`
- `query/deps.ts`
- `services/api/`

### If you need to change background task behavior

Look at:

- `Task.ts`
- `tasks/`
- `components/tasks/`

### If you need to change agents

Look at:

- `tools/AgentTool/`
- `tasks/LocalAgentTask/`
- `tasks/RemoteAgentTask/`
- `docs/agent-system-onboarding.md`

### If you need to change MCP integration

Look at:

- `services/mcp/client.ts`
- MCP tools in `tools/`
- relevant MCP state in `state/AppStateStore.ts`

### If you need to change plugin behavior

Look at:

- `utils/plugins/`
- `utils/plugins/pluginLoader.ts`
- `services/plugins/PluginInstallationManager.ts`
- `utils/sessionStart.ts`

### If you need to change memory behavior

Look at:

- `memdir/`
- `services/SessionMemory/`
- `components/memory/`
- `commands/memory/`

### If you need to change remote/bridge behavior

Look at:

- `bridge/`
- `remote/`
- `tasks/RemoteAgentTask/`

## 9. What Makes This Codebase Feel Complicated

Most juniors do not struggle because the code is “too advanced”. They struggle because several independent kinds of complexity exist at once.

### 9.1 Compile-time and runtime gating

Some features are behind `feature(...)` flags, user-type checks, environment checks, or managed settings.

That means:

- code may exist but not run in your environment
- different teammates may see different behavior
- an apparently “unused” file may still be important in another build mode

### 9.2 UI code and runtime code are interleaved

The REPL layer mixes rendering, state reading, hooks, and runtime actions. This is normal for interactive apps, but it means you must separate:

- what is being displayed
- what event triggered it
- what service/state layer actually owns the behavior

### 9.3 Big integration files exist

Files like `main.tsx` and `screens/REPL.tsx` are large because they are orchestration points. Avoid assuming that “large file” means “all logic belongs here”.

### 9.4 Many systems communicate through messages and state

Tool results, assistant output, notifications, and lifecycle updates often move through:

- messages
- task records
- app state
- hooks

This is powerful, but it can hide the true path unless you trace carefully.

## 10. How To Debug Effectively

When you are new, debugging is often more valuable than coding.

### Start from the user symptom

Ask:

- Is this a startup issue?
- Is this a UI rendering issue?
- Is this a state issue?
- Is this a query/tool issue?
- Is this a task/agent issue?
- Is this a plugin/MCP/remote issue?

### Then choose the right entrypoint

- startup bugs: `entrypoints/`, `init.ts`, `main.tsx`
- interactive bugs: `screens/REPL.tsx`, `components/`, `hooks/`
- state bugs: `state/AppStateStore.ts`, `state/AppState.tsx`
- tool bugs: `query.ts`, `tools/`, `services/tools/`
- task bugs: `Task.ts`, `tasks/`
- plugin bugs: `utils/plugins/`, `services/plugins/`, `utils/sessionStart.ts`
- remote bugs: `bridge/`, `remote/`

### Use tracing questions

When you inspect a flow, ask:

1. Where is the request created?
2. Where is it routed?
3. Where does state change?
4. Where does background work start?
5. Where is completion handled?
6. Where does the UI learn about the result?

Those six questions work for most systems in this repo.

## 11. Common Junior Confusions

These are the things most likely to trip you up.

### Commands vs tools

Commands are user-facing controls.
Tools are model-facing capabilities.

### REPL vs query

`REPL.tsx` manages interactive product behavior.
`query.ts` manages the model execution loop.

### Tasks vs agents

An agent run may become a task, but not every task is an agent.

### Plugins vs skills

Both extend functionality, but they are not the same subsystem and do not load through the same code path.

### Memory vs session state

Memory can persist or be injected as context.
App state is the live in-process runtime state.

### Remote vs local

Some behavior that looks similar in the UI may come from very different runtime paths depending on whether work is local, remote, or bridged.

## 12. Safe First Areas To Contribute

Good first tasks:

- improve a small command’s help or validation
- improve an error message in a tool or plugin path
- add a small guard clause where state assumptions are unsafe
- improve docs or inline comments around a complex orchestration point
- add a focused UI tweak in `components/`
- add a small test near an existing test pattern

Areas to approach carefully at first:

- `query.ts`
- permission scoping
- task notification formatting
- remote/bridge polling logic
- plugin loading precedence
- agent fork/context inheritance
- worktree cleanup behavior

These areas are high leverage, but easy to break in subtle ways.

## 13. Suggested First Week Plan

### Day 1

Read:

1. `entrypoints/cli.tsx`
2. `entrypoints/init.ts`
3. `main.tsx`

Goal:

- understand how the app starts

### Day 2

Read:

1. `replLauncher.tsx`
2. `components/App.tsx`
3. `screens/REPL.tsx`
4. `state/AppStateStore.ts`
5. `state/AppState.tsx`

Goal:

- understand how the UI and state are wired together

### Day 3

Read:

1. `commands.ts`
2. `commands/` for 2 or 3 example commands
3. `tools.ts`
4. `Tool.ts`

Goal:

- understand the difference between command actions and tool actions

### Day 4

Read:

1. `query.ts`
2. `services/tools/toolOrchestration.ts`
3. `services/api/client.ts`

Goal:

- understand how the model loop runs and where tool execution fits

### Day 5

Read:

1. `Task.ts`
2. `tasks/`
3. `components/tasks/`

Goal:

- understand how background work is modeled and surfaced

### Day 6

Read:

1. `services/mcp/client.ts`
2. `utils/plugins/pluginLoader.ts`
3. `services/plugins/PluginInstallationManager.ts`
4. `utils/sessionStart.ts`
5. `services/SessionMemory/sessionMemory.ts`

Goal:

- understand integrations, extensions, hooks, and memory

### Day 7

Choose one focused subsystem to go deeper on:

- agents
- plugins
- MCP
- memory
- remote/bridge
- REPL UI

Then make one very small change and trace it end to end.

## 14. Practical Reading Strategy

Do not read every file line by line.

Instead:

1. Start at the feature entrypoint.
2. Identify the main orchestrator file.
3. Identify the state owner.
4. Identify the side-effect owner.
5. Only then follow utility/helper calls.

This strategy helps you avoid drowning in `utils/`.

## 15. Glossary

### REPL

The interactive terminal experience where the user types messages and sees output.

### AppState

The global runtime state object for the session.

### Tool

A model-invokable capability such as file editing, shell execution, web fetch, or agent creation.

### Command

A user-invoked slash command that controls app behavior.

### Task

A tracked unit of background or long-running work.

### Agent

A delegated assistant run with its own context, permissions, tools, and lifecycle.

### MCP

An integration model for external tools/resources surfaced into the runtime.

### Plugin

An extension package loaded into the app, often with hooks, tools, or marketplace-driven lifecycle.

### Skill

A specialized behavior or capability package used by the assistant for certain tasks.

### Session Memory

Background-maintained notes about the current conversation.

## 16. Final Advice For A Junior Developer

You do not need to understand this whole repo before contributing.

What you do need is a stable navigation strategy:

- know the main architecture layers
- know which folder owns which kind of responsibility
- know how to trace a feature from entrypoint to state to UI
- know when a behavior is gated, backgrounded, or remote

If you can answer these four questions for a feature, you are already ramping up well:

1. Where does it start?
2. Where is the source of truth?
3. Where does the real work happen?
4. How does the UI learn the outcome?

Once those answers become habit, this codebase stops feeling overwhelming and starts feeling structured.

## 17. Full System ASCII Graph

This diagram is meant to show the whole picture in one place.

It is not a class diagram and not a call graph of every function. Instead, it is a system architecture map that shows:

- where execution starts
- how the interactive runtime is assembled
- where state lives
- how model execution works
- how commands, tools, tasks, agents, MCP, plugins, memory, and remote systems connect
- which main files own each area

```text
+=======================================================================================================+
|                                      FULL SYSTEM ARCHITECTURE                                         |
+=======================================================================================================+

  USER / TERMINAL
        |
        v
+-----------------------------+
| Process / CLI invocation    |
| entrypoints/cli.tsx         |
| - parse startup flags       |
| - fast paths                |
| - choose entry mode         |
+-------------+---------------+
              |
              v
+-----------------------------+
| Global initialization       |
| entrypoints/init.ts         |
| - enable configs            |
| - safe env vars             |
| - CA certs / proxy / mTLS   |
| - graceful shutdown         |
| - telemetry boot            |
| - remote settings/policy    |
| - upstream proxy setup      |
+-------------+---------------+
              |
              v
+-----------------------------+
| Runtime assembly            |
| main.tsx                    |
| - load config/state         |
| - model/provider setup      |
| - tools and commands        |
| - plugin/skill setup        |
| - hooks/session bootstrap   |
| - feature-gated systems     |
+-------------+---------------+
              |
              v
+-----------------------------+
| REPL launcher               |
| replLauncher.tsx            |
| -> renders <App><REPL/></App|
+-------------+---------------+
              |
              v
+=======================================================================================================+
|                                     UI + STATE LAYER                                                  |
+=======================================================================================================+
              |
              v
+-----------------------------+        +--------------------------------------+
| App shell                   |        | Global store                         |
| components/App.tsx          |------->| state/AppStateStore.ts               |
| - AppStateProvider          |        | state/AppState.tsx                   |
| - StatsProvider             |        | - session/runtime state              |
| - FpsMetricsProvider        |        | - tool permission context            |
+-------------+---------------+        | - tasks / agents / plugins / MCP     |
              |                        | - dialogs / notifications / models   |
              v                        +-------------------+------------------+
+-----------------------------+                            ^
| Interactive screen          |                            |
| screens/REPL.tsx            |----------------------------+
| - input handling            |            reads/writes store through hooks
| - output rendering          |
| - slash commands            |
| - task dialogs              |
| - background navigation     |
| - many runtime hooks        |
+------+------+---------------+
       |      |
       |      +---------------------------------------------------+
       |                                                          |
       v                                                          v
+-------------+                                      +---------------------------+
| components/ |                                      | hooks/                    |
| - UI pieces |                                      | - stateful UI behaviors   |
| - tasks UI  |                                      | - permissions             |
| - memory UI |                                      | - navigation              |
+-------------+                                      | - runtime side effects    |
                                                     +---------------------------+


+=======================================================================================================+
|                                USER ACTION ENTRY SURFACES                                              |
+=======================================================================================================+

 REPL user input can become one of three major things:

   1. normal conversation turn
   2. slash command
   3. UI-triggered workflow/task action

                                +-----------------------------+
                                | Normal user message         |
                                | -> query.ts                 |
                                +-------------+---------------+
                                              |
                                              v
                                +-----------------------------+
                                | Slash command               |
                                | commands.ts + commands/     |
                                | - parse /command            |
                                | - command-specific handler  |
                                +-------------+---------------+
                                              |
                                              v
                                +-----------------------------+
                                | UI/runtime action           |
                                | components/ + hooks/ +      |
                                | tasks/ handlers             |
                                +-----------------------------+


+=======================================================================================================+
|                                  MODEL EXECUTION CORE                                                  |
+=======================================================================================================+

+-----------------------------+
| query.ts                    |
| - normalize messages        |
| - build request config      |
| - stream assistant output   |
| - detect tool_use blocks    |
| - retry / continue / stop   |
| - compact/recover on limits |
+-------------+---------------+
              |
              v
+-----------------------------+        +--------------------------------------+
| query/config.ts             |        | query/deps.ts                        |
| - turn configuration        |        | - runtime dependencies               |
+-------------+---------------+        +-------------------+------------------+
              |                                                |
              +---------------------------+--------------------+
                                          |
                                          v
                           +-------------------------------+
                           | services/api/client.ts        |
                           | services/api/*                |
                           | - provider clients            |
                           | - Anthropic / Bedrock / etc.  |
                           | - retries / errors            |
                           +---------------+---------------+
                                           |
                                           v
                           +-------------------------------+
                           | streamed assistant response   |
                           | back into query loop          |
                           +---------------+---------------+
                                           |
                     +---------------------+----------------------+
                     |                                            |
                     v                                            v
           no tool calls / final text                   tool_use blocks emitted
                     |                                            |
                     v                                            v
           +---------------------------+               +---------------------------+
           | final assistant output    |               | tool execution path       |
           | back to REPL + AppState   |               +-------------+-------------+
           +---------------------------+                             |
                                                                     v


+=======================================================================================================+
|                                     TOOL SYSTEM                                                        |
+=======================================================================================================+

+-----------------------------+        +--------------------------------------+
| Tool type model             |        | Tool registry                        |
| Tool.ts                     |<-------| tools.ts                             |
| - Tool definitions          |        | - all built-in tools                 |
| - ToolUseContext            |        | - feature/env gated tool list        |
+-------------+---------------+        +-------------------+------------------+
              |                                                |
              +---------------------------+--------------------+
                                          |
                                          v
                           +-------------------------------+
                           | services/tools/               |
                           | toolOrchestration.ts          |
                           | StreamingToolExecutor.ts      |
                           | - batch safe parallel tools   |
                           | - serialize unsafe tools      |
                           +---------------+---------------+
                                           |
                  +------------------------+------------------------+
                  |                        |                        |
                  v                        v                        v
      +----------------------+  +----------------------+  +----------------------+
      | Local execution      |  | External fetch/search|  | Runtime control      |
      | tools/File*          |  | Web* tools           |  | Task*, Plan*, Config |
      | Bash / Glob / Grep   |  | Browser / search     |  | Todo / Workflow      |
      +----------+-----------+  +----------+-----------+  +----------+-----------+
                 |                         |                         |
                 +-------------------------+-------------------------+
                                           |
                                           v
                           +-------------------------------+
                           | tool_result messages          |
                           | appended into query loop      |
                           +-------------------------------+


+=======================================================================================================+
|                                     COMMAND SYSTEM                                                     |
+=======================================================================================================+

+-----------------------------+
| commands.ts                 |
| - command registry          |
| - feature-gated commands    |
| - slash command loading     |
+-------------+---------------+
              |
              v
+-----------------------------+
| commands/                   |
| - per-command logic         |
| - command-specific UI       |
| - memory commands           |
| - plugin/task commands      |
+-------------+---------------+
              |
              v
+-----------------------------+
| state / REPL updates        |
| and sometimes query/tool    |
| or task behavior            |
+-----------------------------+


+=======================================================================================================+
|                                    TASK / BACKGROUND LAYER                                             |
+=======================================================================================================+

+-----------------------------+
| Task.ts                     |
| - task types               |
| - task statuses            |
| - task IDs                 |
| - base task state          |
+-------------+---------------+
              |
              v
+-----------------------------+
| tasks/                      |
| - LocalAgentTask            |
| - RemoteAgentTask           |
| - local shell tasks         |
| - workflows / dreams        |
| - teammates / monitor       |
+-------------+---------------+
              |
              v
+-----------------------------+        +--------------------------------------+
| task state in AppState      |------->| components/tasks/                    |
| - running/completed/failed  |        | - dialogs / detail views             |
| - output files              |        | - background task UI                 |
| - notifications             |        +--------------------------------------+
+-----------------------------+


+=======================================================================================================+
|                                      AGENT SUBSYSTEM                                                   |
+=======================================================================================================+

                                       +------------------------------+
                                       | AgentTool                    |
                                       | tools/AgentTool/AgentTool.tsx|
                                       | - route agent request        |
                                       | - select agent definition    |
                                       | - choose local/remote/fork   |
                                       +---------------+--------------+
                                                       |
                 +-------------------------------------+-------------------------------------+
                 |                                     |                                     |
                 v                                     v                                     v
      +---------------------------+         +---------------------------+         +---------------------------+
      | Local subagent            |         | Fork/worktree agent       |         | Remote / teammate path    |
      | runAgent.ts               |         | forkSubagent.ts + utils   |         | spawnMultiAgent.ts        |
      | agentToolUtils.ts         |         | isolated context/git path |         | RemoteAgentTask.tsx       |
      +-------------+-------------+         +-------------+-------------+         +-------------+-------------+
                    |                                     |                                     |
                    +---------------------+---------------+---------------------+---------------+
                                          |                                     |
                                          v                                     v
                               +---------------------------+         +---------------------------+
                               | query loop under agent    |         | task tracking + notify    |
                               | with own tools/context    |         | parent session            |
                               +---------------------------+         +---------------------------+

                           focused deep dive: docs/agent-system-onboarding.md


+=======================================================================================================+
|                                      MCP INTEGRATION                                                   |
+=======================================================================================================+

+-----------------------------+
| services/mcp/client.ts      |
| - connect transports        |
| - auth / server state       |
| - wrap MCP tools/resources  |
+-------------+---------------+
              |
              +---------------------------+
                                          |
                                          v
                           +-------------------------------+
                           | surfaced into runtime as      |
                           | tools/resources               |
                           +---------------+---------------+
                                           |
                    +----------------------+----------------------+
                    |                                             |
                    v                                             v
      +---------------------------+                 +---------------------------+
      | ListMcpResourcesTool      |                 | ReadMcpResourceTool       |
      | and related UI/state      |                 | and related UI/state      |
      +---------------------------+                 +---------------------------+


+=======================================================================================================+
|                                   PLUGINS / SKILLS / HOOKS                                             |
+=======================================================================================================+

+-----------------------------+        +--------------------------------------+
| Plugin loader               |        | Background installation manager      |
| utils/plugins/              |<-------| services/plugins/                    |
| pluginLoader.ts             |        | PluginInstallationManager.ts         |
| - discover/validate plugins |        | - reconcile marketplaces             |
| - cache/refresh             |        | - refresh plugin state               |
+-------------+---------------+        +-------------------+------------------+
              |                                                |
              +---------------------------+--------------------+
                                          |
                                          v
                           +-------------------------------+
                           | session hook loading          |
                           | utils/sessionStart.ts         |
                           | utils/hooks.ts               |
                           | - setup hooks                |
                           | - session start hooks        |
                           | - plugin-provided hooks      |
                           +---------------+---------------+
                                           |
                                           v
                           +-------------------------------+
                           | additional context, watch     |
                           | paths, startup side effects   |
                           +-------------------------------+

                           skills/
                           - specialized capability packages
                           - can be invoked by runtime/tooling


+=======================================================================================================+
|                                     MEMORY SYSTEMS                                                     |
+=======================================================================================================+

      +---------------------------+                        +---------------------------+
      | memdir/                   |                        | SessionMemory             |
      | - memory discovery        |                        | services/SessionMemory/   |
      | - relevant memory lookup  |                        | sessionMemory.ts          |
      +-------------+-------------+                        | - background note upkeep  |
                    |                                      | - forked subagent flow    |
                    v                                      +-------------+-------------+
      +---------------------------+                                      |
      | attachment/context input  |                                      v
      | into query/session        |                        +---------------------------+
      +---------------------------+                        | memory file + UI          |
                                                           | components/memory/        |
                                                           | commands/memory/          |
                                                           +---------------------------+


+=======================================================================================================+
|                                 REMOTE / BRIDGE / SESSION TRANSPORT                                    |
+=======================================================================================================+

+-----------------------------+
| bridge/bridgeMain.ts        |
| - remote spawn/poll loop    |
| - heartbeat/reconnect       |
| - session/work handling     |
+-------------+---------------+
              |
              v
+-----------------------------+
| remote/                     |
| - remote session support    |
| - transport/runtime pieces  |
+-------------+---------------+
              |
              v
+-----------------------------+
| remote tasks reflected      |
| back into AppState + UI     |
+-----------------------------+


+=======================================================================================================+
|                                CROSS-CUTTING INFRASTRUCTURE                                             |
+=======================================================================================================+

  constants/         -> product constants, prompt constants, names, defaults
  context/           -> runtime context providers
  types/             -> shared types
  utils/             -> common helpers used across all layers
  services/analytics -> telemetry, event logging, GrowthBook flags
  services/policy*   -> remote policy and managed setting constraints
  bootstrap/         -> early process/session globals used by multiple systems


+=======================================================================================================+
|                                          FEEDBACK LOOPS                                                 |
+=======================================================================================================+

  Every major subsystem eventually feeds back into one or more of:

  1. AppState
     - source of truth for runtime/session state

  2. Messages in the query loop
     - assistant output, tool_result blocks, memory attachments, hook context

  3. Task records
     - background work lifecycle, output files, notifications

  4. UI rendering
     - REPL output, dialogs, status indicators, task details, plugin/memory notices

  5. Disk / external systems
     - files, shell commands, MCP servers, plugins, remote workers, memory files


+=======================================================================================================+
|                                       SIMPLE END-TO-END SUMMARY                                         |
+=======================================================================================================+

  terminal input
    -> REPL
    -> AppState + runtime hooks
    -> query loop
    -> model output
    -> tools / commands / tasks / agents / MCP / plugins / memory / remote systems
    -> results come back as messages + state updates + task updates
    -> UI renders the new state

```
