import { z } from "zod";
import type { Tool, ToolResult, ToolUseContext } from "../Tool.js";
import type { KanbanStore, KanbanColumn } from "../../kanban/KanbanStore.js";
import { formatBoard, formatCardDetail } from "./formatBoard.js";

// ── Flat schema — LLM-friendly (no oneOf/discriminatedUnion) ───────────────
//
// All fields live on a single flat object with `action` as a required enum.
// Per-action fields are optional at the schema level; we validate them at
// runtime in the `call()` handler. This avoids the `oneOf` JSON-Schema that
// many LLMs (OpenRouter, Ollama, LM Studio) fail to parse correctly.

const KanbanInput = z.object({
  action: z
    .enum([
      "list",
      "add_card",
      "move_card",
      "update_card",
      "archive_card",
      "add_task",
      "toggle_task",
      "remove_task",
    ])
    .describe("The action to perform on the Kanban board."),

  // ── Card fields ────────────────────────────────────────────────────────
  card_id: z
    .string()
    .optional()
    .describe("Card ID. Required for: move_card, update_card, archive_card, add_task, toggle_task, remove_task."),
  title: z
    .string()
    .optional()
    .describe("Card or task title. Required for: add_card, add_task. Optional for: update_card."),
  description: z
    .string()
    .optional()
    .describe("Card description. Optional for: add_card, update_card."),
  column: z
    .enum(["backlog", "planning", "in-progress", "review", "done"])
    .optional()
    .describe("Column name. Required for: move_card. Optional for: list (filter), add_card (default: backlog)."),
  priority: z
    .enum(["low", "medium", "high"])
    .optional()
    .describe("Priority level. Optional for: add_card (default: medium), update_card."),
  labels: z
    .array(z.string())
    .optional()
    .describe("Tags like 'feature', 'bugfix'. Optional for: add_card, update_card."),

  // ── Task fields ────────────────────────────────────────────────────────
  task_id: z
    .string()
    .optional()
    .describe("Task ID within a card. Required for: toggle_task, remove_task."),
});

type KanbanInput = z.infer<typeof KanbanInput>;

// ── Helpers ────────────────────────────────────────────────────────────────

function requireField<T>(value: T | undefined, fieldName: string, action: string): T {
  if (value === undefined || value === null || value === "") {
    throw new Error(`"${fieldName}" is required for action "${action}".`);
  }
  return value;
}

// ── Factory ────────────────────────────────────────────────────────────────

export function createKanbanTool(kanbanStore: KanbanStore): Tool<KanbanInput> {
  return {
    name: "kanban",
    description: `Manage the project Kanban board. The board persists across sessions in .custom-agents/kanban.json.

Actions:
- list: Show the board. Optional: column (filter to one column).
- add_card: Create a card. Required: title. Optional: description, column (default "backlog"), priority (default "medium"), labels.
- move_card: Move a card. Required: card_id, column.
- update_card: Update a card. Required: card_id. Optional: title, description, priority, labels.
- archive_card: Remove a card. Required: card_id.
- add_task: Add a sub-task to a card. Required: card_id, title.
- toggle_task: Toggle a task done/not-done. Required: card_id, task_id.
- remove_task: Remove a task. Required: card_id, task_id.

Example calls:
  {"action":"list"}
  {"action":"add_card","title":"Implement auth","priority":"high"}
  {"action":"move_card","card_id":"<id>","column":"in-progress"}
  {"action":"add_task","card_id":"<id>","title":"Write tests"}
  {"action":"toggle_task","card_id":"<id>","task_id":"<id>"}`,
    parameters: KanbanInput,
    isReadOnly: false,

    async call(input: KanbanInput, _context: ToolUseContext): Promise<ToolResult> {
      try {
        switch (input.action) {
          case "list": {
            const board = await kanbanStore.load();
            if (input.column) {
              const filtered = {
                ...board,
                cards: board.cards.filter((c) => c.column === input.column),
              };
              return { content: formatBoard(filtered) };
            }
            return { content: formatBoard(board) };
          }

          case "add_card": {
            const title = requireField(input.title, "title", "add_card");
            const card = await kanbanStore.addCard({
              title,
              description: input.description,
              column: (input.column as KanbanColumn) ?? "backlog",
              priority: input.priority ?? "medium",
              labels: input.labels,
            });
            return {
              content: `Card created.\n${formatCardDetail(card)}`,
            };
          }

          case "move_card": {
            const cardId = requireField(input.card_id, "card_id", "move_card");
            const column = requireField(input.column, "column", "move_card") as KanbanColumn;
            const card = await kanbanStore.moveCard(cardId, column);
            return {
              content: `Card moved to ${column.toUpperCase()}.\n${formatCardDetail(card)}`,
            };
          }

          case "update_card": {
            const cardId = requireField(input.card_id, "card_id", "update_card");
            const updates: Record<string, unknown> = {};
            if (input.title !== undefined) updates.title = input.title;
            if (input.description !== undefined) updates.description = input.description;
            if (input.priority !== undefined) updates.priority = input.priority;
            if (input.labels !== undefined) updates.labels = input.labels;

            const card = await kanbanStore.updateCard(cardId, updates);
            return {
              content: `Card updated.\n${formatCardDetail(card)}`,
            };
          }

          case "archive_card": {
            const cardId = requireField(input.card_id, "card_id", "archive_card");
            const removed = await kanbanStore.archiveCard(cardId);
            return {
              content: removed
                ? `Card ${cardId} archived (removed from board).`
                : `Card not found: ${cardId}`,
              isError: !removed,
            };
          }

          case "add_task": {
            const cardId = requireField(input.card_id, "card_id", "add_task");
            const title = requireField(input.title, "title", "add_task");
            const task = await kanbanStore.addTask(cardId, title);
            return {
              content: `Task added to card ${cardId}.\nTask ID: ${task.id}\nTitle: ${task.title}`,
            };
          }

          case "toggle_task": {
            const cardId = requireField(input.card_id, "card_id", "toggle_task");
            const taskId = requireField(input.task_id, "task_id", "toggle_task");
            const task = await kanbanStore.toggleTask(cardId, taskId);
            return {
              content: `Task ${task.id} is now ${task.done ? "done" : "not done"}.`,
            };
          }

          case "remove_task": {
            const cardId = requireField(input.card_id, "card_id", "remove_task");
            const taskId = requireField(input.task_id, "task_id", "remove_task");
            const removed = await kanbanStore.removeTask(cardId, taskId);
            return {
              content: removed
                ? `Task ${taskId} removed from card ${cardId}.`
                : `Task not found: ${taskId}`,
              isError: !removed,
            };
          }

          default:
            return {
              content: `Unknown action: ${(input as { action: string }).action}`,
              isError: true,
            };
        }
      } catch (err) {
        return {
          content: `Kanban error: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        };
      }
    },
  };
}
