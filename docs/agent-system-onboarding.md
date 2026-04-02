# Agent System Onboarding Guide

This document is a practical onboarding guide to the agent subsystem in this repository.

It is written for a junior developer who needs to understand:

- what "agents" mean in this codebase
- how the full system fits together
- which files own which responsibilities
- how execution flows from a user prompt to a completed agent result
- where to debug and how to make safe changes

This guide focuses on the agent system and the pieces immediately around it: tools, query execution, task lifecycle, permissions, team agents, worktrees, and remote runs.

## 1. What This System Is

At a high level, this application is an interactive coding assistant with a tool-driven execution model. The agent subsystem is the part that lets the main assistant delegate work to other assistants.

In this codebase, an "agent" is not only a prompt. An agent is a bundle of:

- identity and purpose
- prompt/system prompt
- tool access rules
- model/effort settings
- execution mode
- permission behavior
- optional hooks, skills, memory, MCP requirements, and isolation rules

Once launched, an agent runs through the same core query/tool loop as the main assistant, but under its own context and lifecycle.

## 2. The Core Mental Model

Use this as your mental model when reading the code:

```text
Agent definition
  -> AgentTool routing
  -> runAgent execution
  -> query loop
  -> task tracking
  -> completion/failure notification
  -> parent session consumes result
```

The most important idea is that agent behavior is split across layers:

- definition layer: what the agent is allowed to do
- routing layer: what kind of agent run should happen
- execution layer: how the agent actually runs
- task layer: how the run is tracked in app state and UI
- notification layer: how the parent session is told about the outcome

## 3. Directory and File Map

If you are new to this area, these files are the main landmarks.

### Core agent files

- `tools/AgentTool/loadAgentsDir.ts`
  Loads and merges agent definitions from built-in, plugin, user, project, flag, and policy sources.
- `tools/AgentTool/builtInAgents.ts`
  Registers the built-in agents available in the current build/feature state.
- `tools/AgentTool/AgentTool.tsx`
  The main router for agent launches. This is the most important file to understand first.
- `tools/AgentTool/runAgent.ts`
  Executes an agent once it has been selected and configured.
- `tools/AgentTool/agentToolUtils.ts`
  Shared utilities for tool filtering, finalization, handoff checks, and async lifecycle handling.
- `tools/AgentTool/forkSubagent.ts`
  Special handling for forked subagents that inherit the parent conversation context.

### Task and runtime integration

- `tasks/LocalAgentTask/LocalAgentTask.tsx`
  Tracks local agent runs as tasks, including progress, completion, backgrounding, and notifications.
- `tasks/RemoteAgentTask/RemoteAgentTask.tsx`
  Tracks remote agent sessions and polling-based completion.
- `Task.ts`
  Shared task types and task state base model for all task kinds.
- `Tool.ts`
  Shared tool and tool-use context definitions. This is foundational.
- `tools.ts`
  Defines the overall tool pool and which tools exist in a given environment.
- `query.ts`
  The central model/tool execution loop used by the main assistant and agents.

### Team / swarm / teammate integration

- `tools/shared/spawnMultiAgent.ts`
  Shared teammate spawning logic.
- `tasks/InProcessTeammateTask/`
  In-process teammate task behavior.
- `utils/teammateContext.ts`
  Teammate context plumbing.
- `utils/agentContext.js`
  Per-agent execution context used for attribution and lineage.

### UI and state surfaces

- `state/AppState.tsx`
  Access to global app state store.
- `state/AppStateStore.ts`
  The actual app state shape and defaults.
- `components/tasks/`
  UI for background tasks and agent details.
- `hooks/useBackgroundTaskNavigation.ts`
  Navigation among background tasks.

## 4. Foundational Types You Must Know

Before going deeper into agent logic, you should know these core types.

### 4.1 `AgentDefinition`

Defined in `tools/AgentTool/loadAgentsDir.ts`.

