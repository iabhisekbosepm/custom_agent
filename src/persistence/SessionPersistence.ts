import { join } from "path";
import { mkdir } from "fs/promises";
import type { Message } from "../types/messages.js";
import type { Logger } from "../utils/logger.js";

interface SessionManifest {
  sessionId: string;
  model: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

interface SessionData {
  manifest: SessionManifest;
  messages: Message[];
}

/**
 * Persists conversation transcripts to disk as JSON files.
 *
 * Layout:
 *   <baseDir>/sessions/<session-id>.json
 *   <baseDir>/sessions/_latest.json   (symlink-like: stores the latest session ID)
 */
export class SessionPersistence {
  private baseDir: string;
  private sessionsDir: string;
  private log: Logger;

  constructor(baseDir: string, log: Logger) {
    this.baseDir = baseDir;
    this.sessionsDir = join(baseDir, "sessions");
    this.log = log.child("session-persistence");
  }

  /** Ensure the sessions directory exists. */
  async init(): Promise<void> {
    await mkdir(this.sessionsDir, { recursive: true });
  }

  /** Save a session transcript to disk. */
  async save(
    sessionId: string,
    messages: Message[],
    model: string
  ): Promise<void> {
    // Filter out system messages — they get re-injected on load
    const persistMessages = messages.filter((m) => m.role !== "system");
    if (persistMessages.length === 0) return;

    const filePath = join(this.sessionsDir, `${sessionId}.json`);
    const now = Date.now();

    // Read existing manifest to preserve createdAt
    let createdAt = now;
    try {
      const existing = Bun.file(filePath);
      if (await existing.exists()) {
        const data: SessionData = await existing.json();
        createdAt = data.manifest.createdAt;
      }
    } catch {
      // First save
    }

    const data: SessionData = {
      manifest: {
        sessionId,
        model,
        createdAt,
        updatedAt: now,
        messageCount: persistMessages.length,
      },
      messages: persistMessages,
    };

    await Bun.write(filePath, JSON.stringify(data, null, 2));

    // Write latest pointer
    await Bun.write(
      join(this.sessionsDir, "_latest.json"),
      JSON.stringify({ sessionId, updatedAt: now })
    );

    this.log.debug(`Session saved: ${sessionId}`, {
      messageCount: persistMessages.length,
    });
  }

  /** Load a session transcript from disk. */
  async load(sessionId: string): Promise<Message[] | null> {
    try {
      const filePath = join(this.sessionsDir, `${sessionId}.json`);
      const file = Bun.file(filePath);
      if (!(await file.exists())) return null;

      const data: SessionData = await file.json();
      this.log.debug(`Session loaded: ${sessionId}`, {
        messageCount: data.messages.length,
      });
      return data.messages;
    } catch (err) {
      this.log.warn(`Failed to load session ${sessionId}`, {
        error: String(err),
      });
      return null;
    }
  }

  /** Get the ID of the most recent session. */
  async getLatestSessionId(): Promise<string | null> {
    try {
      const file = Bun.file(join(this.sessionsDir, "_latest.json"));
      if (!(await file.exists())) return null;
      const data: { sessionId: string } = await file.json();
      return data.sessionId;
    } catch {
      return null;
    }
  }

  /** List all saved session IDs with their manifests. */
  async listSessions(): Promise<SessionManifest[]> {
    const { readdir } = await import("fs/promises");
    try {
      const files = await readdir(this.sessionsDir);
      const manifests: SessionManifest[] = [];

      for (const f of files) {
        if (f.startsWith("_") || !f.endsWith(".json")) continue;
        try {
          const data: SessionData = await Bun.file(
            join(this.sessionsDir, f)
          ).json();
          manifests.push(data.manifest);
        } catch {
          // Skip corrupted files
        }
      }

      return manifests.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
      return [];
    }
  }
}
