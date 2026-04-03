import { join } from "path";
import type { AppConfig } from "../types/config.js";
import type { AppStateStore } from "../state/AppStateStore.js";
import { createAppStateStore } from "../state/AppStateStore.js";
import { createLogger, type Logger } from "../utils/logger.js";
import { loadEnvConfig } from "../utils/env.js";
import { generateId } from "../utils/id.js";
import { installShutdownHandlers, onShutdown } from "../utils/shutdown.js";
import { ToolRegistry } from "../tools/registry.js";
import { FileReadTool } from "../tools/FileReadTool/FileReadTool.js";
import { FileWriteTool } from "../tools/FileWriteTool/FileWriteTool.js";
import { FileEditTool } from "../tools/FileEditTool/FileEditTool.js";
import { GrepTool } from "../tools/GrepTool/GrepTool.js";
import { GlobTool } from "../tools/GlobTool/GlobTool.js";
import { ShellTool } from "../tools/ShellTool/ShellTool.js";
import { createAgentSpawnTool } from "../tools/AgentSpawnTool/AgentSpawnTool.js";
// Task tools (factory-based)
import { createTaskCreateTool } from "../tools/TaskCreateTool/TaskCreateTool.js";
import { createTaskListTool } from "../tools/TaskListTool/TaskListTool.js";
import { createTaskGetTool } from "../tools/TaskGetTool/TaskGetTool.js";
import { createTaskUpdateTool } from "../tools/TaskUpdateTool/TaskUpdateTool.js";
import { createTaskOutputTool } from "../tools/TaskOutputTool/TaskOutputTool.js";
import { createTaskStopTool } from "../tools/TaskStopTool/TaskStopTool.js";
// Web tools
import { WebFetchTool } from "../tools/WebFetchTool/WebFetchTool.js";
import { WebSearchTool } from "../tools/WebSearchTool/WebSearchTool.js";
// Utility tools
import { AskUserQuestionTool } from "../tools/AskUserQuestionTool/AskUserQuestionTool.js";
import { SleepTool } from "../tools/SleepTool/SleepTool.js";
import { createToolSearchTool } from "../tools/ToolSearchTool/ToolSearchTool.js";
import { TodoWriteTool } from "../tools/TodoWriteTool/TodoWriteTool.js";
// Code & notebook tools
import { NotebookEditTool } from "../tools/NotebookEditTool/NotebookEditTool.js";
import { LSPTool } from "../tools/LSPTool/LSPTool.js";
import { REPLTool } from "../tools/REPLTool/REPLTool.js";
// Config & mode tools
import { ConfigTool } from "../tools/ConfigTool/ConfigTool.js";
import { BriefTool } from "../tools/BriefTool/BriefTool.js";
import { EnterPlanModeTool } from "../tools/EnterPlanModeTool/EnterPlanModeTool.js";
import { ExitPlanModeTool } from "../tools/ExitPlanModeTool/ExitPlanModeTool.js";
// Communication tools
import { SendMessageTool } from "../tools/SendMessageTool/SendMessageTool.js";
import { SyntheticOutputTool } from "../tools/SyntheticOutputTool/SyntheticOutputTool.js";
import { MemoryStore } from "../memory/index.js";
import { SessionPersistence } from "../persistence/SessionPersistence.js";
import { HookManager } from "../hooks/index.js";
import { TaskManager } from "../tasks/TaskManager.js";
import { AgentRouter } from "../agents/AgentRouter.js";
import { builtinAgents } from "../agents/builtinAgents.js";
import { CustomAgentStore } from "../agents/customAgentStore.js";
import { createAgentCreateTool } from "../tools/AgentCreateTool/AgentCreateTool.js";
import { SkillRegistry } from "../skills/index.js";
import { builtinSkills } from "../skills/builtinSkills.js";
import { CustomSkillStore } from "../skills/customSkillStore.js";
import { createSkillCreateTool } from "../tools/SkillCreateTool/SkillCreateTool.js";
import { createSkillListTool } from "../tools/SkillListTool/SkillListTool.js";
import { PluginManager } from "../plugins/index.js";
import { ServiceManager } from "../services/index.js";
import { TeamManager } from "../teams/TeamManager.js";
// Team tools
import { createTeamCreateTool } from "../tools/TeamCreateTool/TeamCreateTool.js";
import { createTeamStatusTool } from "../tools/TeamStatusTool/TeamStatusTool.js";
import { createTeamMessageTool } from "../tools/TeamMessageTool/TeamMessageTool.js";
import { createTeamCheckMessagesTool } from "../tools/TeamCheckMessagesTool/TeamCheckMessagesTool.js";
import { createTeamTaskClaimTool } from "../tools/TeamTaskClaimTool/TeamTaskClaimTool.js";
// Kanban
import { KanbanStore } from "../kanban/KanbanStore.js";
import { createKanbanTool } from "../tools/KanbanTool/KanbanTool.js";
import { ModelProfileStore } from "../models/ModelProfileStore.js";

