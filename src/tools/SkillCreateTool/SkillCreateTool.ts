import { z } from "zod";
import type { Tool, ToolResult, ToolUseContext } from "../Tool.js";
import type { SkillRegistry } from "../../skills/index.js";
import type { CustomSkillStore, PersistedSkillDefinition } from "../../skills/customSkillStore.js";

const RESERVED_NAMES = [
  "explain",
  "commit",
  "status",
  "find",
  "compact",
  "diff",
  "brief",
  "plan",
  "agent",
  "skill",
] as const;

const SkillCreateInput = z.object({
  name: z
    .string()
    .regex(/^[a-z][a-z0-9_-]*$/, "Must be lowercase alphanumeric with hyphens/underscores, starting with a letter")
    .min(1)
    .max(30)
    .describe("Unique skill name used as the /slash command (lowercase, hyphens/underscores allowed)"),
  description: z
    .string()
    .min(5)
    .max(200)
    .describe("Short description of what the slash command does (5-200 chars)"),
  promptTemplate: z
    .string()
    .min(10)
    .describe("The prompt template for the skill. Must include {{input}} placeholder for user-provided text."),
  requiredTools: z
    .array(z.string())
    .optional()
    .describe("Tool names this skill depends on (optional)"),
});

type SkillCreateInput = z.infer<typeof SkillCreateInput>;

/**
 * Create a skill_create tool bound to runtime dependencies.
 * Factory pattern — needs SkillRegistry and CustomSkillStore at runtime.
 */
export function createSkillCreateTool(
  skillRegistry: SkillRegistry,
  customSkillStore: CustomSkillStore,
): Tool<SkillCreateInput> {
  return {
    name: "skill_create",
    description:
      "Create a new custom slash command that persists across sessions. " +
      "Skills have a name, description, and prompt template with {{input}} placeholder.",
    parameters: SkillCreateInput,
    isReadOnly: false,

    async call(input: SkillCreateInput, _context: ToolUseContext): Promise<ToolResult> {
      // Guard: cannot overwrite built-in skills
      if ((RESERVED_NAMES as readonly string[]).includes(input.name)) {
        return {
          content: `Cannot create skill "${input.name}": name is reserved for a built-in skill.`,
          isError: true,
        };
      }

      // Validate {{input}} placeholder is present
      if (!input.promptTemplate.includes("{{input}}")) {
        return {
          content: `Prompt template must include the {{input}} placeholder so user-provided text can be injected.`,
          isError: true,
        };
      }

      const definition: PersistedSkillDefinition = {
        name: input.name,
        description: input.description,
        type: "prompt",
        promptTemplate: input.promptTemplate,
        requiredTools: input.requiredTools,
        userInvocable: true,
      };

      // Persist to disk
      await customSkillStore.add(definition);

      // Register in runtime (overwrites if already exists from a previous call)
      skillRegistry.registerOrReplace(definition);

      return {
        content: [
          `Skill "${input.name}" created successfully.`,
          `  Description: ${input.description}`,
          `  Required tools: ${input.requiredTools?.join(", ") || "none"}`,
          "",
          `Use /${input.name} to invoke this slash command.`,
        ].join("\n"),
      };
    },
  };
}
