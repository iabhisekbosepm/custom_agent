import { join } from "path";
import { readFile, writeFile, mkdir } from "fs/promises";
import type { SkillDefinition } from "./index.js";

/** Serializable subset of SkillDefinition for persistence. */
export interface PersistedSkillDefinition {
  name: string;
  description: string;
  type: "prompt";
  promptTemplate: string;
  requiredTools?: string[];
  userInvocable: true;
}

interface StoreFile {
  version: 1;
  skills: PersistedSkillDefinition[];
}

/**
 * Reads/writes custom skill definitions to `.custom-agents/skills.json`.
 */
export class CustomSkillStore {
  private filePath: string;

  constructor(dataDir: string) {
    this.filePath = join(dataDir, "skills.json");
  }

  async load(): Promise<PersistedSkillDefinition[]> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      const data: StoreFile = JSON.parse(raw);
      if (!data || !Array.isArray(data.skills)) return [];
      return data.skills;
    } catch {
      return [];
    }
  }

  async save(skills: PersistedSkillDefinition[]): Promise<void> {
    const dir = join(this.filePath, "..");
    await mkdir(dir, { recursive: true });
    const data: StoreFile = { version: 1, skills };
    await writeFile(this.filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
  }

  /** Upsert: overwrites if same name exists, appends otherwise. */
  async add(skill: PersistedSkillDefinition): Promise<void> {
    const skills = await this.load();
    const idx = skills.findIndex((s) => s.name === skill.name);
    if (idx >= 0) {
      skills[idx] = skill;
    } else {
      skills.push(skill);
    }
    await this.save(skills);
  }

  async remove(name: string): Promise<boolean> {
    const skills = await this.load();
    const filtered = skills.filter((s) => s.name !== name);
    if (filtered.length === skills.length) return false;
    await this.save(filtered);
    return true;
  }

  /** Convert a persisted definition to a full SkillDefinition. */
  static toSkillDefinition(persisted: PersistedSkillDefinition): SkillDefinition {
    return {
      name: persisted.name,
      description: persisted.description,
      type: persisted.type,
      promptTemplate: persisted.promptTemplate,
      requiredTools: persisted.requiredTools,
      userInvocable: persisted.userInvocable,
    };
  }
}
