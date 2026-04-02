import { describe, test, expect } from "bun:test";
import { computeSideBySideDiff } from "./diff.js";

describe("computeSideBySideDiff", () => {
  test("identical content produces all unchanged rows", () => {
    const content = "line1\nline2\nline3\n";
    const result = computeSideBySideDiff("test.txt", content, content);

    expect(result.additions).toBe(0);
    expect(result.deletions).toBe(0);
    expect(result.isTruncated).toBe(false);
    expect(result.rows.length).toBe(3);
    for (const row of result.rows) {
      expect(row.type).toBe("unchanged");
    }
  });

  test("simple addition", () => {
    const oldContent = "line1\nline2\n";
    const newContent = "line1\nline2\nline3\n";
    const result = computeSideBySideDiff("test.txt", oldContent, newContent);

    expect(result.additions).toBe(1);
    expect(result.deletions).toBe(0);

    const addedRows = result.rows.filter((r) => r.type === "added");
    expect(addedRows.length).toBe(1);
    expect(addedRows[0].rightContent).toBe("line3");
    expect(addedRows[0].leftLine).toBeNull();
  });

  test("simple removal", () => {
    const oldContent = "line1\nline2\nline3\n";
    const newContent = "line1\nline2\n";
    const result = computeSideBySideDiff("test.txt", oldContent, newContent);

    expect(result.additions).toBe(0);
    expect(result.deletions).toBe(1);

    const removedRows = result.rows.filter((r) => r.type === "removed");
    expect(removedRows.length).toBe(1);
    expect(removedRows[0].leftContent).toBe("line3");
    expect(removedRows[0].rightLine).toBeNull();
  });

  test("adjacent remove+add paired into modified rows", () => {
    const oldContent = "hello world\n";
    const newContent = "hello earth\n";
    const result = computeSideBySideDiff("test.txt", oldContent, newContent);

    const modifiedRows = result.rows.filter((r) => r.type === "modified");
    expect(modifiedRows.length).toBeGreaterThan(0);
    expect(modifiedRows[0].leftContent).toBe("hello world");
    expect(modifiedRows[0].rightContent).toBe("hello earth");
  });

  test("truncation at 200 rows", () => {
    const lines = Array.from({ length: 300 }, (_, i) => `old-${i}`).join("\n") + "\n";
    const newLines = Array.from({ length: 300 }, (_, i) => `new-${i}`).join("\n") + "\n";
    const result = computeSideBySideDiff("big.txt", lines, newLines);

    expect(result.isTruncated).toBe(true);
    expect(result.rows.length).toBe(200);
  });

  test("correct line numbers preserved", () => {
    const oldContent = "a\nb\nc\nd\n";
    const newContent = "a\nB\nc\nd\n";
    const result = computeSideBySideDiff("test.txt", oldContent, newContent);

    // "a" is unchanged at line 1
    expect(result.rows[0].type).toBe("unchanged");
    expect(result.rows[0].leftLine).toBe(1);
    expect(result.rows[0].rightLine).toBe(1);

    // "b" → "B" is modified
    const modRow = result.rows.find((r) => r.type === "modified");
    expect(modRow).toBeDefined();
    expect(modRow!.leftLine).toBe(2);
    expect(modRow!.rightLine).toBe(2);
    expect(modRow!.leftContent).toBe("b");
    expect(modRow!.rightContent).toBe("B");

    // Lines after modification should have correct line numbers
    const lastRow = result.rows[result.rows.length - 1];
    expect(lastRow.leftLine).toBe(4);
    expect(lastRow.rightLine).toBe(4);
  });
});
