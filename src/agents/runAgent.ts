import type { AgentDefinition, AgentInstance } from "./AgentDefinition.js";
import type { AppConfig } from "../types/config.js";
import type { ToolRegistry } from "../tools/registry.js";
import { ToolRegistry as ToolRegistryClass } from "../tools/registry.js";
import type { HookManager } from "../hooks/index.js";
import type { Logger } from "../utils/logger.js";
import type { TaskManager } from "../tasks/TaskManager.js";
import type { Message, UserMessage, SystemMessage } from "../types/messages.js";
import type { KanbanStore } from "../kanban/KanbanStore.js";
import { generateId } from "../utils/id.js";
import { runQueryLoop } from "../query/query.js";
import { createStore } from "../state/store.js";
import { createDefaultAppState, type AppState, type ActiveToolCall } from "../state/AppStateStore.js";

export interface RunAgentOptions {
  definition: AgentDefinition;
  userMessage: string;
  parentMessages?: Message[];
  config: AppConfig;
  registry: ToolRegistry;
  hooks: HookManager;
  taskManager: TaskManager;
  log: Logger;
  /** Called once the agent's parent task is created, before the query loop starts. */
  onTaskCreated?: (taskId: string) => void;
  /** Called whenever the agent's internal tool calls change, for real-time UI updates. */
  onAgentActivity?: (toolCalls: ActiveToolCall[]) => void;
  /** Optional KanbanStore for injecting board context into agent runs. */
  kanbanStore?: KanbanStore;
}

/**
 * Spawn and run an agent. Creates a task, runs the query loop
 * with the agent's system prompt and tool restrictions, returns the result.
 *
 * For "sync" mode: awaits the full result.
 * For "background" mode: caller should not await (fire and forget).
 */
export async function runAgent(opts: RunAgentOptions): Promise<{
  instance: AgentInstance;
  output: string;
}> {
  const { definition, userMessage, config, registry, hooks, taskManager, log } = opts;

  // Create a task for tracking
  const task = taskManager.create({
    description: `Agent: ${definition.name} — ${userMessage.slice(0, 100)}`,
    metadata: { agentName: definition.name },
  });
  opts.onTaskCreated?.(task.id);
  taskManager.transition(task.id, "running");

  const abortController = new AbortController();
  const instance: AgentInstance = {
    id: generateId(),
    definitionName: definition.name,
    taskId: task.id,
    mode: definition.mode,
    abortController,
    startedAt: Date.now(),
  };

  // Append task tracking instructions so the agent creates visible subtasks
  const taskTrackingPrompt = `\n\nTask Tracking:\nYour agent task ID is "${task.id}". Before starting work, create subtasks for each step using task_create with parent_id set to "${task.id}". As you complete each step, use task_update to transition it to "running" then "completed". This helps the user see your progress.`;

  // Build kanban tracking prompt if kanbanStore is available
  let kanbanTrackingPrompt = "";
  if (opts.kanbanStore) {
    const boardSummary = await opts.kanbanStore.getSummary();
    if (boardSummary) {
      kanbanTrackingPrompt = `\n\nKanban Board:\n${boardSummary}\n\nKanban Progress Tracking (IMPORTANT):\nYou have access to the "kanban" tool. When your task message contains a kanban card_id and task IDs, you MUST use the kanban tool with action "toggle_task" to mark each sub-task as done when you complete the corresponding work. Call it like: kanban({ action: "toggle_task", card_id: "<card_id>", task_id: "<task_id>" }). This is how the user tracks your real-time progress.`;
    }
  }

  // Build a scoped registry so the agent only sees its allowed tools
  let agentRegistry: ToolRegistry = registry;
  if (definition.allowedTools.length > 0) {
    const scoped = new ToolRegistryClass();
    const allowed = new Set([
      ...definition.allowedTools,
      // Always include task + kanban tools for tracking
      "task_create", "task_list", "task_get", "task_update",
      "kanban",
    ]);
    for (const toolName of allowed) {
      const tool = registry.get(toolName);
      if (tool) {
        scoped.register(tool);
      }
    }
    agentRegistry = scoped;
  }

  // Build agent-scoped config
  const agentConfig: AppConfig = {
    ...config,
    maxTurns: definition.maxTurns,
    systemPrompt: definition.systemPrompt + taskTrackingPrompt + kanbanTrackingPrompt,
  };

  // Build messages
  let messages: Message[] = [];
  if (definition.mode === "forked" && opts.parentMessages) {
    messages = [...opts.parentMessages];
  }

  const systemMsg: SystemMessage = {
    role: "system",
    content: agentConfig.systemPrompt,
  };
  const userMsg: UserMessage = { role: "user", content: userMessage };
  messages = [systemMsg, ...messages.filter((m) => m.role !== "system"), userMsg];

  if (definition.prepareMessages) {
    messages = definition.prepareMessages(messages);
  }

  // Create an isolated store for this agent
  const agentStore = createStore<AppState>(
    createDefaultAppState(agentConfig.model)
  );

  const agentLog = log.child(`agent:${definition.name}`);

  // Forward agent's internal tool activity to the parent UI
  let unsubAgentActivity: (() => void) | undefined;
  if (opts.onAgentActivity) {
    let prevToolCalls: ActiveToolCall[] = [];
    unsubAgentActivity = agentStore.subscribe(() => {
      const agentState = agentStore.get();
      // Only notify when activeToolCalls actually changed
      if (agentState.activeToolCalls !== prevToolCalls) {
        prevToolCalls = agentState.activeToolCalls;
        opts.onAgentActivity!(agentState.activeToolCalls);
      }
    });
  }

  try {
    await hooks.emit("agent:start", {
      agentName: definition.name,
      agentId: instance.id,
      taskId: task.id,
    });

    const result = await runQueryLoop(messages, {
      config: agentConfig,
      registry: agentRegistry,
      hooks,
      getAppState: agentStore.get,
      setAppState: agentStore.set,
      abortSignal: abortController.signal,
      log: agentLog,
    });

    // Extract final assistant text
    const lastAssistant = result.messages
      .filter((m) => m.role === "assistant")
      .pop();
    const output =
      (lastAssistant && "content" in lastAssistant
        ? lastAssistant.content
        : null) ?? "(no output)";

    taskManager.transition(task.id, "completed", { output });
    await hooks.emit("agent:end", {
      agentName: definition.name,
      agentId: instance.id,
      taskId: task.id,
      output,
    });
    return { instance, output };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    taskManager.transition(task.id, "failed", { error: errorMsg });
    await hooks.emit("agent:end", {
      agentName: definition.name,
      agentId: instance.id,
      taskId: task.id,
      output: `Error: ${errorMsg}`,
    });
    throw err;
  } finally {
    unsubAgentActivity?.();
  }
}
