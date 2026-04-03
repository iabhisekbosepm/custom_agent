import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { KanbanStore } from "./KanbanStore.js";
import { rmSync, mkdirSync } from "fs";
import { join } from "path";

const TEST_DIR = join(import.meta.dir, "__test_data__");

describe("KanbanStore", () => {
  let store: KanbanStore;

  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    store = new KanbanStore(TEST_DIR);
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  // ── Board load/save ────────────────────────────────────────────────────

  test("load returns empty board when file missing", async () => {
    const board = await store.load();
    expect(board.version).toBe(1);
    expect(board.cards).toEqual([]);
  });

  test("save and load roundtrip preserves data", async () => {
    const card = await store.addCard({ title: "Test card" });
    const board = await store.load();
    expect(board.cards.length).toBe(1);
    expect(board.cards[0].title).toBe("Test card");
    expect(board.cards[0].id).toBe(card.id);
  });

  // ── Card CRUD ──────────────────────────────────────────────────────────

  test("addCard creates card in backlog with defaults", async () => {
    const card = await store.addCard({ title: "New feature" });
    expect(card.column).toBe("backlog");
    expect(card.priority).toBe("medium");
    expect(card.tasks).toEqual([]);
    expect(card.id).toBeDefined();
  });

  test("addCard respects custom column and priority", async () => {
    const card = await store.addCard({
      title: "Urgent fix",
      column: "in-progress",
      priority: "high",
      labels: ["bugfix"],
    });
    expect(card.column).toBe("in-progress");
    expect(card.priority).toBe("high");
    expect(card.labels).toEqual(["bugfix"]);
  });

  test("addCard stores description", async () => {
    const card = await store.addCard({
      title: "With desc",
      description: "Some details here",
    });
    expect(card.description).toBe("Some details here");
  });

  test("getCard returns card by ID", async () => {
    const card = await store.addCard({ title: "Find me" });
    const found = await store.getCard(card.id);
    expect(found).toBeDefined();
    expect(found!.title).toBe("Find me");
  });

  test("getCard returns undefined for missing ID", async () => {
    const found = await store.getCard("nonexistent");
    expect(found).toBeUndefined();
  });

  test("moveCard changes column", async () => {
    const card = await store.addCard({ title: "Moving card" });
    expect(card.column).toBe("backlog");

    const moved = await store.moveCard(card.id, "in-progress");
    expect(moved.column).toBe("in-progress");

    // Verify persistence
    const reloaded = await store.getCard(card.id);
    expect(reloaded!.column).toBe("in-progress");
  });

  test("moveCard throws for invalid card ID", async () => {
    expect(store.moveCard("bad-id", "done")).rejects.toThrow();
  });

  test("updateCard updates title and priority", async () => {
    const card = await store.addCard({ title: "Old title", priority: "low" });
    const updated = await store.updateCard(card.id, {
      title: "New title",
      priority: "high",
    });
    expect(updated.title).toBe("New title");
    expect(updated.priority).toBe("high");
  });

  test("updateCard updates description and labels", async () => {
    const card = await store.addCard({ title: "Update me" });
    const updated = await store.updateCard(card.id, {
      description: "New desc",
      labels: ["feature", "urgent"],
    });
    expect(updated.description).toBe("New desc");
    expect(updated.labels).toEqual(["feature", "urgent"]);
  });

  test("updateCard throws for missing card", async () => {
    expect(store.updateCard("bad-id", { title: "Nope" })).rejects.toThrow();
  });

  test("archiveCard removes card from board", async () => {
    const card = await store.addCard({ title: "Delete me" });
    const result = await store.archiveCard(card.id);
    expect(result).toBe(true);

    const found = await store.getCard(card.id);
    expect(found).toBeUndefined();
  });

  test("archiveCard returns false for missing ID", async () => {
    const result = await store.archiveCard("nonexistent");
    expect(result).toBe(false);
  });

  // ── Task CRUD (within cards) ───────────────────────────────────────────

  test("addTask adds a task to card", async () => {
    const card = await store.addCard({ title: "With tasks" });
    const task = await store.addTask(card.id, "Sub-task 1");

    expect(task.title).toBe("Sub-task 1");
    expect(task.done).toBe(false);

    const updated = await store.getCard(card.id);
    expect(updated!.tasks.length).toBe(1);
  });

  test("addTask throws for missing card", async () => {
    expect(store.addTask("bad-id", "Task")).rejects.toThrow();
  });

  test("toggleTask flips done state", async () => {
    const card = await store.addCard({ title: "Toggle test" });
    const task = await store.addTask(card.id, "Flip me");
    expect(task.done).toBe(false);

    const toggled = await store.toggleTask(card.id, task.id);
    expect(toggled.done).toBe(true);

    const toggledBack = await store.toggleTask(card.id, task.id);
    expect(toggledBack.done).toBe(false);
  });

  test("toggleTask throws for missing task", async () => {
    const card = await store.addCard({ title: "Card" });
    expect(store.toggleTask(card.id, "bad-task-id")).rejects.toThrow();
  });

  test("removeTask removes task from card", async () => {
    const card = await store.addCard({ title: "Remove task test" });
    const task = await store.addTask(card.id, "Remove me");

    const result = await store.removeTask(card.id, task.id);
    expect(result).toBe(true);

    const updated = await store.getCard(card.id);
    expect(updated!.tasks.length).toBe(0);
  });

  test("removeTask returns false for missing task", async () => {
    const card = await store.addCard({ title: "Card" });
    const result = await store.removeTask(card.id, "bad-task-id");
    expect(result).toBe(false);
  });

  // ── Queries ────────────────────────────────────────────────────────────

  test("listByColumn filters cards", async () => {
    await store.addCard({ title: "Backlog 1" });
    await store.addCard({ title: "In Progress 1", column: "in-progress" });
    await store.addCard({ title: "Done 1", column: "done" });

    const backlog = await store.listByColumn("backlog");
    expect(backlog.length).toBe(1);
    expect(backlog[0].title).toBe("Backlog 1");

    const all = await store.listByColumn();
    expect(all.length).toBe(3);
  });

  test("getSummary returns formatted text", async () => {
    await store.addCard({ title: "Feature A", priority: "high" });
    const card = await store.addCard({ title: "Feature B", column: "in-progress" });
    await store.addTask(card.id, "Step 1");
    await store.addCard({ title: "Feature C", column: "done" });

    const summary = await store.getSummary();
    expect(summary).toContain("Kanban Board");
    expect(summary).toContain("Feature A");
    expect(summary).toContain("BACKLOG");
    expect(summary).toContain("IN-PROGRESS");
    expect(summary).toContain("DONE");
  });

  test("getSummary returns empty string for empty board", async () => {
    const summary = await store.getSummary();
    expect(summary).toBe("");
  });

  test("getSummary shows task progress", async () => {
    const card = await store.addCard({ title: "Task card", column: "planning" });
    await store.addTask(card.id, "Task 1");
    const t2 = await store.addTask(card.id, "Task 2");
    await store.toggleTask(card.id, t2.id);

    const summary = await store.getSummary();
    expect(summary).toContain("1/2 tasks done");
  });

  // ── Persistence across instances ───────────────────────────────────────

  test("new store instance reads data written by previous instance", async () => {
    await store.addCard({ title: "Persisted card", priority: "high" });

    const store2 = new KanbanStore(TEST_DIR);
    const board = await store2.load();
    expect(board.cards.length).toBe(1);
    expect(board.cards[0].title).toBe("Persisted card");
    expect(board.cards[0].priority).toBe("high");
  });

  // ── Column workflow ────────────────────────────────────────────────────

  test("card can move through full workflow", async () => {
    const card = await store.addCard({ title: "Full flow" });
    expect(card.column).toBe("backlog");

    await store.moveCard(card.id, "planning");
    await store.moveCard(card.id, "in-progress");
    await store.moveCard(card.id, "review");
    const final = await store.moveCard(card.id, "done");
    expect(final.column).toBe("done");
  });

  // ── Multiple cards ─────────────────────────────────────────────────────

  test("multiple cards coexist correctly", async () => {
    const c1 = await store.addCard({ title: "Card 1" });
    const c2 = await store.addCard({ title: "Card 2", column: "in-progress" });
    const c3 = await store.addCard({ title: "Card 3", column: "done" });

    await store.archiveCard(c2.id);

    const board = await store.load();
    expect(board.cards.length).toBe(2);
    expect(board.cards.map((c) => c.id)).toContain(c1.id);
    expect(board.cards.map((c) => c.id)).toContain(c3.id);
    expect(board.cards.map((c) => c.id)).not.toContain(c2.id);
  });
});
