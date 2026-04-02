import { z } from "zod";
import type { Tool, ToolResult, ToolUseContext } from "../Tool.js";
import type { ToolRegistry } from "../registry.js";

const ToolSearchInput = z.object({
  query: z
    .string()
    .describe("Search query to find matching tools by name or description"),
});

type ToolSearchInput = z.infer<typeof ToolSearchInput>;

export function createToolSearchTool(registry: ToolRegistry): Tool<ToolSearchInput> {
  return {
    name: "tool_search",
    description:
      "Search available tools by name or description. Useful for discovering which tools can help with a specific task.",
    parameters: ToolSearchInput,
    isReadOnly: true,

    async call(input: ToolSearchInput, _context: ToolUseContext): Promise<ToolResult> {
      const query = input.query.toLowerCase();
      const allTools = registry.list();

      const matches = allTools.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query)
      );

      if (matches.length === 0) {
        return {
          content: `No tools found matching "${input.query}". Available tools: ${allTools.map((t) => t.name).join(", ")}`,
        };
      }

      const formatted = matches
        .map((t) => `- ${t.name}: ${t.description}`)
        .join("\n");

      return {
        content: `Found ${matches.length} matching tool(s):\n${formatted}`,
      };
    },
  };
}
