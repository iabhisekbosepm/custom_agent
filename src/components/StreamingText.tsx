import React from "react";
import { Box, Text } from "ink";

interface StreamingTextProps {
  text: string;
}

export function StreamingText({ text }: StreamingTextProps) {
  if (!text) return null;

  return (
    <Box flexDirection="column">
      <Text color="magenta" bold>
        Assistant:
      </Text>
      <Text>
        {text}
        <Text color="gray">▌</Text>
      </Text>
    </Box>
  );
}