This is the source of truth for agent configuration. It includes:

- `agentType`
- `whenToUse`
- `tools`
- `disallowedTools`
- `model`
- `effort`
- `permissionMode`
- `skills`
- `mcpServers`
- `hooks`
- `maxTurns`
- `memory`
- `background`
- `isolation`
- `requiredMcpServers`

There are multiple flavors:

- built-in agents
- custom agents from settings
- plugin agents

The important point is that the rest of the system works from this normalized shape.

### 4.2 `ToolUseContext`

Defined in `Tool.ts`.

This is one of the most important types in the repo. It is the runtime context passed into tools, including the agent tool.

It contains:

- current tools and commands
- current app state accessors
- abort controller
- message history
- tool permission context
- agent identity
- query source
- system prompt bytes for cache-sensitive flows
- hooks for UI and SDK integration

If you want to know "what information is available while a tool is running?", the answer is usually "look at `ToolUseContext`."

### 4.3 `Task` and `TaskStateBase`

Defined in `Task.ts`.

Agents are represented as tasks once they run asynchronously or are otherwise tracked by the system. A task has:

- `id`
- `type`
- `status`
- `description`
- `toolUseId`
- `startTime`
- `endTime`
- `outputFile`
- `notified`

Concrete task types then add their own extra state.

### 4.4 `AppState`

Defined in `state/AppStateStore.ts` and exposed via `state/AppState.tsx`.

This is the global UI/runtime state. Agent runs update this state to:

- register tasks
- update progress
- store agent registries
- record tool permission context
- surface MCP state
- let UI render running/completed agents

## 5. End-to-End Architecture

This section explains the full lifecycle from prompt to agent result.

### 5.1 System overview

```text
User prompt / model decision
  -> AgentTool is called
  -> Agent type and execution mode are resolved
  -> worker context is prepared
  -> runAgent executes the worker
  -> query loop streams tool/model activity
  -> task state is updated
  -> final result is extracted
  -> completion notification is queued
  -> parent session receives the result
```

### 5.2 High-level flow diagram

```text
+------------------+
| Main session/LLM |
+---------+--------+
          |
          | calls AgentTool
          v
+------------------------------+
| AgentTool.call()             |
| - validate input             |
| - resolve team / type        |
| - check MCP requirements     |
| - choose isolation/mode      |
+----+------------+------------+
     |            |
     |            +----------------------------+
     |                                         |
     v                                         v
team spawn path                           subagent path
     |                                         |
     v                                         v
+----------------------+             +----------------------+
| spawnTeammate()      |             | build runAgent args  |
+----------------------+             +----------+-----------+
                                                |
                                   +------------+------------+
                                   |                         |
                                   v                         v
                            remote isolation            local execution
                                   |                         |
                                   v                         v
                          registerRemoteAgentTask     sync or async task
                                                            |
                                                            v
                                                     runAgent()
                                                            |
                                                            v
                                                      query() loop
                                                            |
                                                            v
                                               finalize + notify parent
```

## 6. Layer-by-Layer Explanation

### 6.1 Agent definition loading

Main file:

- `tools/AgentTool/loadAgentsDir.ts`

This layer answers:

- What agents exist?
- Where did they come from?
- Which version wins if names collide?

The loader merges agents from several sources:

- built-in
- plugin
- user settings
- project settings
- flag-provided agents
- policy settings

There is an explicit precedence order, and later sources override earlier ones by `agentType`.

This means:

- the same logical agent name can be shadowed
- policy or project agents can override user or built-in behavior
- debugging "why did this agent prompt/tool set change?" often starts here

It also filters agents by MCP requirements and supports agent frontmatter like tools, effort, memory, background, and isolation.

### 6.2 Built-in agent registration

Main file:

- `tools/AgentTool/builtInAgents.ts`

This layer answers:

- Which built-in agents are available in this build?
- Which ones are feature-gated?

Built-in agents include things like:

