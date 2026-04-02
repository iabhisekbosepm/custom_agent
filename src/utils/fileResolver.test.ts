import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { resolveFileReferences, fuzzyMatchFiles } from "./fileResolver.js";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";

const TEST_DIR = join(import.meta.dir, "__test_fixtures__");

beforeAll(() => {
  mkdirSync(join(TEST_DIR, "src", "utils"), { recursive: true });
  mkdirSync(join(TEST_DIR, "src", "components"), { recursive: true });

  writeFileSync(join(TEST_DIR, "src", "utils", "helper.ts"), "export const x = 1;\nexport const y = 2;\n");
  writeFileSync(join(TEST_DIR, "src", "utils", "logger.ts"), "export function log() {}\n");
  writeFileSync(join(TEST_DIR, "src", "components", "App.tsx"), "export function App() { return null; }\n");
  writeFileSync(join(TEST_DIR, "readme.md"), "# Test\n");
});

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("resolveFileReferences", () => {
  test("returns unchanged text when no @ references", async () => {
    const result = await resolveFileReferences("hello world", TEST_DIR);
    expect(result.expandedText).toBe("hello world");
    expect(result.references).toHaveLength(0);
  });

  test("resolves a single file reference", async () => {
    const result = await resolveFileReferences(
      "Look at @src/utils/helper.ts for details",
      TEST_DIR
    );
    expect(result.references).toHaveLength(1);
    expect(result.references[0].token).toBe("src/utils/helper.ts");
    expect(result.references[0].content).toContain("export const x = 1;");
    expect(result.expandedText).toContain("Referenced files:");
    expect(result.expandedText).toContain("### @src/utils/helper.ts");
  });

  test("resolves multiple file references", async () => {
    const result = await resolveFileReferences(
      "Compare @src/utils/helper.ts and @src/utils/logger.ts",
      TEST_DIR
    );
    expect(result.references).toHaveLength(2);
  });

  test("deduplicates same file referenced twice", async () => {
    const result = await resolveFileReferences(
      "@src/utils/helper.ts and again @src/utils/helper.ts",
      TEST_DIR
    );
    expect(result.references).toHaveLength(1);
  });

  test("skips non-existent files silently", async () => {
    const result = await resolveFileReferences(
      "Check @src/does-not-exist.ts please",
      TEST_DIR
    );
    expect(result.references).toHaveLength(0);
    expect(result.expandedText).toBe("Check @src/does-not-exist.ts please");
  });

  test("does not match @username without extension", async () => {
    const result = await resolveFileReferences(
      "Thanks @john for the review",
      TEST_DIR
    );
    expect(result.references).toHaveLength(0);
  });

  test("caps references at 10", async () => {
    // Create 12 unique tokens (only some will resolve)
    const tokens = Array.from({ length: 12 }, (_, i) => `@src/utils/helper.ts`);
    // Since dedup, this only resolves one. Let's create actual files.
    const refs = Array.from(
      { length: 12 },
      (_, i) => `@file${i}.txt`
    );

    // Create temp files
    for (let i = 0; i < 12; i++) {
      writeFileSync(join(TEST_DIR, `file${i}.txt`), `content ${i}`);
    }

    const result = await resolveFileReferences(refs.join(" "), TEST_DIR);
    expect(result.references.length).toBeLessThanOrEqual(10);

    // Cleanup
    for (let i = 0; i < 12; i++) {
      rmSync(join(TEST_DIR, `file${i}.txt`), { force: true });
    }
  });
});

describe("fuzzyMatchFiles", () => {
  test("returns empty for empty partial", async () => {
    const result = await fuzzyMatchFiles("", TEST_DIR);
    expect(result).toHaveLength(0);
  });

  test("finds files matching partial name", async () => {
    const result = await fuzzyMatchFiles("helper", TEST_DIR);
    expect(result.some((r) => r.includes("helper.ts"))).toBe(true);
  });

  test("finds files matching partial path", async () => {
    const result = await fuzzyMatchFiles("utils/log", TEST_DIR);
    expect(result.some((r) => r.includes("logger.ts"))).toBe(true);
  });

  test("respects maxResults", async () => {
    const result = await fuzzyMatchFiles("src", TEST_DIR, 2);
    expect(result.length).toBeLessThanOrEqual(2);
  });

  test("finds tsx files", async () => {
    const result = await fuzzyMatchFiles("App", TEST_DIR);
    expect(result.some((r) => r.includes("App.tsx"))).toBe(true);
  });
});
