import { resolve, relative } from "path";

const FILE_REF_REGEX = /@([\w./-]+\.\w+)/g;
const MAX_REFERENCES = 10;
const MAX_LINES_PER_FILE = 500;

const IGNORED_DIRS = ["node_modules", ".git", "dist", "build"];

export interface FileReference {
  token: string;
  resolvedPath: string;
  content: string;
}

export interface ResolveResult {
  expandedText: string;
  references: FileReference[];
}

/**
 * Resolve `@path/to/file.ext` tokens in text.
 * Returns the expanded text (with file contents appended) and the list of resolved references.
 */
export async function resolveFileReferences(
  text: string,
  cwd: string
): Promise<ResolveResult> {
  const matches = [...text.matchAll(FILE_REF_REGEX)];
  if (matches.length === 0) {
    return { expandedText: text, references: [] };
  }

  const references: FileReference[] = [];
  const seen = new Set<string>();

  for (const match of matches) {
    if (references.length >= MAX_REFERENCES) break;

    const token = match[1];
    const resolvedPath = resolve(cwd, token);

    if (seen.has(resolvedPath)) continue;
    seen.add(resolvedPath);

    try {
      const file = Bun.file(resolvedPath);
      if (!(await file.exists())) continue;

      const fullContent = await file.text();
      const lines = fullContent.split("\n");
      const truncated = lines.length > MAX_LINES_PER_FILE;
      const content = truncated
        ? lines.slice(0, MAX_LINES_PER_FILE).join("\n") + "\n... (truncated)"
        : fullContent;

      references.push({ token, resolvedPath, content });
    } catch {
      // Skip files that can't be read
    }
  }

  if (references.length === 0) {
    return { expandedText: text, references: [] };
  }

  // Build the expanded text with file contents appended
  const ext = (path: string) => {
    const dot = path.lastIndexOf(".");
    return dot >= 0 ? path.slice(dot + 1) : "";
  };

  const refSection = references
    .map(
      (ref) =>
        `### @${ref.token}\n\`\`\`${ext(ref.token)}\n${ref.content}\n\`\`\``
    )
    .join("\n\n");

  const expandedText = `${text}\n\n---\nReferenced files:\n${refSection}`;
  return { expandedText, references };
}

/**
 * Fuzzy-match files for autocomplete given a partial path.
 * Returns relative paths sorted by relevance (prefix matches first).
 *
 * Uses a subprocess (`find`) so the glob scan never blocks the event loop
 * and stdin remains responsive while autocomplete is resolving.
 */
export async function fuzzyMatchFiles(
  partial: string,
  cwd: string,
  maxResults: number = 8
): Promise<string[]> {
  if (!partial || partial.length === 0) return [];

  const excludes = IGNORED_DIRS.flatMap((dir) => ["-not", "-path", `*/${dir}/*`]);

  // If partial contains a slash, match against the full path; otherwise just the filename
  const matchFlag = partial.includes("/") ? "-ipath" : "-iname";
  const matchPattern = partial.includes("/") ? `*/${partial}*` : `${partial}*`;

  const args = [
    "find", cwd,
    ...excludes,
    "-type", "f",
    matchFlag, matchPattern,
    "-maxdepth", "6",
  ];

  const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });

  // Hard timeout — never let this hang
  const timeout = new Promise<"timeout">((resolve) =>
    setTimeout(() => resolve("timeout"), 2_000)
  );
  const done = proc.exited.then(() => "done" as const);
  const race = await Promise.race([done, timeout]);

  if (race === "timeout") {
    proc.kill();
    return [];
  }

  const stdout = await new Response(proc.stdout).text();
  if (!stdout.trim()) return [];

  const results = stdout
    .trim()
    .split("\n")
    .map((p) => relative(cwd, p))
    .filter((p) => p.length > 0);

  // Sort: exact prefix matches first, then by length (shorter = more relevant)
  const partialLower = partial.toLowerCase();
  results.sort((a, b) => {
    const aBase = a.split("/").pop()!.toLowerCase();
    const bBase = b.split("/").pop()!.toLowerCase();
    const aPrefix = aBase.startsWith(partialLower) ? 0 : 1;
    const bPrefix = bBase.startsWith(partialLower) ? 0 : 1;
    if (aPrefix !== bPrefix) return aPrefix - bPrefix;
    return a.length - b.length;
  });

  return results.slice(0, maxResults);
}
