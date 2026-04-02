import { z } from "zod";
import type { Tool, ToolResult, ToolUseContext } from "../Tool.js";

const SleepInput = z.object({
  duration_ms: z
    .number()
    .int()
    .positive()
    .describe("Duration to sleep in milliseconds (max 30000)"),
});

type SleepInput = z.infer<typeof SleepInput>;

export const SleepTool: Tool<SleepInput> = {
  name: "sleep",
  description:
    "Pause execution for a specified duration. Useful for waiting between retries or rate-limited operations. Maximum 30 seconds.",
  parameters: SleepInput,
  isReadOnly: true,

  async call(input: SleepInput, _context: ToolUseContext): Promise<ToolResult> {
    const ms = Math.min(input.duration_ms, 30_000);
    const start = Date.now();
    await new Promise((resolve) => setTimeout(resolve, ms));
    const elapsed = Date.now() - start;
    return {
      content: `Slept for ${elapsed}ms.`,
    };
  },
};