- general-purpose
- explore
- plan
- statusline setup
- verification

Not all of these are always enabled. Feature flags and entrypoint conditions matter.

### 6.3 Tool surface construction

Main files:

- `tools.ts`
- `Tool.ts`

The whole app is tool-driven. `tools.ts` defines the base tool pool for the current environment. `Tool.ts` defines what a tool looks like and what runtime context it receives.

Why this matters for agents:

- agents do not independently create tools from scratch
- agents are given tools from the existing tool system
- agent tools are later filtered based on agent type, async rules, permission mode, and disallowed tool specs

If a developer says "why can't this agent see tool X?", the answer usually involves:

- the base tool pool in `tools.ts`
- filtering in `agentToolUtils.ts`
- permissions in the tool permission context

### 6.4 Agent launch and routing

Main file:

- `tools/AgentTool/AgentTool.tsx`

This is the heart of the system.

`AgentTool.call()` is responsible for deciding what kind of launch this request becomes.

It handles:

- team/teammate spawning
- normal local subagents
- forked subagents
- worktree-isolated runs
- remote runs
- sync vs async execution

It also:

- resolves the selected agent definition
- validates that required MCP servers are available
- chooses the effective isolation mode
- builds the system prompt / prompt messages
- prepares the worker tool pool
- registers background tasks if needed

This file is where most "execution mode" bugs come from, because it has the branching logic.

### 6.5 Agent execution

Main file:

- `tools/AgentTool/runAgent.ts`

`runAgent()` is the runtime engine once routing is done.

It is responsible for:

- resolving the final model
- creating the agent ID
- preparing initial message history
- cloning or creating file state caches
- building user/system context
- optionally stripping unnecessary context for read-only agents
- overriding permission mode or effort if the agent definition requests it
- resolving the final tool set for this agent
- constructing the final system prompt
- running subagent start hooks
- registering frontmatter hooks
- preloading skills
- connecting agent-specific MCP servers
- invoking the central `query()` loop

This file is best understood as:

"Take an abstract agent definition and turn it into a concrete running assistant session."

### 6.6 The query loop

Main file:

- `query.ts`

This is not specific to agents, but agents rely on it completely.

`query()` is the central conversation loop that:

- sends messages to the model
- receives streaming output
- executes tool calls
- appends tool results
- handles compaction and recovery logic
- emits progress and messages

For agent work, this means:

- the main assistant and subagents share the same execution engine
- subagents are not a totally separate runtime
- most "tool calling behavior" is inherited from the broader query system

When debugging strange tool interactions in agents, always remember that the bug may actually live in `query.ts`, tool orchestration, or tool permission code rather than in `AgentTool.tsx`.

#### How tool calls actually work inside an agent

This is one of the most important things to understand:

- an agent does not get its own separate “tool runtime”
- `runAgent()` builds an agent-specific `ToolUseContext`
- `query()` then uses that context exactly the same way it would for the main assistant

The practical flow looks like this:

```text
parent tool/runtime context
  -> AgentTool selects agent definition
  -> runAgent resolves the agent's allowed tools
  -> runAgent creates agent ToolUseContext
  -> query() streams assistant output
  -> assistant emits tool_use blocks
  -> tool orchestration executes tools with the agent context
  -> tool_result messages are appended
  -> query() continues until final output
```

What changes for the agent is not the basic tool mechanism. What changes is the context wrapped around it:

- the tool list may be smaller or more specialized
- permission mode may be overridden
- async agents may avoid direct permission prompts
- agent-specific MCP tools may be added
- cloned or fresh file-read caches may be used
- message history may be forked or rebuilt differently

That means a tool bug in an agent can live in any of these layers:

- agent routing
- tool filtering
- `ToolUseContext`
- `query.ts`
- tool orchestration
- the individual tool implementation

#### What `ToolUseContext` means for agents

