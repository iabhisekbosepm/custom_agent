import { z } from "zod";
import type { Tool, ToolResult, ToolUseContext } from "../Tool.js";

const BriefInput = z.object({
  enable: z
    .boolean()
    .optional()
    .describe("Set brief mode on (true) or off (false). Omit to toggle."),
});

type BriefInput = z.infer<typeof BriefInput>;

export const BriefTool: Tool<BriefInput> = {
  name: "brief_toggle",
  description:
    "Toggle or set brief/compact output mode. When enabled, tool outputs and responses should be more concise.",
  parameters: BriefInput,
  isReadOnly: false,

  async call(input: BriefInput, context: ToolUseContext): Promise<ToolResult> {
    const current = context.getAppState().briefMode;
    const newValue = input.enable ?? !current;

    context.setAppState((state) => ({
      ...state,
      briefMode: newValue,
    }));

    return {
      content: `Brief mode is now ${newValue ? "ON" : "OFF"}.`,
    };
  },
};
