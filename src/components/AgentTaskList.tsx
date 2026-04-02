import React from "react";
import { Box, Text } from "ink";
import { useAppState } from "../state/AppState.js";
import { useRuntime } from "./App.js";
import { useAgentTasks } from "../hooks/useAgentTasks.js";
import { useSpinner } from "../hooks/useSpinner.js";

export function AgentTaskList() {
  const { taskManager } = useRuntime();
  const state = useAppState();
  const subtasks = useAgentTasks(taskManager, state.activeAgentTaskId);
  const agentTools = state.agentToolCalls;

  const activeTools = agentTools.filter((tc) => tc.status !== "completed");
  const hasContent = activeTools.length > 0 || subtasks.length > 0;
  const { frame } = useSpinner(activeTools.length > 0);

  if (!hasContent) return null;

  return (
    <Box flexDirection="column" marginLeft={2}>
      {/* Real-time agent tool activity */}
      {activeTools.map((tc) => (
        <Box key={tc.id}>
          <Text color="cyan">
            {"  "}
            {tc.status === "running" ? frame : "\u25CB"}{" "}
          </Text>
          <Text color="cyan" bold={tc.status === "running"}>
            {tc.name}
          </Text>
          {tc.argsSummary ? (
            <Text color="gray">{"  "}{tc.argsSummary}</Text>
          ) : null}
        </Box>
      ))}

      {/* Subtask progress (if agent created any via task_create) */}
      {subtasks.map((task, i) => {
        const icon =
          task.status === "completed"
            ? "\u25A0"
            : task.status === "running"
              ? "\u25A0"
              : "\u25A1";
        const color =
          task.status === "completed"
            ? "green"
            : task.status === "running"
              ? "cyan"
              : "gray";
        const prefix = i === 0 ? "\u2514 " : "  ";
        return (
          <Box key={task.id}>
            <Text color={color}>
              {prefix}
              {icon}{" "}
            </Text>
            <Text bold={task.status === "running"} color={color}>
              {task.description}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
