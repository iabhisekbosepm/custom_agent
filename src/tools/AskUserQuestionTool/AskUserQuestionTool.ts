import { z } from "zod";
import type { Tool, ToolResult, ToolUseContext } from "../Tool.js";

const AskUserQuestionInput = z.object({
  question: z
    .string()
    .describe("The question to present to the user"),
});

type AskUserQuestionInput = z.infer<typeof AskUserQuestionInput>;

export const AskUserQuestionTool: Tool<AskUserQuestionInput> = {
  name: "ask_user",
  description:
    "Ask the user a question and wait for their response. Use this when you need clarification, a decision, or additional information from the user.",
  parameters: AskUserQuestionInput,
  isReadOnly: false,

  async call(input: AskUserQuestionInput, context: ToolUseContext): Promise<ToolResult> {
    // Append a system-level message so the UI can display the question
    context.setAppState((state) => ({
      ...state,
      messages: [
        ...state.messages,
        {
          role: "system" as const,
          content: `[Agent question: ${input.question}]`,
        },
      ],
    }));

    return {
      content: `Question presented to user: "${input.question}"\nWait for the user's response before continuing.`,
    };
  },
};
