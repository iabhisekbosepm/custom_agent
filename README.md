<p align="center">
  <img src="https://img.shields.io/badge/custom--agents-v1.1.0-blue?style=for-the-badge" alt="Version" />
</p>

<h1 align="center">Custom Agents</h1>

<p align="center">
  <strong>An open-source, terminal-native AI coding assistant. Like Claude Code — but you own it.</strong>
</p>

<p align="center">
  <a href="#quickstart">Quickstart</a> &nbsp;&bull;&nbsp;
  <a href="#features">Features</a> &nbsp;&bull;&nbsp;
  <a href="#agents">Agents</a> &nbsp;&bull;&nbsp;
  <a href="#tools">Tools</a> &nbsp;&bull;&nbsp;
  <a href="#configuration">Configuration</a> &nbsp;&bull;&nbsp;
  <a href="#development">Development</a>
</p>

<p align="center">
  <img src="https://img.shields.io/github/license/iabhisekbosepm/custom_agent?style=flat-square" alt="License" />
  <img src="https://img.shields.io/github/stars/iabhisekbosepm/custom_agent?style=flat-square" alt="Stars" />
  <img src="https://img.shields.io/badge/runtime-Bun-f472b6?style=flat-square" alt="Bun" />
  <img src="https://img.shields.io/badge/UI-Ink%20%2B%20React-61dafb?style=flat-square" alt="Ink + React" />
</p>

---

## What is Custom Agents?

Custom Agents is a **terminal-based AI coding assistant** that runs entirely on your machine. It gives you specialized AI agents — explorer, coder, reviewer, documenter, and architect — that can read, write, search, and reason about your codebase. Think of it as your own local Claude Code, powered by **any OpenAI-compatible API** (OpenRouter, OpenAI, Ollama, LM Studio).

You type in your terminal. The agent thinks, reads files, edits code, runs commands, and talks back. No browser. No IDE plugin. Just your terminal.

---

## How It Works

| Step | What Happens |
|------|-------------|
| **1. You ask** | Type a question or instruction in the terminal |
| **2. Agent thinks** | The AI reads files, searches code, plans edits |
| **3. Code changes** | Files are edited, created, or reviewed — with diffs shown inline |

---

## Works With

Any LLM provider that speaks the OpenAI API format:

<p align="center">
  <strong>OpenRouter</strong> &nbsp;&bull;&nbsp;
  <strong>OpenAI</strong> &nbsp;&bull;&nbsp;
  <strong>Ollama</strong> &nbsp;&bull;&nbsp;
  <strong>LM Studio</strong> &nbsp;&bull;&nbsp;
  <strong>Any OpenAI-compatible API</strong>
</p>

---

## Who Is This For?

- **Developers** who want an AI assistant that lives in the terminal
- **Teams** who want to self-host their coding AI (no data leaves your infra with Ollama/LM Studio)
- **Tinkerers** who want to extend, customize, and build their own agent workflows
- **Anyone** tired of copy-pasting between ChatGPT and their editor

---

<h2 id="features">Features</h2>

| | | |
|---|---|---|
| **🤖 5 Specialized Agents** | **🔧 35+ Built-in Tools** | **⚡ Slash Commands** |
| Explorer, Coder, Reviewer, Documenter, Architect — each with scoped permissions and tool access | File I/O, grep, glob, shell, web search, task management, LSP, and more | `/explain`, `/commit`, `/diff`, `/plan`, `/find`, `/status`, `/agent` and more |
| **🧠 Context Compaction** | **💾 Session Persistence** | **🔌 Plugin System** |
| Auto-summarizes conversation when approaching token budget (120K default) | Resume previous sessions — transcripts are saved and reloadable | Extend with custom tools, hooks, and skills |
| **📋 Task Management** | **🏗️ Plan Mode** | **🧩 Custom Agents** |
| Create, track, and manage tasks with dependencies — all from the terminal | Explore and plan before coding. Approve the approach, then execute | Define your own agents with custom tool sets and system prompts |
| **👥 Agent Teams** | **📬 Inter-Agent Mailbox** | **🔗 Task Dependencies** |
| Spawn N agents that run in parallel, coordinated by a team lead | Teammates communicate via in-memory mailbox (send, broadcast, peek) | Tasks support blockedBy/blocks with atomic claiming and auto-unblock |
| **🎯 Custom Skills** | **📋 Kanban Board** | |
| Create your own `/slash` commands from natural language — persisted across sessions | Persistent project board with columns (backlog → done), cards, sub-tasks, and real-time agent progress tracking via `/board` | |

---

## Without Custom Agents vs. With Custom Agents