/** Base directory for all persisted data. */
const DATA_DIR = join(process.cwd(), ".custom-agents");

const DEFAULT_SYSTEM_PROMPT = `You are a helpful AI coding assistant running in a terminal. You have tools for understanding and modifying codebases.

Core file tools:
- grep: Search file contents by regex pattern. Use this FIRST to understand a codebase.
- glob: Find files by name pattern. Use to discover project structure.
- file_read: Read a specific file's contents with line numbers.
- file_write: Create a new file or fully replace a file's contents.
- file_edit: Make targeted edits by replacing exact string matches. Preferred over file_write for small changes.
- shell: Execute shell commands for git, build tools, tests, etc.
- agent_spawn: Spawn a sub-agent for specialized tasks (explorer, coder, reviewer, documenter, architect, and any custom agents).
- agent_create: Create a new custom agent definition that persists across sessions.

Task management:
- task_create: Create a new task for tracking work.
- task_list: List all tasks, optionally filtered by status.
- task_get: Get full details of a specific task.
- task_update: Update a task's status (pending→running→completed/failed/cancelled).
- task_output: Retrieve the output of a completed task.
- task_stop: Cancel a running or pending task.

Web access:
- web_fetch: Fetch content from a URL and return plain text.
- web_search: Search the web via DuckDuckGo.

Utility tools:
- ask_user: Ask the user a question and wait for their response.
- sleep: Pause execution for a specified duration (max 30s).
- tool_search: Search available tools by name or description.
- todo_write: Write/append todo items to a persistent file.
- skill_create: Create a custom slash command that persists across sessions.
- skill_list: List all available skills/slash commands.
- kanban: Manage the project Kanban board (add/move/list cards and tasks). The board persists across sessions.

Code & notebook tools:
- notebook_edit: Edit Jupyter notebook cells (replace/insert/delete).
- lsp_diagnostics: Run TypeScript or ESLint diagnostics.
- repl: Execute code snippets (TypeScript, JavaScript, Python).

Config & mode tools:
- config_view: View current application configuration.
- brief_toggle: Toggle compact output mode.
- enter_plan_mode: Enter planning mode for exploring before implementing.
- exit_plan_mode: Exit planning mode and begin implementation.

Communication tools:
- send_message: Append a system message (info/warning/error) to the conversation.
- synthetic_output: Return pre-formatted content (markdown, json, table).

Team coordination:
- team_create: Create and run a team of agents working in parallel on related tasks.
- team_status: Check the status of a team and its teammates.

Slash commands available to users: /explain, /commit, /status, /find, /diff, /brief, /plan, /agent, /skill, /board

Kanban board workflow:
The kanban tool manages a persistent project board (.custom-agents/kanban.json) with columns: backlog → planning → in-progress → review → done.
When the user asks you to "run", "execute", "work on", or "complete" a kanban card:
1. Read the card details from the board (use kanban action "list" if needed).
2. Move the card to "in-progress" (action "move_card").
3. Break the card into sub-tasks if it doesn't have any (action "add_task").
4. Spawn the appropriate agent (agent_spawn) to do the actual work described in the card.
   - For codebase understanding/exploration → use "explorer" agent.
   - For code writing/editing → use "coder" agent.
   - For code review → use "reviewer" agent.
   - For documentation → use "documenter" agent.
   - For architecture/design → use "architect" agent.
5. After the agent completes, toggle sub-tasks as done (action "toggle_task").
6. When all work is finished, move the card to "review" or "done" (action "move_card").
Do NOT just move the card — you must spawn an agent to actually perform the work.

Workflow for understanding code:
1. Use glob to find relevant files
2. Use grep to search for patterns, definitions, and usages
3. Use file_read to examine specific files in detail

Be concise and direct. Prefer grep and glob over shell commands for searching.`;

