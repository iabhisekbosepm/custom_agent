/**
 * A skill is a reusable prompt-based or tool-based capability
 * that can be invoked by name (e.g., "/commit", "/review").
 */
export interface SkillDefinition {
  /** Unique skill name (used as the /slash command). */
  name: string;
  /** Short description shown in help. */
  description: string;
  /** The type of skill. */
  type: "prompt" | "tool" | "composite";
  /**
   * For prompt-based skills: the prompt template.
   * Supports {{input}} placeholder for user-provided text.
   */
  promptTemplate?: string;
  /** Tool names that this skill relies on. */
  requiredTools?: string[];
  /** Whether this skill is user-invocable via slash commands. */
  userInvocable: boolean;
}

export class SkillRegistry {
  private skills = new Map<string, SkillDefinition>();

  register(skill: SkillDefinition): void {
    if (this.skills.has(skill.name)) {
      throw new Error(`Skill "${skill.name}" is already registered`);
    }
    this.skills.set(skill.name, skill);
  }

  get(name: string): SkillDefinition | undefined {
    return this.skills.get(name);
  }

  list(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  /** Expand a prompt-based skill into a user message. */
  expand(name: string, input: string): string | null {
    const skill = this.skills.get(name);
    if (!skill || !skill.promptTemplate) return null;
    return skill.promptTemplate.replace("{{input}}", input);
  }
}