| Without | With |
|---------|------|
| Copy-paste code into ChatGPT, lose context | Agent reads your actual files and understands your project |
| Manually apply suggested edits | Agent writes and edits files directly, with diffs |
| Switch between browser and terminal | Everything happens in your terminal |
| One-size-fits-all generic AI | Specialized agents (explorer, coder, reviewer, documenter, architect) for different tasks |
| Run one task at a time | Spawn parallel agent teams that coordinate and communicate |
| Vendor lock-in to one provider | Use any OpenAI-compatible API — switch models anytime |

---

<h2 id="quickstart">Quickstart</h2>

### One-liner install (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/iabhisekbosepm/custom_agent/main/install.sh | bash
```

The installer will:
1. Install [Bun](https://bun.sh) if not present
2. Download the source to `~/.custom-agents-cli/`
3. Prompt you for your **OPENAI_API_KEY**, **OPENAI_BASE_URL**, and **MODEL**
4. Set up the `custom-agents` command globally

Then use it anywhere:

```bash
cd ~/any-project
custom-agents
```

### Update

```bash
curl -fsSL https://raw.githubusercontent.com/iabhisekbosepm/custom_agent/main/install.sh | bash -s -- --update
```

### Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/iabhisekbosepm/custom_agent/main/uninstall.sh | bash
```

---

<h2 id="agents">Agents</h2>

Five built-in agents, each designed for a specific workflow:

| Agent | Purpose | Key Tools | Max Turns |
|-------|---------|-----------|-----------|
| **Explorer** | Codebase exploration & search | `grep`, `glob`, `file_read`, `shell`, `web_search`, `tool_search`, `kanban` | 8 |
| **Coder** | Code generation & editing | `grep`, `glob`, `file_read/write/edit`, `shell`, `lsp`, `repl`, `web_*`, `kanban` | 15 |
| **Reviewer** | Code review & analysis | `grep`, `glob`, `file_read`, `shell`, `lsp`, `web_search`, `kanban` | 10 |
| **Documenter** | Documentation generation | `grep`, `glob`, `file_read/write/edit`, `shell`, `web_*`, `tool_search`, `kanban` | 12 |
| **Architect** | Architecture analysis & design | `grep`, `glob`, `file_read`, `shell`, `lsp`, `web_*`, `tool_search`, `kanban` | 12 |

All agents also have access to task management tools (`task_create`, `task_list`, `task_get`, `task_update`), the `kanban` tool for real-time board progress updates, and `tool_search` for discovering available capabilities. Solo agents receive a **scoped tool registry** containing only their allowed tools (matching the team agent pattern).

You can also create **custom agents** with `/agent` — define your own tool sets, system prompts, and constraints.

### Agent Teams

Spawn multiple agents that work **in parallel** on related tasks, coordinated by a team lead:

| Feature | Description |
|---------|-------------|
| **Parallel Execution** | All teammates run concurrently via `Promise.allSettled()` |
| **In-Memory Mailbox** | Teammates communicate via send, broadcast, and peek messages |
| **Task Dependencies** | Tasks support `blockedBy`/`blocks` with atomic claiming and auto-unblock |
| **Scoped Registries** | Each teammate gets only the tools their agent type is allowed to use |
| **Real-time UI** | Terminal displays team status, teammate progress, and active tool calls |

```
> Create a team with an explorer and a reviewer to analyze the src/query/ directory
```

The lead agent creates the team, teammates run in parallel, and the lead synthesizes their outputs into a final result.

---

<h2 id="tools">Tools</h2>

35+ built-in tools across 9 categories:

| Category | Tools |
|----------|-------|
| **File Operations** | `file_read`, `file_write`, `file_edit` |
| **Search** | `grep`, `glob`, `tool_search` |
| **Shell** | `shell` (execute any command) |
| **Web** | `web_search`, `web_fetch` |
| **Task Management** | `task_create`, `task_list`, `task_get`, `task_update`, `task_stop`, `task_output` |
| **Agent Orchestration** | `agent_spawn`, `agent_create` |
| **Skill Management** | `skill_create`, `skill_list` |
| **Team Coordination** | `team_create`, `team_status`, `team_message`, `team_check_messages`, `team_task_claim` |
| **Kanban Board** | `kanban` (add/move/archive cards, manage sub-tasks, track progress) |
| **Code Quality** | `lsp`, `notebook_edit` |
| **Mode Control** | `enter_plan_mode`, `exit_plan_mode` |

---

## Slash Commands

| Command | Description |
|---------|-------------|
| `/explain` | Explain code in detail |
| `/commit` | Generate a git commit message |
| `/status` | Show project status (git, tasks, session) |
| `/find` | Find files or code in your project |
| `/diff` | Show side-by-side diff of uncommitted changes |
| `/compact` | Compact conversation context to save tokens |
| `/plan` | Enter planning mode — explore before implementing |
| `/brief` | Toggle brief/compact output mode |
| `/agent` | Create a custom agent from natural language |
| `/skill` | Create a custom slash command from natural language |
| `/board` | View and manage the project Kanban board (add cards, run tasks, track progress) |

