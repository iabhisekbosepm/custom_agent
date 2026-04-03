/**
 * Integration test: exercises the full /board flow end-to-end.
 * KanbanStore ↔ KanbanTool ↔ formatBoard — the same path the live app takes.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { KanbanStore } from "./KanbanStore.js";
import { createKanbanTool } from "../tools/KanbanTool/KanbanTool.js";
import type { Tool, ToolUseContext } from "../tools/Tool.js";
import { rmSync, mkdirSync } from "fs";
import { join } from "path";

const TEST_DIR = join(import.meta.dir, "__integration_test_data__");

// Minimal mock context — the kanban tool doesn't use most of these fields
const mockContext: ToolUseContext = {
  toolCall: { id: "test", type: "function", function: { name: "kanban", arguments: "{}" } },
  messages: [],
  config: {} as any,
  getAppState: () => ({}) as any,
  setAppState: () => {},
  abortSignal: new AbortController().signal,
  log: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, child: () => ({}) } as any,
};

describe("KanbanTool integration (/board flow)", () => {
  let store: KanbanStore;
  let tool: Tool<any>;

  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    store = new KanbanStore(TEST_DIR);
    tool = createKanbanTool(store);
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  test("/board with empty board shows 'No cards yet' message", async () => {
    const result = await tool.call({ action: "list" }, mockContext);
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain("Kanban Board");
    expect(result.content).toContain("No cards yet");
  });

  test("/board add_card creates a card and returns details", async () => {
    const result = await tool.call(
      { action: "add_card", title: "Implement user auth", priority: "high" },
      mockContext,
    );
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain("Card created");
    expect(result.content).toContain("Implement user auth");
    expect(result.content).toContain("BACKLOG");
    expect(result.content).toContain("high");
  });

  test("/board list shows the card after adding", async () => {
    await tool.call(
      { action: "add_card", title: "Codebase understanding", priority: "medium" },
      mockContext,
    );

    const result = await tool.call({ action: "list" }, mockContext);
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain("Codebase understanding");
    expect(result.content).toContain("BACKLOG (1)");
    expect(result.content).toContain("1 card");
  });

  test("full /board workflow: add → move → add_task → toggle → move to done", async () => {
    // 1. Add a card
    const addResult = await tool.call(
      { action: "add_card", title: "Explore codebase", description: "Understand project structure" },
      mockContext,
    );
    expect(addResult.content).toContain("Card created");

    // Extract card_id from the formatted output (8-char short id in brackets)
    const board = await store.load();
    const cardId = board.cards[0].id;

    // 2. Move to in-progress
    const moveResult = await tool.call(
      { action: "move_card", card_id: cardId, column: "in-progress" },
      mockContext,
    );
    expect(moveResult.content).toContain("IN-PROGRESS");

    // 3. Add sub-tasks
    const task1Result = await tool.call(
      { action: "add_task", card_id: cardId, title: "Map directory structure" },
      mockContext,
    );
    expect(task1Result.content).toContain("Task added");

    const task2Result = await tool.call(
      { action: "add_task", card_id: cardId, title: "Identify entry points" },
      mockContext,
    );
    expect(task2Result.content).toContain("Task added");

    // 4. Verify board shows tasks
    const listResult = await tool.call({ action: "list" }, mockContext);
    expect(listResult.content).toContain("IN-PROGRESS (1)");
    expect(listResult.content).toContain("Map directory structure");
    expect(listResult.content).toContain("Identify entry points");

    // 5. Toggle tasks as done
    const updatedCard = await store.getCard(cardId);
    const taskId1 = updatedCard!.tasks[0].id;
    const taskId2 = updatedCard!.tasks[1].id;

    const toggle1 = await tool.call(
      { action: "toggle_task", card_id: cardId, task_id: taskId1 },
      mockContext,
    );
    expect(toggle1.content).toContain("done");

    const toggle2 = await tool.call(
      { action: "toggle_task", card_id: cardId, task_id: taskId2 },
      mockContext,
    );
    expect(toggle2.content).toContain("done");

    // 6. Move to done
    const doneResult = await tool.call(
      { action: "move_card", card_id: cardId, column: "done" },
      mockContext,
    );
    expect(doneResult.content).toContain("DONE");

    // 7. Final board state
    const finalBoard = await tool.call({ action: "list" }, mockContext);
    expect(finalBoard.content).toContain("DONE (1)");
    expect(finalBoard.content).toContain("Explore codebase");
  });

  test("add_card with missing title returns error", async () => {
    const result = await tool.call({ action: "add_card" }, mockContext);
    expect(result.isError).toBe(true);
    expect(result.content).toContain("title");
    expect(result.content).toContain("required");
  });

  test("move_card with missing card_id returns error", async () => {
    const result = await tool.call({ action: "move_card", column: "done" }, mockContext);
    expect(result.isError).toBe(true);
    expect(result.content).toContain("card_id");
    expect(result.content).toContain("required");
  });

  test("move_card with bad card_id returns error", async () => {
    const result = await tool.call(
      { action: "move_card", card_id: "nonexistent", column: "done" },
      mockContext,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain("Card not found");
  });

  test("list filtered by column works", async () => {
    await tool.call({ action: "add_card", title: "Card A" }, mockContext);
    await tool.call({ action: "add_card", title: "Card B", column: "in-progress" }, mockContext);
    await tool.call({ action: "add_card", title: "Card C", column: "done" }, mockContext);

    const backlogOnly = await tool.call({ action: "list", column: "backlog" }, mockContext);
    expect(backlogOnly.content).toContain("Card A");
    expect(backlogOnly.content).not.toContain("Card B");
    expect(backlogOnly.content).not.toContain("Card C");
  });

  test("archive_card removes card and confirms", async () => {
    await tool.call({ action: "add_card", title: "Temp card" }, mockContext);
    const board = await store.load();
    const cardId = board.cards[0].id;

    const archiveResult = await tool.call(
      { action: "archive_card", card_id: cardId },
      mockContext,
    );
    expect(archiveResult.isError).toBeFalsy();
    expect(archiveResult.content).toContain("archived");

    // Board should be empty now
    const listResult = await tool.call({ action: "list" }, mockContext);
    expect(listResult.content).toContain("No cards yet");
  });

  test("update_card changes title and priority", async () => {
    await tool.call(
      { action: "add_card", title: "Old title", priority: "low" },
      mockContext,
    );
    const board = await store.load();
    const cardId = board.cards[0].id;

    const updateResult = await tool.call(
      { action: "update_card", card_id: cardId, title: "New title", priority: "high" },
      mockContext,
    );
    expect(updateResult.content).toContain("Card updated");
    expect(updateResult.content).toContain("New title");
    expect(updateResult.content).toContain("high");
  });

  test("remove_task removes a task from card", async () => {
    await tool.call({ action: "add_card", title: "Task card" }, mockContext);
    const board = await store.load();
    const cardId = board.cards[0].id;

    await tool.call({ action: "add_task", card_id: cardId, title: "Will be removed" }, mockContext);
    const card = await store.getCard(cardId);
    const taskId = card!.tasks[0].id;

    const removeResult = await tool.call(
      { action: "remove_task", card_id: cardId, task_id: taskId },
      mockContext,
    );
    expect(removeResult.isError).toBeFalsy();
    expect(removeResult.content).toContain("removed");
  });

  test("data persists across store instances (simulates app restart)", async () => {
    // Add card with first store/tool instance
    await tool.call(
      { action: "add_card", title: "Persistent card", priority: "high" },
      mockContext,
    );

    // Create new store + tool (simulates restart)
    const store2 = new KanbanStore(TEST_DIR);
    const tool2 = createKanbanTool(store2);

    const result = await tool2.call({ action: "list" }, mockContext);
    expect(result.content).toContain("Persistent card");
    expect(result.content).toContain("1 card");
  });
});