For agent work, `ToolUseContext` is the bridge between “agent definition” and “actual running session”.

It carries the runtime state tools need in order to behave correctly, including:

- the resolved tool list
- app state getters and setters
- permission context
- message history
- file-read cache state
- abort controller
- agent identity
- MCP clients/resources
- system prompt bytes and query metadata

In practice, this means tools invoked by an agent are not “stateless helpers”. They execute with a full session context that knows:

- which agent is calling them
- what permissions that agent has
- what files have already been read
- what MCP servers are connected
- how updates should flow back to state and UI

### 6.7 Async task lifecycle

Main files:

- `tasks/LocalAgentTask/LocalAgentTask.tsx`
- `tools/AgentTool/agentToolUtils.ts`

Background agents are tracked as tasks.

This layer handles:

- task registration
- abort controllers
- progress updates
- backgrounding
- completion
- failure
- kill handling
- queued notifications back to the parent session

Important idea:

An async agent is not just "run a Promise in the background." It becomes a first-class task in app state, with output file tracking, progress summaries, and UI behavior.

### 6.8 Remote task lifecycle

Main file:

- `tasks/RemoteAgentTask/RemoteAgentTask.tsx`

Remote agents do not run through the same local task path after launch.

Instead, the system:

- validates remote eligibility
- teleports the work to a remote session
- registers a remote task locally
- polls remote session events
- marks completion/failure and notifies the parent

This means "remote agent" is a different lifecycle from "local async agent", even though the parent sees both as tasks.

### 6.9 Teammates and agent teams

Main files:

- `tools/shared/spawnMultiAgent.ts`
- `tools/AgentTool/AgentTool.tsx`

Teammates are not the same thing as ordinary subagents.

If `team_name` and `name` are provided, the agent tool routes to teammate spawning instead of the regular subagent path.

Important differences:

- teammates may run in-process or through tmux/pane infrastructure
- they participate in team context and mailbox behavior
- they have different lifecycle constraints
- in-process teammates cannot freely spawn every kind of background agent

If you blur teammates and subagents together while changing code, you will almost certainly break something.

### 6.10 Forked subagents

Main file:

- `tools/AgentTool/forkSubagent.ts`

Fork mode is a special path where the child inherits the parent conversation and prompt more directly.

This is especially sensitive because it is designed for:

- context inheritance
- prompt cache stability
- consistent tool definition bytes

This part of the code is subtle. Avoid casual changes here unless you fully understand why the parent system prompt bytes and message construction are handled so carefully.

### 6.11 Worktree isolation

Main file:

- `tools/AgentTool/AgentTool.tsx`

Some agent runs use a git worktree.

This exists to give an agent:

- the same repository
- the same relative layout
- a separate working copy

The system:

- creates the worktree
- runs the agent under that cwd
- checks whether the worktree changed
- removes it if unchanged
- keeps it if it contains changes

This is important for safe parallel or isolated execution.

### 6.12 Permissions and tool scoping

Main files:

- `Tool.ts`
- `tools/AgentTool/agentToolUtils.ts`
- `runAgent.ts`

Permission behavior in agents is very important.

Things to know:

- an agent may override permission mode
- async agents may be prevented from showing prompts directly
- "bubble" mode lets permission prompts surface to the parent terminal
- allowed tool rules can be scoped for the agent session
- some tools are disallowed for all agents
- some are disallowed only for custom agents
- async agents are more restricted than sync ones

This area protects both safety and UX. Be very careful when changing it.

### 6.13 MCP, hooks, skills, and memory

These are side systems, but agents can use them deeply. A lot of the “magic” in an agent run actually comes from how these systems are attached around the query loop.

Use this mental model:

```text
AgentDefinition
  -> loadAgentsDir.ts normalizes frontmatter/JSON
  -> AgentTool.tsx validates/routs the launch
  -> runAgent.ts enriches the session
      - hooks
      - skills
      - MCP clients/tools
      - memory prompt/context
  -> query.ts executes the turn
      - tool calls
      - tool results
  -> task/result flows back to parent
```

