import React from "react";
import { Box, Text } from "ink";
import type { Message } from "../types/messages.js";

interface MessageListProps {
  messages: Message[];
}

export function MessageList({ messages }: MessageListProps) {
  return (
    <Box flexDirection="column" gap={1}>
      {messages.map((msg, i) => (
        <MessageRow key={i} message={msg} />
      ))}
    </Box>
  );
}

function MessageRow({ message }: { message: Message }) {
  switch (message.role) {
    case "system":
      // Render user-facing feedback (e.g. /compact, /diff results)
      if (message.content && message.content.startsWith("[")) {
        return (
          <Box>
            <Text color="gray" dimColor>
              {message.content}
            </Text>
          </Box>
        );
      }
      return null; // Don't render internal system messages

    case "user":
      return (
        <Box>
          <Text color="blue" bold>
            You:{" "}
          </Text>
          <Text>{message.content}</Text>
        </Box>
      );

    case "assistant":
      return (
        <Box flexDirection="column">
          <Text color="magenta" bold>
            Assistant:
          </Text>
          {message.content && <Text>{message.content}</Text>}
          {message.tool_calls?.map((tc) => (
            <Text key={tc.id} color="yellow" dimColor>
              {"  "}[calling {tc.function.name}]
            </Text>
          ))}
        </Box>
      );

    case "tool":
      return (
        <Box>
          <Text color="yellow" dimColor>
            {"  "}[tool result: {truncate(message.content, 200)}]
          </Text>
        </Box>
      );

    default:
      return null;
  }
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "...";
}
