import { join } from "path";
import { readFile, writeFile, mkdir } from "fs/promises";
import { generateId } from "../utils/id.js";

// ── Types ────────────────────────────────────────────────────────────────────

export type KanbanColumn = "backlog" | "planning" | "in-progress" | "review" | "done";

export const KANBAN_COLUMNS: KanbanColumn[] = [
  "backlog",
  "planning",
  "in-progress",
  "review",
  "done",
];

export interface KanbanTask {
  id: string;
  title: string;
  done: boolean;
  createdAt: number;
}

export interface KanbanCard {
  id: string;
  title: string;
  description?: string;
  column: KanbanColumn;
  priority: "low" | "medium" | "high";
  tasks: KanbanTask[];
  createdAt: number;
  updatedAt: number;
  labels?: string[];
}

export interface KanbanBoard {
  version: 1;
  projectName: string;
  cards: KanbanCard[];
}

// ── Store ────────────────────────────────────────────────────────────────────

/**
 * Persistent, file-backed Kanban board.
 * Mirrors the CustomAgentStore / CustomSkillStore pattern.
 * Data lives at `<dataDir>/kanban.json`.
 */
export class KanbanStore {
  private filePath: string;

  constructor(dataDir: string) {
    this.filePath = join(dataDir, "kanban.json");
  }

  // ── Board-level ──────────────────────────────────────────────────────────

  async load(): Promise<KanbanBoard> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      const data: KanbanBoard = JSON.parse(raw);
      if (!data || !Array.isArray(data.cards)) {
        return this.emptyBoard();
      }
      return data;
    } catch {
      return this.emptyBoard();
    }
  }

  async save(board: KanbanBoard): Promise<void> {
    const dir = join(this.filePath, "..");
    await mkdir(dir, { recursive: true });
    await writeFile(this.filePath, JSON.stringify(board, null, 2) + "\n", "utf-8");
  }

  // ── Card CRUD ────────────────────────────────────────────────────────────

  async addCard(opts: {
    title: string;
    description?: string;
    column?: KanbanColumn;
    priority?: "low" | "medium" | "high";
    labels?: string[];
  }): Promise<KanbanCard> {
    const board = await this.load();
    const now = Date.now();
    const card: KanbanCard = {
      id: generateId(),
      title: opts.title,
      description: opts.description,
      column: opts.column ?? "backlog",
      priority: opts.priority ?? "medium",
      tasks: [],
      createdAt: now,
      updatedAt: now,
      labels: opts.labels,
    };
    board.cards.push(card);
    await this.save(board);
    return card;
  }

  async getCard(cardId: string): Promise<KanbanCard | undefined> {
    const board = await this.load();
    return board.cards.find((c) => c.id === cardId);
  }

  async moveCard(cardId: string, column: KanbanColumn): Promise<KanbanCard> {
    const board = await this.load();
    const card = board.cards.find((c) => c.id === cardId);
    if (!card) throw new Error(`Card not found: ${cardId}`);
    card.column = column;
    card.updatedAt = Date.now();
    await this.save(board);
    return card;
  }

  async updateCard(
    cardId: string,
    updates: Partial<Pick<KanbanCard, "title" | "description" | "priority" | "labels">>,
  ): Promise<KanbanCard> {
    const board = await this.load();
    const card = board.cards.find((c) => c.id === cardId);
    if (!card) throw new Error(`Card not found: ${cardId}`);

    if (updates.title !== undefined) card.title = updates.title;
    if (updates.description !== undefined) card.description = updates.description;
    if (updates.priority !== undefined) card.priority = updates.priority;
    if (updates.labels !== undefined) card.labels = updates.labels;
    card.updatedAt = Date.now();

    await this.save(board);
    return card;
  }

  async archiveCard(cardId: string): Promise<boolean> {
    const board = await this.load();
    const idx = board.cards.findIndex((c) => c.id === cardId);
    if (idx === -1) return false;
    board.cards.splice(idx, 1);
    await this.save(board);
    return true;
  }

  // ── Task CRUD (within a card) ────────────────────────────────────────────

  async addTask(cardId: string, title: string): Promise<KanbanTask> {
    const board = await this.load();
    const card = board.cards.find((c) => c.id === cardId);
    if (!card) throw new Error(`Card not found: ${cardId}`);

    const task: KanbanTask = {
      id: generateId(),
      title,
      done: false,
      createdAt: Date.now(),
    };
    card.tasks.push(task);
    card.updatedAt = Date.now();
    await this.save(board);
    return task;
  }

  async toggleTask(cardId: string, taskId: string): Promise<KanbanTask> {
    const board = await this.load();
    const card = board.cards.find((c) => c.id === cardId);
    if (!card) throw new Error(`Card not found: ${cardId}`);
    const task = card.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    task.done = !task.done;
    card.updatedAt = Date.now();
    await this.save(board);
    return task;
  }

  async removeTask(cardId: string, taskId: string): Promise<boolean> {
    const board = await this.load();
    const card = board.cards.find((c) => c.id === cardId);
    if (!card) throw new Error(`Card not found: ${cardId}`);

    const idx = card.tasks.findIndex((t) => t.id === taskId);
    if (idx === -1) return false;
    card.tasks.splice(idx, 1);
    card.updatedAt = Date.now();
    await this.save(board);
    return true;
  }

  // ── Queries ──────────────────────────────────────────────────────────────

  async listByColumn(column?: KanbanColumn): Promise<KanbanCard[]> {
    const board = await this.load();
    if (!column) return board.cards;
    return board.cards.filter((c) => c.column === column);
  }

  /**
   * Compact text summary for system prompt injection.
   * Returns empty string when board is empty.
   */
  async getSummary(): Promise<string> {
    const board = await this.load();
    if (board.cards.length === 0) return "";

    const lines: string[] = [`[Kanban Board — ${board.cards.length} card${board.cards.length === 1 ? "" : "s"}]`];

    for (const col of KANBAN_COLUMNS) {
      const cards = board.cards.filter((c) => c.column === col);
      if (cards.length === 0) continue;

      const colLabel = col.toUpperCase();
      lines.push(`${colLabel} (${cards.length}):`);

      for (const card of cards) {
        let entry = `  "${card.title}" [${card.priority}]`;
        if (card.tasks.length > 0) {
          const done = card.tasks.filter((t) => t.done).length;
          entry += ` (${done}/${card.tasks.length} tasks done)`;
        }
        lines.push(entry);
      }
    }

    return lines.join("\n");
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private emptyBoard(): KanbanBoard {
    const cwd = process.cwd();
    const projectName = cwd.split("/").pop() ?? "project";
    return { version: 1, projectName, cards: [] };
  }
}
