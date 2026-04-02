import React, { useState, useCallback } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { useAppState, useSetAppState } from "../state/AppState.js";
import { DiffViewer } from "./DiffViewer.js";

export function DiffDisplay() {
  const state = useAppState();
  const setState = useSetAppState();
  const { stdout } = useStdout();
  const diffs = state.pendingDiffs;

  const [scrollOffsets, setScrollOffsets] = useState<number[]>([]);
  const [activeDiffIndex, setActiveDiffIndex] = useState(0);

  // Reserve lines for chrome: header + tab bar + footer hint + borders
  const termRows = stdout?.rows ?? 24;
  const visibleLines = Math.max(termRows - 6, 5);

  // Sync scrollOffsets array length with diffs
  const offsets =
    scrollOffsets.length === diffs.length
      ? scrollOffsets
      : diffs.map((_, i) => scrollOffsets[i] ?? 0);

  const dismiss = useCallback(() => {
    setState((s) => ({ ...s, pendingDiffs: [], focusOwner: "input" }));
    setScrollOffsets([]);
    setActiveDiffIndex(0);
  }, [setState]);

  useInput((ch, key) => {
    if (diffs.length === 0) return;
    if (state.focusOwner !== "diffViewer") return;

    const currentDiff = diffs[activeDiffIndex];
    if (!currentDiff) return;

    const maxOffset = Math.max(0, currentDiff.rows.length - visibleLines);

    const updateOffset = (fn: (prev: number) => number) => {
      setScrollOffsets((prev) => {
        const arr = prev.length === diffs.length ? [...prev] : diffs.map((_, i) => prev[i] ?? 0);
        arr[activeDiffIndex] = Math.max(0, Math.min(maxOffset, fn(arr[activeDiffIndex] ?? 0)));
        return arr;
      });
    };

    // q — dismiss
    if (ch === "q") {
      dismiss();
      return;
    }

    // j / downArrow — scroll down 1
    if (ch === "j" || key.downArrow) {
      updateOffset((o) => o + 1);
      return;
    }

    // k / upArrow — scroll up 1
    if (ch === "k" || key.upArrow) {
      updateOffset((o) => o - 1);
      return;
    }

    // g — jump to top
    if (ch === "g") {
      updateOffset(() => 0);
      return;
    }

    // G — jump to bottom
    if (ch === "G") {
      updateOffset(() => maxOffset);
      return;
    }

    // Page down (space or ctrl+d)
    if (ch === " " || (key.ctrl && ch === "d")) {
      updateOffset((o) => o + visibleLines);
      return;
    }

    // Page up (ctrl+u)
    if (key.ctrl && ch === "u") {
      updateOffset((o) => o - visibleLines);
      return;
    }

    // Tab — cycle to next diff
    if (key.tab) {
      setActiveDiffIndex((prev) => (prev + 1) % diffs.length);
      return;
    }
  });

  if (diffs.length === 0) return null;

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Tab bar when multiple diffs */}
      {diffs.length > 1 && (
        <Box flexDirection="row" marginBottom={1}>
          {diffs.map((diff, i) => (
            <Text
              key={diff.filePath}
              color={i === activeDiffIndex ? "cyan" : "gray"}
              bold={i === activeDiffIndex}
            >
              {i === activeDiffIndex ? "[" : " "}
              {i + 1}: {diff.filePath}
              {i === activeDiffIndex ? "]" : " "}
              {"  "}
            </Text>
          ))}
        </Box>
      )}

      {/* Active diff viewer */}
      <DiffViewer
        diff={diffs[activeDiffIndex]}
        scrollOffset={offsets[activeDiffIndex] ?? 0}
        visibleLines={visibleLines}
        isActive={true}
      />

      {/* Footer hint */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          j/k: scroll | g/G: top/bottom | Space/Ctrl+D/U: page | {diffs.length > 1 ? "Tab: next diff | " : ""}q: close
        </Text>
      </Box>
    </Box>
  );
}
