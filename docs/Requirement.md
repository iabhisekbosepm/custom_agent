I want you to build a custom AI coding assistant runtime from scratch in TypeScript, following a clean modular architecture similar to advanced agentic CLIs, but do NOT use LangChain, AutoGen, CrewAI, LlamaIndex, or any external agent framework. Build a custom system.

Goals:
- Custom agent orchestration
- Custom core model loop
- Custom tool system
- Plugin / skill / hook architecture
- Memory systems
- Background task system
- Clear developer onboarding docs
- Production-quality folder structure

Tech stack:
- TypeScript
- Node.js or Bun
- React + Ink for terminal UI
- Zod for schemas
- File-based persistence initially
- MCP support as a later extension point
- No database required for v1 unless clearly justified

Build the system as a real codebase, not a demo. Prefer correctness, modularity, and maintainability over shortcuts.

I want these architecture layers:

1. CLI and startup layer
- entrypoint
- config loading
- env handling
- feature flags
- initialization lifecycle
- graceful shutdown

2. App runtime and UI layer
- App shell
- REPL screen
- global app state
- task/status dialogs
- terminal-friendly UX

3. Core model execution loop
- message normalization
- system prompt handling
- streaming model responses
- tool call detection
- tool result injection
- retries, aborts, and max-turn handling
- support for sync and async agent runs

4. Tool system
- base Tool interface
- tool registry
- tool filtering and permission model
- tool execution orchestration
- example tools:
  - file read
  - file write/edit
  - shell command
  - web fetch
  - task output
  - agent spawn

5. Agent orchestration
- AgentDefinition model
- built-in agents and custom agents
- agent router
- runAgent runtime
- support for:
  - sync subagents
  - async background subagents
  - forked-context subagents
  - optional worktree-isolated agents
- task tracking for agents
- agent notifications back to parent session

6. Task system
- task types
- task lifecycle
- status transitions
- output persistence
- background progress updates
- cancellation/kill behavior

7. Plugin / skill / hook system
- plugin discovery and loading
- skill definitions and prompt-based skills
- lifecycle hooks:
  - session start
  - subagent start
  - stop/completion hooks
- safe registration boundaries
- simple example plugin and skill

8. Memory system
- file-based memory
- project memory
- user memory
- session memory
- memory attachment/injection into context
- memory update flows
- clear separation between runtime state and persistent memory

9. Persistence
- file-backed settings
- transcript/session logs
- task output files
- memory files
- avoid introducing a DB unless required

10. Documentation
- architecture overview
- onboarding guide for junior developers
- ASCII diagrams for core flows
- code-to-responsibility mapping

What I want from you:
- First inspect the repo/workspace and create the architecture
- Then scaffold the full folder structure
- Then implement the system incrementally
- After each major step, explain what was added and why
- Add concise comments only where useful
- Add docs as you go
- Use apply_patch for edits
- Do not leave placeholders unless absolutely necessary
- If something is too large for one pass, complete a strong vertical slice first

Important design constraints:
- Keep agent orchestration custom
- Keep the query loop independent from UI
- Make tools reusable across main assistant and subagents
- Make app state explicit and traceable
- Make task lifecycle first-class
- Make memory and hooks composable, not hardcoded
- Prefer simple interfaces over clever abstractions
- Write code so a junior developer can follow the flow

Directory target:
- entrypoints/
- state/
- screens/
- components/
- query/
- tools/
- tasks/
- agents/
- plugins/
- skills/
- hooks/
- memory/
- services/
- utils/
- docs/

Please start with:
1. a short architecture plan
2. the proposed folder structure
3. the foundational types and interfaces
4. the first implementation slice: CLI startup + AppState + REPL shell + query loop skeleton + tool registry skeleton
