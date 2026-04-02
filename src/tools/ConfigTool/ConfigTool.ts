import { z } from "zod";
import type { Tool, ToolResult, ToolUseContext } from "../Tool.js";

const ConfigInput = z.object({});

type ConfigInput = z.infer<typeof ConfigInput>;

export const ConfigTool: Tool<ConfigInput> = {
  name: "config_view",
  description:
    "View the current application configuration. API keys are redacted for security.",
  parameters: ConfigInput,
  isReadOnly: true,

  async call(_input: ConfigInput, context: ToolUseContext): Promise<ToolResult> {
    const config = context.config;

    const redactedKey = config.apiKey
      ? `${config.apiKey.slice(0, 8)}...${config.apiKey.slice(-4)}`
      : "(not set)";

    const lines = [
      "Current Configuration:",
      `  API Key:        ${redactedKey}`,
      `  Base URL:       ${config.baseUrl}`,
      `  Model:          ${config.model}`,
      `  Log Level:      ${config.logLevel}`,
      `  Max Turns:      ${config.maxTurns}`,
      `  Context Budget: ${config.contextBudget}`,
    ];

    return { content: lines.join("\n") };
  },
};
