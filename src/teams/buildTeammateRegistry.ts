import type { AgentDefinition } from "../agents/AgentDefinition.js";
import { ToolRegistry } from "../tools/registry.js";
import type { ToolRegistry as ToolRegistryType } from "../tools/registry.js";

/**
 * Build a scoped ToolRegistry for a teammate.
 *
 * Includes only the tools the agent definition allows, plus team-specific tools
 * (messaging, task claiming) and task management tools.
 */
export function buildTeammateRegistry(
  agentDef: AgentDefinition,
  baseRegistry: ToolRegistryType,
  teamToolNames: string[]
): ToolRegistry {
  const scoped = new ToolRegistry();

  // Task tools that every teammate needs
  const taskToolNames = [
    "task_create",
    "task_list",
    "task_get",
    "task_update",
    "kanban",
  ];

  // Determine which base tools the agent can use
  const allowedBaseTools =
    agentDef.allowedTools.length === 0
      ? baseRegistry.list().map((t) => t.name) // empty = all
      : agentDef.allowedTools;

  const allAllowed = new Set([
    ...allowedBaseTools,
    ...taskToolNames,
    ...teamToolNames,
  ]);

  for (const toolName of allAllowed) {
    const tool = baseRegistry.get(toolName);
    if (tool) {
      scoped.register(tool);
    }
  }

  return scoped;
}