#### MCP

Agent definitions can specify:

- required MCP servers
- agent-specific MCP servers

There are two different MCP interactions to know:

##### 1. Agent availability based on MCP requirements

At load/routing time, the system can check `requiredMcpServers`.

This means:

- some agents are only available if certain MCP servers are configured
- an agent may disappear from the active agent list if its MCP requirements are not satisfied
- debugging “why is this agent missing?” can start in `loadAgentsDir.ts`, not only at launch time

##### 2. Agent runtime MCP augmentation

At runtime, `runAgent()` can initialize `mcpServers` declared on the agent and merge them with the parent session’s existing MCP clients.

That means the effective MCP view for an agent may contain:

- inherited parent MCP clients
- inherited MCP resources from the parent session
- newly connected agent-specific MCP servers
- newly created MCP-backed tools

The runtime shape is roughly:

```text
parent MCP clients/resources
  + agentDefinition.mcpServers
  -> initializeAgentMcpServers(...)
  -> merged MCP clients
  -> MCP tools added to agent tool list
  -> query/tool loop can call them like normal tools
```

The important design point is that MCP tools do not bypass the normal tool path. Once connected, they are just part of the agent’s effective tool set.

Relevant files:

- `tools/AgentTool/loadAgentsDir.ts`
- `tools/AgentTool/AgentTool.tsx`
- `tools/AgentTool/runAgent.ts`
- `services/mcp/client.ts`

#### Hooks

Agents can register frontmatter hooks, and subagent lifecycle events are treated specially.

There are two main hook interactions:

##### 1. Subagent lifecycle hooks

Before the query loop starts, `runAgent()` executes subagent start hooks and can collect additional context from them.

That context is then inserted into the agent session as an attachment-like message, which means hooks can materially change what the agent sees before it produces its first token.

##### 2. Frontmatter hooks on the agent definition

If the agent definition declares hooks, `runAgent()` can register them for the lifetime of that agent session.

Important details:

- these hooks are scoped to the agent lifecycle
- stop hooks are converted for subagent semantics
- trust/policy checks can block hook registration for some sources
- hook-added context can explain “unexpected” agent behavior

If you ever ask “where did this extra context come from?”, hooks are one of the first places to check.

Relevant files:

- `tools/AgentTool/runAgent.ts`
- `utils/sessionStart.ts`
- `utils/hooks.ts`

#### Skills

Agent definitions can preload skills, which are injected into the agent's session.

The runtime flow is:

```text
agentDefinition.skills
  -> runAgent resolves skill names
  -> skill prompts are loaded
  -> skill content is inserted as meta user messages
  -> query() starts with those messages already in context
```

So skills do not usually act like “extra tools”. They more often act like preloaded guidance or reusable prompt content attached to the agent session before normal execution begins.

This is why a skill can change agent behavior even before the first tool call happens.

Relevant files:

- `tools/AgentTool/runAgent.ts`
- `skills/`

#### Memory

Agent memory is easy to confuse with general app/session memory, so treat them separately.

##### 1. Agent frontmatter memory

An agent definition may declare a memory scope such as:

- `user`
- `project`
- `local`

That affects agent setup in two important ways.

First, during definition loading, the system can append a memory-specific prompt to the agent’s system prompt.

Second, if the agent already declares an explicit `tools` list, memory-enabled agents can have file access tools injected automatically so they can actually read or update their memory files:

- file read
- file edit
- file write

So memory is not only “extra prompt text”. It also influences the practical tool surface available to the agent.

##### 2. Agent memory snapshots

The loader can also initialize agent memory from project snapshots under:

- `.claude/agent-memory-snapshots/<agentType>/...`

That means a project can seed persistent memory for a specific agent. On first setup, the local memory directory can be initialized from that snapshot. Later, newer snapshots can trigger update prompts or sync behavior.

