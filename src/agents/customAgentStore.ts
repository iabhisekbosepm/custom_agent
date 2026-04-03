import { join } from "path";
import { readFile, writeFile, mkdir } from "fs/promises";
import type { AgentDefinition, AgentMode } from "./AgentDefinition.js";

/** Serializable subset of AgentDefinition (no function fields like prepareMessages). */
export interface PersistedAgentDefinition {
  name: string;
  description: string;
  systemPrompt: string;
  allowedTools: string[];
  maxTurns: number;
  mode: AgentMode;
  modelProfile?: string;
}

interface StoreFile {
  version: 1;
  agents: PersistedAgentDefinition[];
}

/**
 * Reads/writes custom agent definitions to `.custom-agents/agents.json`.
 */
export class CustomAgentStore {
  private filePath: string;

  constructor(dataDir: string) {
    this.filePath = join(dataDir, "agents.json");
  }

  async load(): Promise<PersistedAgentDefinition[]> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      const data: StoreFile = JSON.parse(raw);
      if (!data || !Array.isArray(data.agents)) return [];
      return data.agents;
    } catch {
      return [];
    }
  }

  async save(agents: PersistedAgentDefinition[]): Promise<void> {
    const dir = join(this.filePath, "..");
    await mkdir(dir, { recursive: true });
    const data: StoreFile = { version: 1, agents };
    await writeFile(this.filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
  }

  /** Upsert: overwrites if same name exists, appends otherwise. */
  async add(agent: PersistedAgentDefinition): Promise<void> {
    const agents = await this.load();
    const idx = agents.findIndex((a) => a.name === agent.name);
    if (idx >= 0) {
      agents[idx] = agent;
    } else {
      agents.push(agent);
    }
    await this.save(agents);
  }

  async remove(name: string): Promise<boolean> {
    const agents = await this.load();
    const filtered = agents.filter((a) => a.name !== name);
    if (filtered.length === agents.length) return false;
    await this.save(filtered);
    return true;
  }
}
