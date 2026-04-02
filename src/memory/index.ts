import { join } from "path";
import { mkdir } from "fs/promises";
import type { Logger } from "../utils/logger.js";

/** The kind of memory determines scope and lifetime. */
export type MemoryKind = "project" | "user" | "session";

/** A single memory entry. */
export interface MemoryEntry {
  key: string;
  value: string;
  kind: MemoryKind;
  updatedAt: number;
}

/**
 * File-based memory system.
 * Stores key-value pairs as JSON files organized by kind.
 *
 * Layout:
 *   <baseDir>/project/<key>.json
 *   <baseDir>/user/<key>.json
 *   <baseDir>/session/<sessionId>/<key>.json
 */
export class MemoryStore {
  private baseDir: string;
  private sessionId: string;
  private cache = new Map<string, MemoryEntry>();
  private log: Logger;

  constructor(baseDir: string, sessionId: string, log: Logger) {
    this.baseDir = baseDir;
    this.sessionId = sessionId;
    this.log = log.child("memory");
  }

  private pathFor(kind: MemoryKind, key: string): string {
    if (kind === "session") {
      return join(this.baseDir, kind, this.sessionId, `${key}.json`);
    }
    return join(this.baseDir, kind, `${key}.json`);
  }

  private cacheKey(kind: MemoryKind, key: string): string {
    return `${kind}:${key}`;
  }

  async get(kind: MemoryKind, key: string): Promise<string | null> {
    const ck = this.cacheKey(kind, key);
    const cached = this.cache.get(ck);
    if (cached) return cached.value;

    try {
      const file = Bun.file(this.pathFor(kind, key));
      if (!(await file.exists())) return null;
      const entry: MemoryEntry = await file.json();
      this.cache.set(ck, entry);
      return entry.value;
    } catch {
      return null;
    }
  }

  async set(kind: MemoryKind, key: string, value: string): Promise<void> {
    const entry: MemoryEntry = {
      key,
      value,
      kind,
      updatedAt: Date.now(),
    };

    const filePath = this.pathFor(kind, key);
    const dir = filePath.substring(0, filePath.lastIndexOf("/"));
    await mkdir(dir, { recursive: true });
    await Bun.write(filePath, JSON.stringify(entry, null, 2));

    this.cache.set(this.cacheKey(kind, key), entry);
    this.log.debug(`Memory set: ${kind}/${key}`);
  }

  async delete(kind: MemoryKind, key: string): Promise<boolean> {
    const filePath = this.pathFor(kind, key);
    try {
      const file = Bun.file(filePath);
      if (await file.exists()) {
        const { unlink } = await import("fs/promises");
        await unlink(filePath);
        this.cache.delete(this.cacheKey(kind, key));
        return true;
      }
    } catch {
      // Best effort
    }
    return false;
  }

  async list(kind: MemoryKind): Promise<string[]> {
    const { readdir } = await import("fs/promises");
    let dir: string;
    if (kind === "session") {
      dir = join(this.baseDir, kind, this.sessionId);
    } else {
      dir = join(this.baseDir, kind);
    }

    try {
      const files = await readdir(dir);
      return files
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.replace(".json", ""));
    } catch {
      return [];
    }
  }

  /**
   * Build a context string from memory entries to inject into system prompt.
   * Loads all entries for the given kinds.
   */
  async buildContext(kinds: MemoryKind[]): Promise<string> {
    const sections: string[] = [];

    for (const kind of kinds) {
      const keys = await this.list(kind);
      if (keys.length === 0) continue;

      const entries: string[] = [];
      for (const key of keys) {
        const value = await this.get(kind, key);
        if (value) entries.push(`- ${key}: ${value}`);
      }

      if (entries.length > 0) {
        sections.push(`[${kind} memory]\n${entries.join("\n")}`);
      }
    }

    return sections.join("\n\n");
  }
}