This is one of the main reasons agent behavior can vary across repositories even when the same built-in agent type is used.

Relevant files:

- `tools/AgentTool/loadAgentsDir.ts`
- `tools/AgentTool/agentMemorySnapshot.ts`

##### 3. Session memory and inherited context are different

Do not confuse agent frontmatter memory with:

- session memory in `services/SessionMemory/`
- hook-added context
- forked parent messages
- user/system context inherited from the parent run

All of these can affect what an agent sees, but they enter the system through different paths:

```text
agent memory
  -> agent system prompt additions
  -> memory files/tools

session memory / relevant memory
  -> broader app attachment/context systems

hooks
  -> extra attachment messages

fork mode
  -> inherited parent conversation/messages
```

This distinction matters a lot when debugging “why did the agent know that?” or “why did it edit this memory file?”

#### Tools + MCP + memory together

A useful way to think about these integrations is:

```text
base app tools
  -> filtered for this agent
  -> plus MCP tools
  -> plus memory-related file tools when needed
  -> wrapped in agent ToolUseContext
  -> executed by query()/tool orchestration
```

So when someone says:

- “this agent can’t call the tool I expected”
- “this agent can see MCP server X but not Y”
- “this agent unexpectedly edited memory files”

the answer is usually not in one file. It is the combination of:

- `loadAgentsDir.ts`
- `AgentTool.tsx`
- `runAgent.ts`
- `Tool.ts`
- `tools.ts`
- `query.ts`
- MCP client setup
- memory prompt/snapshot behavior
- permission rules

These features make agent behavior richer, but they also create more ways for a launch to fail or behave differently than expected.

## 7. Code Mapping: "Which Section Means What?"

This section is intentionally repetitive. It is meant to help a junior developer connect concepts to code quickly.

| File / area | What it means |
| --- | --- |
| `tools/AgentTool/loadAgentsDir.ts` | "Where agents come from and how they are normalized." |
| `tools/AgentTool/builtInAgents.ts` | "Which built-in agents exist right now." |
| `tools/AgentTool/AgentTool.tsx` | "How an agent request gets routed into the correct execution path." |
| `tools/AgentTool/runAgent.ts` | "How a selected agent is turned into a real running session." |
| `tools/AgentTool/agentToolUtils.ts` | "Shared agent rules: tool filtering, finalization, async lifecycle, warnings." |
| `tools/AgentTool/forkSubagent.ts` | "Special fork-mode context inheritance and prompt-cache handling." |
| `tasks/LocalAgentTask/LocalAgentTask.tsx` | "How local agent runs are tracked as tasks." |
| `tasks/RemoteAgentTask/RemoteAgentTask.tsx` | "How remote agent sessions are tracked locally." |
| `Task.ts` | "Common task model shared across task types." |
| `Tool.ts` | "The shared contract for tools and their runtime context." |
| `tools.ts` | "The base list of tools the app can expose." |
| `query.ts` | "The central model + tool execution loop." |
| `state/AppStateStore.ts` | "The data shape backing UI and runtime state." |
| `components/tasks/` | "How task state is shown to users." |
| `tools/shared/spawnMultiAgent.ts` | "Teammate spawning infrastructure." |

## 8. Execution Modes You Need To Distinguish

One of the hardest parts of this codebase is that "agent" is not one mode.

You should always ask: which mode am I changing?

### 8.1 Sync local subagent

- runs inline
- parent is waiting for result
- may stream progress directly
- usually simpler to reason about

### 8.2 Async local subagent

- registered as a task
- parent continues
- completion comes back through task notification
- needs task state, output file, and progress handling

### 8.3 Forked subagent

- inherits parent context more directly
- has special cache-sensitive prompt construction
- can be easy to break by "small cleanup" edits

### 8.4 Worktree agent

- local agent, but in isolated git worktree
- cleanup logic matters

