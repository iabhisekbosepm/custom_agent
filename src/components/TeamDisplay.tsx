import React from "react";
import { Box, Text } from "ink";
import { useSpinner } from "../hooks/useSpinner.js";
import type { TeamUIState } from "../state/AppStateStore.js";

interface TeamDisplayProps {
  teams: TeamUIState[];
}

export function TeamDisplay({ teams }: TeamDisplayProps) {
  const hasRunning = teams.some((t) =>
    t.teammates.some((tm) => tm.status === "running")
  );
  const { frame } = useSpinner(hasRunning);

  if (teams.length === 0) return null;

  return (
    <Box flexDirection="column" marginLeft={2}>
      {teams.map((team) => (
        <Box key={team.teamId} flexDirection="column">
          <Box>
            <Text color="magenta" bold>
              {"⚑ "}Team: {team.name}
            </Text>
            <Text color="gray"> ({team.status})</Text>
          </Box>
          {team.teammates.map((tm) => {
            const icon =
              tm.status === "completed"
                ? "✓"
                : tm.status === "failed"
                  ? "✗"
                  : tm.status === "running"
                    ? frame
                    : "○";
            const color =
              tm.status === "completed"
                ? "green"
                : tm.status === "failed"
                  ? "red"
                  : tm.status === "running"
                    ? "cyan"
                    : "gray";
            const activeTools = tm.activeToolCalls
              .filter((tc) => tc.status === "running")
              .map((tc) => tc.name);

            return (
              <Box key={tm.teammateId} flexDirection="column" marginLeft={1}>
                <Box>
                  <Text color={color}>
                    {icon}{" "}
                  </Text>
                  <Text color={color} bold={tm.status === "running"}>
                    {tm.teammateId}
                  </Text>
                  <Text color="gray">
                    {" "}({tm.agentName})
                  </Text>
                  {tm.taskDescription ? (
                    <Text color="gray"> — {tm.taskDescription.slice(0, 60)}</Text>
                  ) : null}
                </Box>
                {activeTools.length > 0 && (
                  <Box marginLeft={2}>
                    <Text color="cyan">
                      {frame} {activeTools.join(", ")}
                    </Text>
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      ))}
    </Box>
  );
}
