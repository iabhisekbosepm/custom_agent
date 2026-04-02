import { z } from "zod";
import type { Tool, ToolResult, ToolUseContext } from "../Tool.js";
import { stripHtmlTags, truncateOutput } from "../shared/utils.js";

const WebSearchInput = z.object({
  query: z.string().describe("The search query"),
  max_results: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Maximum number of results to return (default: 5)"),
});

type WebSearchInput = z.infer<typeof WebSearchInput>;

export const WebSearchTool: Tool<WebSearchInput> = {
  name: "web_search",
  description:
    "Search the web using DuckDuckGo. Returns top results with titles, URLs, and snippets.",
  parameters: WebSearchInput,
  isReadOnly: true,

  async call(input: WebSearchInput, _context: ToolUseContext): Promise<ToolResult> {
    const maxResults = input.max_results ?? 5;

    try {
      const encoded = encodeURIComponent(input.query);
      const url = `https://html.duckduckgo.com/html/?q=${encoded}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; CustomAgents/1.0; +https://github.com/custom-agents)",
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return {
          content: `Search request failed: HTTP ${response.status}`,
          isError: true,
        };
      }

      const html = await response.text();
      const results = parseDuckDuckGoResults(html, maxResults);

      if (results.length === 0) {
        return { content: "No search results found." };
      }

      const formatted = results
        .map(
          (r, i) =>
            `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`
        )
        .join("\n\n");

      return { content: truncateOutput(formatted, 20_000) };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return {
          content: "Search timed out after 15 seconds.",
          isError: true,
        };
      }
      return {
        content: `Search failed: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  },
};

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

function parseDuckDuckGoResults(html: string, max: number): SearchResult[] {
  const results: SearchResult[] = [];
  // Match result blocks: <a class="result__a" href="...">title</a> and <a class="result__snippet">snippet</a>
  const resultBlockRegex =
    /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;
  while ((match = resultBlockRegex.exec(html)) !== null && results.length < max) {
    const rawUrl = match[1];
    const title = stripHtmlTags(match[2]).trim();
    const snippet = stripHtmlTags(match[3]).trim();

    // DuckDuckGo uses redirect URLs — extract the actual URL
    let url = rawUrl;
    const uddgMatch = rawUrl.match(/uddg=([^&]+)/);
    if (uddgMatch) {
      url = decodeURIComponent(uddgMatch[1]);
    }

    if (title && url) {
      results.push({ title, url, snippet });
    }
  }
  return results;
}
