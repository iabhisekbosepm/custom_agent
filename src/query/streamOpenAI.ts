import type { AssistantMessage, ToolCall } from "../types/messages.js";
import type { OpenAIToolDefinition } from "../tools/registry.js";
import type { Message } from "../types/messages.js";

export interface StreamRequest {
  apiKey: string;
  baseUrl: string;
  model: string;
  messages: Message[];
  tools?: OpenAIToolDefinition[];
  abortSignal: AbortSignal;
  onToken: (token: string) => void;
}

interface Delta {
  role?: string;
  content?: string | null;
  tool_calls?: Array<{
    index: number;
    id?: string;
    type?: string;
    function?: {
      name?: string;
      arguments?: string;
    };
  }>;
}

/**
 * Stream a chat completion from an OpenAI-compatible API.
 * Parses SSE events, accumulates tool call fragments, and fires onToken for each text chunk.
 * Returns the fully assembled AssistantMessage.
 */
export async function streamChatCompletion(
  req: StreamRequest
): Promise<AssistantMessage> {
  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages,
    stream: true,
  };

  if (req.tools && req.tools.length > 0) {
    body.tools = req.tools;
  }

  const response = await fetch(`${req.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${req.apiKey}`,
      "HTTP-Referer": "https://github.com/custom-agents",
      "X-Title": "Custom Agents",
    },
    body: JSON.stringify(body),
    signal: req.abortSignal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `API request failed (${response.status}): ${errorText}`
    );
  }

  if (!response.body) {
    throw new Error("Response body is null");
  }

  // Accumulate the final message
  let contentParts: string[] = [];
  const toolCallMap = new Map<
    number,
    { id: string; name: string; arguments: string }
  >();

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Process complete SSE lines
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // Keep incomplete line in buffer

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "data: [DONE]") continue;
      if (!trimmed.startsWith("data: ")) continue;

      const jsonStr = trimmed.slice(6); // Remove "data: " prefix

      let parsed: { choices?: Array<{ delta?: Delta }> };
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        continue; // Skip unparseable lines
      }

      const delta = parsed.choices?.[0]?.delta;
      if (!delta) continue;

      // Accumulate text content
      if (delta.content) {
        contentParts.push(delta.content);
        req.onToken(delta.content);
      }

      // Accumulate tool call fragments
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const existing = toolCallMap.get(tc.index);
          if (!existing) {
            toolCallMap.set(tc.index, {
              id: tc.id ?? "",
              name: tc.function?.name ?? "",
              arguments: tc.function?.arguments ?? "",
            });
          } else {
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.name += tc.function.name;
            if (tc.function?.arguments)
              existing.arguments += tc.function.arguments;
          }
        }
      }
    }
  }

  // Build final AssistantMessage
  const content = contentParts.join("") || null;
  const toolCalls: ToolCall[] = Array.from(toolCallMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([_, tc]) => ({
      id: tc.id,
      type: "function" as const,
      function: {
        name: tc.name,
        arguments: tc.arguments,
      },
    }));

  const msg: AssistantMessage = {
    role: "assistant",
    content,
  };

  if (toolCalls.length > 0) {
    msg.tool_calls = toolCalls;
  }

  return msg;
}
