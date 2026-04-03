import { z } from "zod";
import type { Tool, ToolResult, ToolUseContext } from "../Tool.js";
import type { ToolRegistry } from "../registry.js";
import type { AgentRouter } from "../../agents/AgentRouter.js";
import type { TaskManager } from "../../tasks/TaskManager.js";
import type { HookManager } from "../../hooks/index.js";
import type { KanbanStore } from "../../kanban/KanbanStore.js";
import type { ModelProfileStore } from "../../models/ModelProfileStore.js";
import { runAgent } from "../../agents/runAgent.js";

const AgentSpawnInput = z.object({
  agent: z.string().describe("Name of the agent to spawn (e.g. 'explorer', 'coder', 'reviewer')"),
  message: z.string().describe("The task or question to give to the agent"),
});

type AgentSpawnInput = z.infer<typeof AgentSpawnInput>;

/**
 * Create an agent_spawn tool bound to runtime dependencies.
 * This is a factory because the tool needs access to AgentRouter, TaskManager,
 * and ToolRegistry which aren't available at import time.
 */
export function createAgentSpawnTool(
  agentRouter: AgentRouter,
  taskManager: TaskManager,
  hooks: HookManager,
  registry: ToolRegistry,
  kanbanStore: KanbanStore,
  modelProfileStore?: ModelProfileStore,
): Tool<AgentSpawnInput> {
  return {
    name: "agent_spawn",
    description: `Spawn a sub-agent to handle a specific task. Available agents: ${agentRouter
      .list()
      .map((a) => `${a.name} (${a.description})`)
      .join("; ")}`,
    parameters: AgentSpawnInput,
    isReadOnly: false,

    async call(input: AgentSpawnInput, context: ToolUseContext): Promise<ToolResult> {
      const definition = agentRouter.get(input.agent);

      if (!definition) {
        const available = agentRouter
          .list()
          .map((a) => a.name)
          .join(", ");
        return {
          content: `Unknown agent "${input.agent}". Available agents: ${available}`,
          isError: true,
        };
      }

      try {
        const result = await runAgent({
          definition,
          userMessage: input.message,
          parentMessages: context.messages,
          config: context.config,
          registry,
          hooks,
          taskManager,
          log: context.log,
          kanbanStore,
          modelProfileStore,
          onTaskCreated: (taskId) => {
            context.setAppState((s) => ({ ...s, activeAgentTaskId: taskId }));
          },
          onAgentActivity: (toolCalls) => {
            context.setAppState((s) => ({ ...s, agentToolCalls: toolCalls }));
          },
        });

        return { content: result.output };
      } catch (err) {
        return {
          content: `Agent "${input.agent}" failed: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        };
      } finally {
        context.setAppState((s) => ({ ...s, activeAgentTaskId: null, agentToolCalls: [] }));
      }
    },
  };
}
