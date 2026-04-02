import { z } from "zod";
import type { Tool, ToolResult, ToolUseContext } from "../Tool.js";

const EnterPlanModeInput = z.object({
  plan_description: z
    .string()
    .describe("Description of the plan or what you intend to work on"),
});

type EnterPlanModeInput = z.infer<typeof EnterPlanModeInput>;

export const EnterPlanModeTool: Tool<EnterPlanModeInput> = {
  name: "enter_plan_mode",
  description:
    "Enter planning mode. In plan mode, you should explore the codebase and design an implementation approach before making changes. Use exit_plan_mode when ready to implement.",
  parameters: EnterPlanModeInput,
  isReadOnly: false,

  async call(input: EnterPlanModeInput, context: ToolUseContext): Promise<ToolResult> {
    const already = context.getAppState().planMode;
    if (already) {
      return {
        content: "Already in plan mode.",
      };
    }

    context.setAppState((state) => ({
      ...state,
      planMode: true,
    }));

    return {
      content: `Entered plan mode.\nPlan: ${input.plan_description}\n\nYou are now in planning mode. Explore the codebase, design your approach, then use exit_plan_mode when ready to implement.`,
    };
  },
};
