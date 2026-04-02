import type { AgentDefinition } from "./AgentDefinition.js";

/**
 * Registry for agent definitions.
 * Maps agent names to their definitions so the system can look up
 * and spawn agents by name.
 */
export class AgentRouter {
  private agents = new Map<string, AgentDefinition>();

  register(definition: AgentDefinition): void {
    if (this.agents.has(definition.name)) {
      throw new Error(`Agent "${definition.name}" is already registered`);
    }
    this.agents.set(definition.name, definition);
  }

  get(name: string): AgentDefinition | undefined {
    return this.agents.get(name);
  }

  list(): AgentDefinition[] {
    return Array.from(this.agents.values());
  }

  has(name: string): boolean {
    return this.agents.has(name);
  }

  /** Register or overwrite an agent definition. Used for user-created agents. */
  registerOrReplace(definition: AgentDefinition): void {
    this.agents.set(definition.name, definition);
  }
}