### 8.5 Remote agent

- launched remotely
- tracked by remote task logic
- completion is polling/event based

### 8.6 Teammate

- spawned into team infrastructure
- not the same lifecycle as a normal subagent

## 9. Typical End-to-End Flows

### 9.1 Normal local async subagent

```text
Parent session
  -> AgentTool.call()
  -> resolve selected agent
  -> shouldRunAsync = true
  -> registerAsyncAgent()
  -> runAsyncAgentLifecycle()
  -> runAgent()
  -> query()
  -> progress updates
  -> finalizeAgentTool()
  -> complete task
  -> enqueue task notification
  -> parent sees completion
```

### 9.2 Worktree-isolated agent

```text
AgentTool.call()
  -> createAgentWorktree()
  -> runAgent() under worktree cwd
  -> on completion check for changes
  -> remove worktree if unchanged
  -> keep worktree if changed
```

### 9.3 Remote agent

```text
AgentTool.call()
  -> checkRemoteAgentEligibility()
  -> teleportToRemote()
  -> registerRemoteAgentTask()
  -> poll remote session
  -> mark complete/failed
  -> notify parent
```

### 9.4 Teammate spawn

```text
AgentTool.call()
  -> team_name + name detected
  -> spawnTeammate()
  -> teammate infrastructure takes over
```

## 10. How To Debug This System

When something is wrong, use the symptom to decide where to look.

### If the agent is not available

Start here:

- `loadAgentsDir.ts`
- `builtInAgents.ts`

Check:

- did the agent load?
- was it shadowed by another definition?
- is a feature gate hiding it?
- are required MCP servers missing?

### If the wrong agent path is taken

Start here:

- `AgentTool.tsx`

Check:

- did it detect teammate mode?
- did it pick fork mode?
- did isolation force remote or worktree?
- did `shouldRunAsync` change behavior?

### If the agent runs but tools are missing

Start here:

- `tools.ts`
- `agentToolUtils.ts`
- `runAgent.ts`

Check:

- is the tool in the base tool pool?
- did agent filtering remove it?
- did async restrictions remove it?
- did disallowed tools remove it?
- did permission rules remove it?

### If the agent runs but prompt/context seems wrong

Start here:

- `AgentTool.tsx`
- `runAgent.ts`
- `forkSubagent.ts`

Check:

- normal system prompt vs forked prompt path
- inherited messages
- cwd override
- skill preload
- hook-added context

### If progress or background task UI is wrong

Start here:

- `LocalAgentTask.tsx`
- `agentToolUtils.ts`
- `components/tasks/`

Check:

- was the task registered?
- are progress messages being translated into task progress?
- did the task complete/fail/kill correctly?
- was the notification enqueued once?

### If remote runs behave differently

Start here:

- `RemoteAgentTask.tsx`
- remote session utilities

## 11. Common Pitfalls

These are the mistakes most likely to trip up a new contributor.

### 11.1 Treating all agents as the same

Do not assume:

- local async agent
- local sync agent
- forked agent
- teammate
- remote agent

all use the same lifecycle. They do not.

### 11.2 Forgetting task state

If you modify async flows, you must think about:

- task registration
- progress
- completion
- kill behavior
- notification

### 11.3 Breaking permission behavior

Permissions are a cross-cutting concern. Small changes can break:

- prompt routing
- auto-deny behavior
- bubble prompts
- tool access

### 11.4 Breaking fork prompt cache behavior

Fork mode exists for very specific reasons. Avoid cosmetic prompt refactors there unless you understand the cache constraints.

### 11.5 Changing worktree behavior casually

Worktree creation and cleanup affect correctness, cleanup safety, and resume behavior.

### 11.6 Confusing parent state with subagent state

Some state changes must reach the root app state even from nested agents. That is why `ToolUseContext` has both `setAppState` and `setAppStateForTasks`.

## 12. Safe Starter Tasks For A Junior Developer

