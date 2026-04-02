import { diffLines } from "diff";

export interface DiffRow {
  type: "unchanged" | "removed" | "added" | "modified";
  leftLine: number | null;
  leftContent: string;
  rightLine: number | null;
  rightContent: string;
}

export interface DiffResult {
  filePath: string;
  rows: DiffRow[];
  additions: number;
  deletions: number;
  isTruncated: boolean;
}

const MAX_ROWS = 200;

/**
 * Compute a side-by-side diff between old and new content.
 * Adjacent removed+added blocks are paired into "modified" rows.
 */
export function computeSideBySideDiff(
  filePath: string,
  oldContent: string,
  newContent: string
): DiffResult {
  const changes = diffLines(oldContent, newContent);

  // Build intermediate arrays of removed/added/unchanged segments
  type Segment = { type: "removed" | "added" | "unchanged"; lines: string[] };
  const segments: Segment[] = [];

  for (const change of changes) {
    const lines = splitLines(change.value);
    if (change.added) {
      segments.push({ type: "added", lines });
    } else if (change.removed) {
      segments.push({ type: "removed", lines });
    } else {
      segments.push({ type: "unchanged", lines });
    }
  }

  // Pair adjacent removed+added into modified; build DiffRows
  const rows: DiffRow[] = [];
  let leftLine = 1;
  let rightLine = 1;
  let additions = 0;
  let deletions = 0;

  let i = 0;
  while (i < segments.length) {
    const seg = segments[i];

    if (seg.type === "unchanged") {
      for (const line of seg.lines) {
        rows.push({
          type: "unchanged",
          leftLine: leftLine++,
          leftContent: line,
          rightLine: rightLine++,
          rightContent: line,
        });
      }
      i++;
    } else if (
      seg.type === "removed" &&
      i + 1 < segments.length &&
      segments[i + 1].type === "added"
    ) {
      // Pair removed + added into modified rows
      const removed = seg.lines;
      const added = segments[i + 1].lines;
      const maxLen = Math.max(removed.length, added.length);

      for (let j = 0; j < maxLen; j++) {
        const hasLeft = j < removed.length;
        const hasRight = j < added.length;
        rows.push({
          type: "modified",
          leftLine: hasLeft ? leftLine++ : null,
          leftContent: hasLeft ? removed[j] : "",
          rightLine: hasRight ? rightLine++ : null,
          rightContent: hasRight ? added[j] : "",
        });
      }
      deletions += removed.length;
      additions += added.length;
      i += 2;
    } else if (seg.type === "removed") {
      for (const line of seg.lines) {
        rows.push({
          type: "removed",
          leftLine: leftLine++,
          leftContent: line,
          rightLine: null,
          rightContent: "",
        });
      }
      deletions += seg.lines.length;
      i++;
    } else {
      // added (not preceded by removed)
      for (const line of seg.lines) {
        rows.push({
          type: "added",
          leftLine: null,
          leftContent: "",
          rightLine: rightLine++,
          rightContent: line,
        });
      }
      additions += seg.lines.length;
      i++;
    }
  }

  const isTruncated = rows.length > MAX_ROWS;
  const truncatedRows = isTruncated ? rows.slice(0, MAX_ROWS) : rows;

  return {
    filePath,
    rows: truncatedRows,
    additions,
    deletions,
    isTruncated,
  };
}

/** Split text into lines, removing trailing empty line from final newline. */
function splitLines(text: string): string[] {
  const lines = text.split("\n");
  // diffLines includes trailing newline in each chunk, producing an empty last element
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}
