import { z } from "zod";
import type { Tool, ToolResult, ToolUseContext } from "../Tool.js";

const SyntheticOutputInput = z.object({
  content: z.string().describe("The content to output"),
  format: z
    .enum(["markdown", "json", "table", "plain"])
    .optional()
    .describe("Output format (default: plain)"),
});

type SyntheticOutputInput = z.infer<typeof SyntheticOutputInput>;

export const SyntheticOutputTool: Tool<SyntheticOutputInput> = {
  name: "synthetic_output",
  description:
    "Return pre-formatted content to the model. Useful for structuring complex output as markdown, JSON, or tables.",
  parameters: SyntheticOutputInput,
  isReadOnly: true,

  async call(input: SyntheticOutputInput, _context: ToolUseContext): Promise<ToolResult> {
    const format = input.format ?? "plain";

    let output: string;
    switch (format) {
      case "json":
        try {
          // Validate and pretty-print JSON
          const parsed = JSON.parse(input.content);
          output = JSON.stringify(parsed, null, 2);
        } catch {
          // If not valid JSON, wrap it
          output = JSON.stringify({ content: input.content }, null, 2);
        }
        break;
      case "markdown":
        output = input.content;
        break;
      case "table":
        output = input.content;
        break;
      default:
        output = input.content;
        break;
    }

    return { content: output };
  },
};
