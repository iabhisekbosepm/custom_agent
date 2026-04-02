import { z } from "zod";
import type { Tool, ToolResult, ToolUseContext } from "../Tool.js";

const ExitPlanModeInput = z.object({
  summary: z
    .string()
    .optional()
    .describe("Summary of the plan and what will be implemented"),
});

type ExitPlanModeInput = z.infer<typeof ExitPlanModeInput>;

export const ExitPlanModeTool: Tool<ExitPlanModeInput> = {
  name: "exit_plan_mode",
  description:
    "Exit planning mode and return to normal execution. Optionally provide a summary of the plan.",
  parameters: ExitPlanModeInput,
  isReadOnly: false,

  async call(input: ExitPlanModeInput, context: ToolUseContext): Promise<ToolResult> {
    const inPlanMode = context.getAppState().planMode;
    if (!inPlanMode) {
      return {
        content: "Not currently in plan mode.",
      };
    }

    context.setAppState((state) => ({
      ...state,
      planMode: false,
    }));

    const summary = input.summary
      ? `\nPlan summary: ${input.summary}`
      : "";

    return {
      content: `Exited plan mode. Ready to implement.${summary}`,
    };
  },
};
