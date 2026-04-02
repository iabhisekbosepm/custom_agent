import { z } from "zod";
import type { Tool, ToolResult, ToolUseContext } from "../Tool.js";

const SendMessageInput = z.object({
  message: z.string().describe("The message content to send"),
  type: z
    .enum(["info", "warning", "error"])
    .optional()
    .describe("Message type (default: info)"),
});

type SendMessageInput = z.infer<typeof SendMessageInput>;

export const SendMessageTool: Tool<SendMessageInput> = {
  name: "send_message",
  description:
    "Append a system message to the conversation. Useful for surfacing information, warnings, or errors to the user.",
  parameters: SendMessageInput,
  isReadOnly: false,

  async call(input: SendMessageInput, context: ToolUseContext): Promise<ToolResult> {
    const type = input.type ?? "info";
    const prefix =
      type === "warning" ? "[WARNING] " : type === "error" ? "[ERROR] " : "";

    context.setAppState((state) => ({
      ...state,
      messages: [
        ...state.messages,
        {
          role: "system" as const,
          content: `${prefix}${input.message}`,
        },
      ],
    }));

    return {
      content: `Message sent (${type}): ${input.message}`,
    };
  },
};