Good first changes:

- improve logging around agent selection or failure paths
- improve an agent-facing error message
- add a small guard in routing logic
- document an unclear code path
- add a focused unit test near tool filtering or agent loading
- improve a task progress label or detail view

Avoid as first tasks:

- changing forked-context prompt construction
- large permission refactors
- modifying the task-notification message contract
- changing remote lifecycle behavior
- changing definition merge precedence

## 13. Suggested Reading Order

If you want to build understanding progressively, read in this order:

1. `Task.ts`
2. `Tool.ts`
3. `tools.ts`
4. `tools/AgentTool/loadAgentsDir.ts`
5. `tools/AgentTool/builtInAgents.ts`
6. `tools/AgentTool/AgentTool.tsx`
7. `tools/AgentTool/runAgent.ts`
8. `tools/AgentTool/agentToolUtils.ts`
9. `tasks/LocalAgentTask/LocalAgentTask.tsx`
10. `tasks/RemoteAgentTask/RemoteAgentTask.tsx`
11. `tools/AgentTool/forkSubagent.ts`
12. `tools/shared/spawnMultiAgent.ts`
13. `query.ts`
14. `components/tasks/`

## 14. A One-Week Ramp-Up Plan

### Day 1

Read:

- `Task.ts`
- `Tool.ts`
- `tools.ts`

Goal:

- understand tasks, tools, and runtime context

### Day 2

Read:

- `loadAgentsDir.ts`
- `builtInAgents.ts`
- `AgentTool.tsx`

Goal:

- understand how agent selection and routing work

### Day 3

Read:

- `runAgent.ts`
- `agentToolUtils.ts`

Goal:

- understand how agents actually run

### Day 4

Read:

- `LocalAgentTask.tsx`
- `RemoteAgentTask.tsx`

Goal:

- understand lifecycle, tracking, and completion

### Day 5

Read:

- `forkSubagent.ts`
- `spawnMultiAgent.ts`

Goal:

- understand special modes: fork and teammate

### Day 6

Trace four flows on paper:

- sync subagent
- async subagent
- worktree agent
- remote agent

### Day 7

Make one tiny low-risk improvement and test it carefully.

## 15. Checklist Before Changing Agent Code

Before opening a PR in this area, ask:

- Which execution mode am I changing?
- Does this affect tool availability?
- Does this affect permission prompts or denial behavior?
- Does this affect task state?
- Does this affect notifications?
- Does this affect worktree cleanup?
- Does this affect remote runs?
- Does this affect teammates?
- Does this affect forked prompt cache behavior?

If the answer to any of these is "maybe", expand your test plan.

## 16. Glossary

### Agent

A configured assistant session with its own prompt, tool policy, and lifecycle.

### Subagent

A child agent launched by the main assistant through `AgentTool`.

### Teammate

A team-oriented peer agent launched through team infrastructure rather than the standard subagent path.

### Forked subagent

A special child agent that inherits more of the parent's conversation/prompt context.

### Task

A tracked unit of ongoing or completed background work shown in app state and UI.

### Worktree isolation

Running an agent in a separate git worktree rather than the parent's working directory.

### Remote agent

An agent launched into a remote runtime and tracked locally through remote task logic.

### MCP

Model Context Protocol servers/tools/resources that can be made available to agents.

### ToolUseContext

The runtime context object passed to tools. It is the main bridge between app state, tool execution, and agent execution.

## 17. Final Advice

If you remember only five things from this document, remember these:

1. Agents are a full runtime path, not just prompts.
2. `AgentTool.tsx` decides the path, `runAgent.ts` executes it, and task files track it.
3. Async agents live and die by task state and notifications.
4. Permissions, tools, and execution mode are tightly coupled.
5. Fork, teammate, remote, and worktree paths all have different rules.

When in doubt, trace the flow from `AgentTool.call()` outward rather than jumping straight into UI or helper files.
