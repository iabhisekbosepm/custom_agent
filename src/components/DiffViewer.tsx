import React from "react";
import { Box, Text, useStdout } from "ink";
import type { DiffResult, DiffRow } from "../utils/diff.js";

interface DiffViewerProps {
  diff: DiffResult;
  scrollOffset?: number;
  visibleLines?: number;
  isActive?: boolean;
}

const LINE_NO_WIDTH = 5;
const SEPARATOR = " \u2502 "; // " │ "

export function DiffViewer({
  diff,
  scrollOffset = 0,
  visibleLines,
  isActive = false,
}: DiffViewerProps) {
  const { stdout } = useStdout();
  const termWidth = stdout?.columns ?? 80;

  // Each side: lineNo(5) + space(1) + content + separator(3)
  const sideWidth = Math.floor((termWidth - SEPARATOR.length) / 2);
  const contentWidth = Math.max(sideWidth - LINE_NO_WIDTH - 1, 10);

  const totalRows = diff.rows.length;
  const effectiveVisibleLines = visibleLines ?? totalRows;
  const end = Math.min(scrollOffset + effectiveVisibleLines, totalRows);
  const visibleRows = diff.rows.slice(scrollOffset, end);

  const topBorder = "\u2500".repeat(sideWidth) + "\u252C" + "\u2500".repeat(sideWidth);
  const bottomBorder = "\u2500".repeat(sideWidth) + "\u2534" + "\u2500".repeat(sideWidth);

  const hasAbove = scrollOffset > 0;
  const hasBelow = end < totalRows;

  return (
    <Box flexDirection="column">
      <Text color={isActive ? "cyan" : "gray"} bold={isActive}>
        {isActive ? "\u25B6 " : "  "}diff: {diff.filePath} (+{diff.additions} -{diff.deletions})
      </Text>
      {hasAbove && (
        <Text color="cyan" dimColor>  ^ more above</Text>
      )}
      <Text color="gray" dimColor>{topBorder}</Text>
      {visibleRows.map((row, i) => (
        <DiffRowView key={scrollOffset + i} row={row} contentWidth={contentWidth} />
      ))}
      <Text color="gray" dimColor>{bottomBorder}</Text>
      {hasBelow && (
        <Text color="cyan" dimColor>  v more below</Text>
      )}
      {visibleLines != null && (
        <Text color="gray" dimColor>
          Lines {scrollOffset + 1}-{end} of {totalRows}
        </Text>
      )}
      {diff.isTruncated && (
        <Text color="yellow">... diff truncated (showing first 200 rows)</Text>
      )}
    </Box>
  );
}

function DiffRowView({ row, contentWidth }: { row: DiffRow; contentWidth: number }) {
  const leftNo = row.leftLine !== null ? String(row.leftLine).padStart(LINE_NO_WIDTH) : " ".repeat(LINE_NO_WIDTH);
  const rightNo = row.rightLine !== null ? String(row.rightLine).padStart(LINE_NO_WIDTH) : " ".repeat(LINE_NO_WIDTH);

  const leftText = truncateLine(row.leftContent, contentWidth);
  const rightText = truncateLine(row.rightContent, contentWidth);

  switch (row.type) {
    case "unchanged":
      return (
        <Text>
          <Text color="gray" dimColor>{leftNo} {leftText.padEnd(contentWidth)}</Text>
          <Text color="gray" dimColor>{SEPARATOR}</Text>
          <Text color="gray" dimColor>{rightNo} {rightText}</Text>
        </Text>
      );
    case "removed":
      return (
        <Text>
          <Text color="red">{leftNo} {leftText.padEnd(contentWidth)}</Text>
          <Text color="gray" dimColor>{SEPARATOR}</Text>
          <Text color="gray" dimColor>{rightNo} {rightText}</Text>
        </Text>
      );
    case "added":
      return (
        <Text>
          <Text color="gray" dimColor>{leftNo} {leftText.padEnd(contentWidth)}</Text>
          <Text color="gray" dimColor>{SEPARATOR}</Text>
          <Text color="green">{rightNo} {rightText}</Text>
        </Text>
      );
    case "modified":
      return (
        <Text>
          <Text color="red">{leftNo} {leftText.padEnd(contentWidth)}</Text>
          <Text color="gray" dimColor>{SEPARATOR}</Text>
          <Text color="green">{rightNo} {rightText}</Text>
        </Text>
      );
  }
}

function truncateLine(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) return text;
  return text.slice(0, maxWidth - 1) + "~";
}
