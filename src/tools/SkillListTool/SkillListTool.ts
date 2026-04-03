import { z } from "zod";
import type { Tool, ToolResult, ToolUseContext } from "../Tool.js";
import type { SkillRegistry } from "../../skills/index.js";

const SkillListInput = z.object({
  filter: z
    .string()
    .optional()
    .describe("Optional text to filter skills by name or description"),
});

type SkillListInput = z.infer<typeof SkillListInput>;

/**
 * Create a skill_list tool bound to runtime dependencies.
 * Factory pattern — needs SkillRegistry at runtime.
 */
export function createSkillListTool(
  skillRegistry: SkillRegistry,
): Tool<SkillListInput> {
  return {
    name: "skill_list",
    description: "List all available skills/slash commands, including built-in and custom ones.",
    parameters: SkillListInput,
    isReadOnly: true,

    async call(input: SkillListInput, _context: ToolUseContext): Promise<ToolResult> {
      let skills = skillRegistry.list();

      if (input.filter) {
        const lower = input.filter.toLowerCase();
        skills = skills.filter(
          (s) =>
            s.name.toLowerCase().includes(lower) ||
            s.description.toLowerCase().includes(lower),
        );
      }

      if (skills.length === 0) {
        return {
          content: input.filter
            ? `No skills matching "${input.filter}".`
            : "No skills registered.",
        };
      }

      const lines = [
        `Skills (${skills.length}):`,
        "",
        "Name            | Type      | Invocable | Description",
        "----------------|-----------|-----------|------------",
      ];

      for (const s of skills) {
        const name = s.name.padEnd(15);
        const type = s.type.padEnd(9);
        const invocable = s.userInvocable ? "yes" : "no ";
        lines.push(`${name} | ${type} | ${invocable.padEnd(9)} | ${s.description}`);
      }

      return { content: lines.join("\n") };
    },
  };
}