---

<h2 id="configuration">Configuration</h2>

After install, your config lives at `~/.custom-agents/config.env`:

```env
OPENAI_API_KEY=sk-your-key-here
OPENAI_BASE_URL=https://openrouter.ai/api/v1
MODEL=openrouter/auto
LOG_LEVEL=info
MAX_TURNS=20
CONTEXT_BUDGET=120000
```

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | Your API key (OpenAI, OpenRouter, etc.) | — |
| `OPENAI_BASE_URL` | API endpoint URL | `https://openrouter.ai/api/v1` |
| `MODEL` | Model to use | `openrouter/auto` |
| `LOG_LEVEL` | Logging verbosity (`debug`, `info`, `warn`, `error`) | `info` |
| `MAX_TURNS` | Max agent turns per query | `20` |
| `CONTEXT_BUDGET` | Token budget before context compaction | `120000` |

**Per-project override:** Drop a `.env` file in your project root — it takes priority over the global config.

---

<h2 id="development">Development</h2>

```bash
git clone https://github.com/iabhisekbosepm/custom_agent.git
cd custom_agent
cp .env.example .env        # Add your API key
bun install                  # Install dependencies
bun run src/index.ts         # Start the app
bun --watch run src/index.ts # Dev mode (hot reload)
bun test                     # Run tests
bun x tsc --noEmit           # Type check
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | [Bun](https://bun.sh) |
| Language | TypeScript (strict, ESNext) |
| UI | React 18 + [Ink](https://github.com/vadimdemedes/ink) (terminal) |
| Validation | Zod |
| LLM API | OpenAI-compatible streaming |

### Project Structure

```
src/
├── agents/       # Agent system (explorer, coder, reviewer, documenter, architect)
├── components/   # Ink terminal UI components
├── entrypoints/  # CLI launch + initialization
├── hooks/        # Typed lifecycle event system
├── memory/       # File-based persistent memory
├── persistence/  # Session transcript persistence
├── plugins/      # Extensibility layer (tools, hooks, skills)
├── query/        # Core AI query loop + streaming + compaction
├── screens/      # Terminal screens (REPL)
├── services/     # Background services
├── skills/       # Slash commands
├── state/        # Application state management
├── tasks/        # Task tracking with dependencies + claiming
├── teams/        # Agent Teams (parallel multi-agent coordination)
├── kanban/       # Persistent Kanban board (KanbanStore, cards, tasks)
├── tools/        # 35+ built-in tools
├── types/        # Shared types
└── utils/        # Utilities (logger, diff, env, shutdown)
```

---

## Roadmap

- [x] Core query loop with streaming
- [x] 5 specialized agents (explorer, coder, reviewer, documenter, architect)
- [x] 35+ built-in tools
- [x] Slash commands
- [x] Context compaction
- [x] Session persistence
- [x] One-liner install (`curl | bash`)
- [x] Custom agent creation
- [x] Agent Teams — parallel multi-agent coordination with mailbox + task dependencies
- [x] Custom skills — user-defined slash commands that persist across sessions
- [x] Kanban board — persistent project board with agent-driven task execution and real-time progress
- [ ] RAG (Retrieval-Augmented Generation) for large codebases
- [ ] MCP (Model Context Protocol) server support
- [ ] Multi-model orchestration
- [ ] VS Code extension

---

## FAQ

**Q: Is this a Claude Code clone?**
A: Inspired by it, yes. But Custom Agents is open-source, works with any LLM provider, and is fully extensible with plugins, custom agents, and hooks.

**Q: Does my code leave my machine?**
A: Only if you use a cloud API (OpenRouter, OpenAI). Use Ollama or LM Studio for fully local, offline operation.

**Q: Can I use GPT-4, Claude, Llama, Qwen, etc.?**
A: Yes — any model accessible through an OpenAI-compatible API endpoint.

**Q: How is this different from Cursor/Copilot?**
A: Custom Agents runs in your terminal, not an IDE. It's open-source, provider-agnostic, and gives you full control over agent behavior through custom agents and plugins.

---

## Contributing

Contributions are welcome! Open an issue or submit a PR.

```bash
git clone https://github.com/iabhisekbosepm/custom_agent.git
cd custom_agent
bun install
bun test
```

---

## License

MIT

---

<p align="center">
  <strong>Built by <a href="https://github.com/iabhisekbosepm">Abhisek Bose</a></strong>
  <br/>
  <sub>Your terminal. Your agents. Your rules.</sub>
</p>