export interface InitResult {
  config: AppConfig;
  store: AppStateStore;
  registry: ToolRegistry;
  hooks: HookManager;
  log: Logger;
  abortController: AbortController;
  memory: MemoryStore;
  sessionPersistence: SessionPersistence;
  sessionId: string;
  taskManager: TaskManager;
  agentRouter: AgentRouter;
  skillRegistry: SkillRegistry;
  pluginManager: PluginManager;
  serviceManager: ServiceManager;
  teamManager: TeamManager;
  kanbanStore: KanbanStore;
  modelProfileStore: ModelProfileStore;
}

/**
 * Initialize the application: validate env, build config, create stores,
 * register tools, set up agents/skills/plugins, install shutdown handlers.
 */
export async function initialize(): Promise<InitResult> {
  // Load and validate environment
  const env = loadEnvConfig();

  // Build app config
  const config: AppConfig = {
    apiKey: env.OPENAI_API_KEY,
    baseUrl: env.OPENAI_BASE_URL,
    model: env.MODEL,
    logLevel: env.LOG_LEVEL,
    maxTurns: env.MAX_TURNS,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    contextBudget: env.CONTEXT_BUDGET,
  };

  // Create logger
  const log = createLogger(config.logLevel, "app");

  // Generate session ID
  const sessionId = generateId();
  log.info(`Session: ${sessionId}`);

  // Create memory store and ensure directories exist
  const memoryDir = join(DATA_DIR, "memory");
  const memory = new MemoryStore(memoryDir, sessionId, log);
  await memory.init();

  // Create session persistence
  const sessionPersistence = new SessionPersistence(DATA_DIR, log);
  await sessionPersistence.init();

  // Create app state store
  const store = createAppStateStore(config.model);

  // Create hook manager
  const hooks = new HookManager(log);

  // Create task manager
  const taskManager = new TaskManager(log);

  // Create agent router and register built-in agents
  const agentRouter = new AgentRouter();
  for (const agent of builtinAgents) {
    agentRouter.register(agent);
  }
  // Load and register persisted custom agents
  const customAgentStore = new CustomAgentStore(DATA_DIR);
  const customAgents = await customAgentStore.load();
  for (const agent of customAgents) {
    if (!agentRouter.has(agent.name)) {
      agentRouter.register(agent);
    } else {
      log.warn(`Skipping custom agent "${agent.name}": conflicts with built-in`);
    }
  }

  log.info("Registered agents", {
    agents: agentRouter.list().map((a) => a.name),
  });

  // Create skill registry and register built-in skills
  const skillRegistry = new SkillRegistry();
  for (const skill of builtinSkills) {
    skillRegistry.register(skill);
  }

  // Load and register persisted custom skills
  const customSkillStore = new CustomSkillStore(DATA_DIR);
  const customSkills = await customSkillStore.load();
  for (const skill of customSkills) {
    if (!skillRegistry.get(skill.name)) {
      skillRegistry.register(CustomSkillStore.toSkillDefinition(skill));
    } else {
      log.warn(`Skipping custom skill "${skill.name}": conflicts with built-in`);
    }
  }

  log.info("Registered skills", {
    skills: skillRegistry.list().map((s) => s.name),
  });

  // Create kanban store (needed early for agent spawn tool)
  const kanbanStore = new KanbanStore(DATA_DIR);

  // Create model profile store (per-agent model overrides)
  const modelProfileStore = new ModelProfileStore(DATA_DIR);

  // Create tool registry and register tools
  const registry = new ToolRegistry();
  registry.register(GrepTool);
  registry.register(GlobTool);
  registry.register(FileReadTool);
  registry.register(FileWriteTool);
  registry.register(FileEditTool);
  registry.register(ShellTool);
  registry.register(createAgentSpawnTool(agentRouter, taskManager, hooks, registry, kanbanStore, modelProfileStore));
  registry.register(createAgentCreateTool(agentRouter, customAgentStore));

  // Task management tools (factory — need taskManager)
  registry.register(createTaskCreateTool(taskManager));
  registry.register(createTaskListTool(taskManager));
  registry.register(createTaskGetTool(taskManager));
  registry.register(createTaskUpdateTool(taskManager));
  registry.register(createTaskOutputTool(taskManager));
  registry.register(createTaskStopTool(taskManager));

  // Web tools
  registry.register(WebFetchTool);
  registry.register(WebSearchTool);

  // Utility tools
  registry.register(AskUserQuestionTool);
  registry.register(SleepTool);
  registry.register(createToolSearchTool(registry));
  registry.register(TodoWriteTool);

  // Code & notebook tools
  registry.register(NotebookEditTool);
  registry.register(LSPTool);
  registry.register(REPLTool);

  // Config & mode tools
  registry.register(ConfigTool);
  registry.register(BriefTool);
  registry.register(EnterPlanModeTool);
  registry.register(ExitPlanModeTool);

  // Communication tools
  registry.register(SendMessageTool);
  registry.register(SyntheticOutputTool);

  // Skill tools
  registry.register(createSkillCreateTool(skillRegistry, customSkillStore));
  registry.register(createSkillListTool(skillRegistry));

  // Kanban board (persistent project planning)
  registry.register(createKanbanTool(kanbanStore));

  // Create team manager
  const teamManager = new TeamManager(agentRouter, taskManager, hooks, registry, log, modelProfileStore);

  // Team tools (need teamManager + registry for scoped registries)
  // team_message, team_check_messages, team_task_claim are registered in the base
  // registry so they are available for buildTeammateRegistry to pick up.
  registry.register(createTeamMessageTool(teamManager, hooks));
  registry.register(createTeamCheckMessagesTool(teamManager));
  registry.register(createTeamTaskClaimTool(taskManager));
  // Lead-only tools
  registry.register(createTeamCreateTool(teamManager, config, registry));
  registry.register(createTeamStatusTool(teamManager));

  log.info("Registered tools", {
    tools: registry.list().map((t) => t.name),
  });

  // Create plugin manager
  const pluginManager = new PluginManager(log);
  await pluginManager.activateAll();

  // Create service manager
  const serviceManager = new ServiceManager(log);

  // Create abort controller for graceful cancellation
  const abortController = new AbortController();

  // Install shutdown handlers
  installShutdownHandlers();

  // Save session and emit session:end on shutdown
  onShutdown(async () => {
    const state = store.get();
    if (state.messages.length > 0) {
      await sessionPersistence.save(sessionId, state.messages, config.model);
      log.info("Session saved on shutdown");
    }
    await hooks.emit("session:end", {
      sessionId,
      messageCount: state.messages.length,
    });
  });

  // Stop services and deactivate plugins on shutdown
  onShutdown(async () => {
    await serviceManager.stopAll();
    await pluginManager.deactivateAll();
  });

  onShutdown(() => {
    abortController.abort();
    log.info("Abort signal sent");
  });

  log.info("Initialization complete", {
    model: config.model,
    dataDir: DATA_DIR,
  });

  // Emit session:start
  await hooks.emit("session:start", { sessionId, model: config.model });

  return {
    config,
    store,
    registry,
    hooks,
    log,
    abortController,
    memory,
    sessionPersistence,
    sessionId,
    taskManager,
    agentRouter,
    skillRegistry,
    pluginManager,
    serviceManager,
    teamManager,
    kanbanStore,
    modelProfileStore,
  };
}
