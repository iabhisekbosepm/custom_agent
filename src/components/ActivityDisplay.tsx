import React from "react";
import { Box, Text } from "ink";
import { useAppState } from "../state/AppState.js";
import { useSpinner } from "../hooks/useSpinner.js";
import { AgentTaskList } from "./AgentTaskList.js";
import { TeamDisplay } from "./TeamDisplay.js";

export function ActivityDisplay() {
  const state = useAppState();
  const isBusy = state.isStreaming || state.activeToolCalls.length > 0;
  const { frame, tick } = useSpinner(isBusy);

  if (!isBusy) return null;

  const activeOrPending = state.activeToolCalls.filter(
    (tc) => tc.status !== "completed"
  );

  const elapsed = state.turnStartedAt
    ? Math.floor(((tick * 80) + (Date.now() - state.turnStartedAt)) / 1000)
    : 0;
  // Use a simpler elapsed that updates with tick
  const elapsedSec = state.turnStartedAt
    ? Math.floor((Date.now() - state.turnStartedAt) / 1000)
    : 0;

  const hasToolRunning = activeOrPending.some((tc) => tc.status === "running");
  const runningToolName = activeOrPending.find(
    (tc) => tc.status === "running"
  )?.name;

  return (
    <Box flexDirection="column">
      {/* Tool call lines */}
      {activeOrPending.map((tc) => (
        <React.Fragment key={tc.id}>
          <Box>
            <Text color={tc.status === "running" ? "cyan" : "gray"}>
              {tc.status === "running" ? frame : "○"}{" "}
            </Text>
            <Text color="cyan" bold>
              {tc.name}
            </Text>
            {tc.argsSummary ? (
              <Text color="gray">{"  "}{tc.argsSummary}</Text>
            ) : null}
          </Box>
          {tc.name === "agent_spawn" && tc.status === "running" && (
            <AgentTaskList />
          )}
          {tc.name === "team_create" && tc.status === "running" && (
            <TeamDisplay teams={state.activeTeams} />
          )}
        </React.Fragment>
      ))}

      {/* Streaming text */}
      {state.isStreaming && state.currentStreamText ? (
        <Box flexDirection="column">
          <Text color="magenta" bold>
            Assistant:
          </Text>
          <Text>
            {state.currentStreamText}
            <Text color="gray">▌</Text>
          </Text>
        </Box>
      ) : null}

      {/* Status bar */}
      <Box marginTop={activeOrPending.length > 0 || state.currentStreamText ? 0 : 0}>
        <Text color="yellow">
          {"  "}
          {hasToolRunning ? "⏵" : "✱"}{" "}
          {hasToolRunning
            ? `Running ${runningToolName}...`
            : "Thinking..."}
          {elapsedSec > 0 ? ` (${elapsedSec}s` : " (0s"}
          {state.turnTokenCount > 0
            ? ` · ↓ ${state.turnTokenCount} tokens)`
            : ")"}
        </Text>
      </Box>
    </Box>
  );
}
