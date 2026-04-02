import { z } from "zod";
import type { Tool, ToolResult, ToolUseContext } from "../Tool.js";
import { stripHtmlTags, truncateOutput } from "../shared/utils.js";

const WebFetchInput = z.object({
  url: z.string().describe("The URL to fetch content from"),
  max_length: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Maximum character length of returned content (default: 50000)"),
});

type WebFetchInput = z.infer<typeof WebFetchInput>;

export const WebFetchTool: Tool<WebFetchInput> = {
  name: "web_fetch",
  description:
    "Fetch content from a URL. Strips HTML tags and returns plain text. Useful for reading web pages, documentation, and API responses.",
  parameters: WebFetchInput,
  isReadOnly: true,

  async call(input: WebFetchInput, _context: ToolUseContext): Promise<ToolResult> {
    const maxLen = input.max_length ?? 50_000;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);

      const response = await fetch(input.url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "CustomAgents/1.0 (Web Fetch Tool)",
          Accept: "text/html, application/json, text/plain, */*",
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return {
          content: `HTTP ${response.status} ${response.statusText} for ${input.url}`,
          isError: true,
        };
      }

      const contentType = response.headers.get("content-type") ?? "";
      const rawText = await response.text();

      let text: string;
      if (contentType.includes("text/html")) {
        text = stripHtmlTags(rawText);
      } else {
        text = rawText;
      }

      return { content: truncateOutput(text, maxLen) };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return {
          content: `Request timed out after 15 seconds: ${input.url}`,
          isError: true,
        };
      }
      return {
        content: `Failed to fetch URL: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  },
};
