import { z } from "zod";
import type { Tool, ToolResult, ToolUseContext } from "../Tool.js";
import type { AgentRouter } from "../../agents/AgentRouter.js";
import type { CustomAgentStore, PersistedAgentDefinition } from "../../agents/customAgentStore.js";

const RESERVED_NAMES = ["explorer", "coder", "reviewer"] as const;

const VALID_AGENT_TOOLS = [
  "grep",
  "glob",
  "file_read",
  "file_write",
  "file_edit",
  "shell",
] as const;

const AgentCreateInput = z.object({
  name: z
    .string()
    .regex(/^[a-z][a-z0-9_-]*$/, "Must be lowercase alphanumeric with hyphens/underscores, starting with a letter")
    .min(1)
    .max(40)
    .describe("Unique agent name (lowercase, hyphens/underscores allowed)"),
  description: z
    .string()
    .min(10)
    .max(200)
    .describe("Short description of what the agent does (10-200 chars)"),
  systemPrompt: z
    .string()
    .min(20)
    .describe("Detailed system prompt defining the agent's role, workflow, and constraints"),
  allowedTools: z
    .array(z.enum(VALID_AGENT_TOOLS))
    .describe("Tools this agent can use: grep, glob, file_read, file_write, file_edit, shell"),
  maxTurns: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe("Maximum query loop turns (1-50, default 10)"),
  mode: z
    .enum(["sync", "background", "forked"])
    .default("sync")
    .describe("Execution mode (default: sync)"),
  modelProfile: z
    .string()
    .max(40)
    .optional()
    .describe("Name of a model profile (from models.json) to use instead of the global model"),
});

type AgentCreateInput = z.infer<typeof AgentCreateInput>;

/**
 * Create an agent_create tool bound to runtime dependencies.
 * Factory pattern — needs AgentRouter and CustomAgentStore at runtime.
 */
export function createAgentCreateTool(
  agentRouter: AgentRouter,
  customAgentStore: CustomAgentStore,
): Tool<AgentCreateInput> {
  return {
    name: "agent_create",
    description:
      "Create a new custom agent definition that persists across sessions. " +
      "Agents have a name, system prompt, allowed tools, and max turns.",
    parameters: AgentCreateInput,
    isReadOnly: false,

    async call(input: AgentCreateInput, _context: ToolUseContext): Promise<ToolResult> {
      // Guard: cannot overwrite built-in agents
      if ((RESERVED_NAMES as readonly string[]).includes(input.name)) {
        return {
          content: `Cannot create agent "${input.name}": name is reserved for a built-in agent.`,
          isError: true,
        };
      }

      const definition: PersistedAgentDefinition = {
        name: input.name,
        description: input.description,
        systemPrompt: input.systemPrompt,
        allowedTools: input.allowedTools,
        maxTurns: input.maxTurns,
        mode: input.mode,
        ...(input.modelProfile ? { modelProfile: input.modelProfile } : {}),
      };

      // Persist to disk
      await customAgentStore.add(definition);

      // Register in runtime (overwrites if already exists from a previous /agent call)
      agentRouter.registerOrReplace(definition);

      const toolList = input.allowedTools.join(", ");
      const lines = [
        `Agent "${input.name}" created successfully.`,
        `  Description: ${input.description}`,
        `  Tools: ${toolList}`,
        `  Max turns: ${input.maxTurns}`,
        `  Mode: ${input.mode}`,
      ];
      if (input.modelProfile) {
        lines.push(`  Model profile: ${input.modelProfile}`);
      }
      lines.push("", `You can now use agent_spawn with agent="${input.name}" to invoke it.`);
      return { content: lines.join("\n") };
    },
  };
}
