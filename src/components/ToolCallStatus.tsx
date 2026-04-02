import React from "react";
import { Box, Text } from "ink";

interface ToolCallStatusProps {
  toolName: string | null;
}

export function ToolCallStatus({ toolName }: ToolCallStatusProps) {
  if (!toolName) return null;

  return (
    <Box>
      <Text color="yellow">
        {"  "}Running tool: {toolName}...
      </Text>
    </Box>
  );
}
