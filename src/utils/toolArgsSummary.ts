const PRIORITY_KEYS = [
  "file_path",
  "path",
  "pattern",
  "command",
  "query",
  "url",
  "glob",
  "regex",
  "name",
  "description",
];

const SKIP_KEYS = new Set([
  "content",
  "old_string",
  "new_string",
  "body",
  "data",
  "input",
]);

export function summarizeToolArgs(argsJson: string, maxLen = 60): string {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(argsJson);
  } catch {
    return "";
  }

  if (typeof parsed !== "object" || parsed === null) return "";

  const keys = Object.keys(parsed);
  if (keys.length === 0) return "";

  // Sort keys by priority
  const sorted = [...keys].sort((a, b) => {
    const ai = PRIORITY_KEYS.indexOf(a);
    const bi = PRIORITY_KEYS.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return 0;
  });

  const parts: string[] = [];
  for (const key of sorted) {
    if (SKIP_KEYS.has(key)) continue;
    const val = parsed[key];
    const str = typeof val === "string" ? val : JSON.stringify(val);
    parts.push(`${key}: ${str}`);
  }

  const result = parts.join(", ");
  if (result.length <= maxLen) return result;
  return result.slice(0, maxLen - 1) + "\u2026";
}
