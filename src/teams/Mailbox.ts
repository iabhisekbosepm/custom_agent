import { generateId } from "../utils/id.js";

export interface MailboxMessage {
  id: string;
  from: string;
  to: string;
  teamId: string;
  content: string;
  timestamp: number;
  read: boolean;
}

type MailboxListener = (message: MailboxMessage) => void;

/**
 * In-memory mailbox for inter-agent communication within a team.
 * Single-process Bun event loop guarantees no race conditions.
 */
export class Mailbox {
  private messages: MailboxMessage[] = [];
  private subscribers = new Map<string, Set<MailboxListener>>();

  constructor(private teamId: string) {}

  /** Send a message from one agent to another (or "all" for broadcast). */
  send(opts: { from: string; to: string; content: string }): MailboxMessage {
    const msg: MailboxMessage = {
      id: generateId(),
      from: opts.from,
      to: opts.to,
      teamId: this.teamId,
      content: opts.content,
      timestamp: Date.now(),
      read: false,
    };
    this.messages.push(msg);

    // Notify subscribers
    if (opts.to === "all") {
      for (const [agentId, listeners] of this.subscribers) {
        if (agentId !== opts.from) {
          for (const listener of listeners) listener(msg);
        }
      }
    } else {
      const listeners = this.subscribers.get(opts.to);
      if (listeners) {
        for (const listener of listeners) listener(msg);
      }
    }

    return msg;
  }

  /** Read unread messages for an agent. Marks them as read. */
  receive(agentId: string): MailboxMessage[] {
    const unread = this.messages.filter(
      (m) => !m.read && (m.to === agentId || m.to === "all") && m.from !== agentId
    );
    for (const m of unread) {
      m.read = true;
    }
    return unread;
  }

  /** Peek at unread messages without marking them as read. */
  peek(agentId: string): MailboxMessage[] {
    return this.messages.filter(
      (m) => !m.read && (m.to === agentId || m.to === "all") && m.from !== agentId
    );
  }

  /** Subscribe to new messages for a specific agent. Returns unsubscribe function. */
  subscribe(agentId: string, listener: MailboxListener): () => void {
    if (!this.subscribers.has(agentId)) {
      this.subscribers.set(agentId, new Set());
    }
    this.subscribers.get(agentId)!.add(listener);
    return () => {
      this.subscribers.get(agentId)?.delete(listener);
    };
  }

  /** Get full message history for the team. */
  history(): MailboxMessage[] {
    return [...this.messages];
  }

  /** Clear all messages and subscribers. */
  clear(): void {
    this.messages = [];
    this.subscribers.clear();
  }
}
