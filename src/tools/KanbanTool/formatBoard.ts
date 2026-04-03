import type { KanbanBoard, KanbanCard } from "../../kanban/KanbanStore.js";
import { KANBAN_COLUMNS, type KanbanColumn } from "../../kanban/KanbanStore.js";

/** Unicode glyphs for column progress indicators. */
const COL_ICON: Record<KanbanColumn, string> = {
  backlog: "\u25FB",       // ◻
  planning: "\u25E8",      // ◨
  "in-progress": "\u25E7", // ◧
  review: "\u25A8",        // ▨
  done: "\u25FC",          // ◼
};

function formatCard(card: KanbanCard): string[] {
  const icon = COL_ICON[card.column];
  const shortId = card.id.slice(0, 8);
  const labelsStr = card.labels?.length ? ` {${card.labels.join(", ")}}` : "";
  const lines: string[] = [];

  lines.push(`  ${icon} [${shortId}] ${card.title}  [${card.priority}]${labelsStr}`);

  if (card.description) {
    lines.push(`    ${card.description}`);
  }

  if (card.tasks.length > 0) {
    const done = card.tasks.filter((t) => t.done).length;
    for (let i = 0; i < card.tasks.length; i++) {
      const t = card.tasks[i];
      const check = t.done ? "\u2611" : "\u2610"; // ☑ / ☐
      const connector = i === card.tasks.length - 1 ? "\u2514" : "\u251C"; // └ / ├
      lines.push(`    ${connector} ${check} ${t.title}`);
    }
    lines.push(`    ${done}/${card.tasks.length} tasks done`);
  }

  return lines;
}

/**
 * Render the full board as readable text.
 * Suitable for both LLM consumption and `/board` output.
 */
export function formatBoard(board: KanbanBoard): string {
  if (board.cards.length === 0) {
    return [
      `\u256D${"─".repeat(40)}\u256E`,
      `\u2502  Kanban Board \u2014 ${board.projectName}${" ".repeat(Math.max(0, 23 - board.projectName.length))}\u2502`,
      `\u2570${"─".repeat(40)}\u256F`,
      "",
      "  No cards yet. Use the kanban tool with action \"add_card\" to create one.",
    ].join("\n");
  }

  const header = `Kanban Board \u2014 ${board.projectName}  (${board.cards.length} card${board.cards.length === 1 ? "" : "s"})`;
  const width = Math.max(header.length + 4, 50);
  const lines: string[] = [];

  lines.push(`\u256D${"─".repeat(width)}\u256E`);
  lines.push(`\u2502  ${header}${" ".repeat(width - header.length - 2)}\u2502`);
  lines.push(`\u2570${"─".repeat(width)}\u256F`);
  lines.push("");

  for (const col of KANBAN_COLUMNS) {
    const cards = board.cards.filter((c) => c.column === col);
    lines.push(`${col.toUpperCase()} (${cards.length})`);

    if (cards.length === 0) {
      lines.push("  (empty)");
    } else {
      for (const card of cards) {
        lines.push(...formatCard(card));
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format a single card in detail.
 */
export function formatCardDetail(card: KanbanCard): string {
  const shortId = card.id.slice(0, 8);
  const labelsStr = card.labels?.length ? `\nLabels: ${card.labels.join(", ")}` : "";
  const lines: string[] = [
    `Card [${shortId}]: ${card.title}`,
    `Column: ${card.column.toUpperCase()} | Priority: ${card.priority}${labelsStr}`,
  ];

  if (card.description) {
    lines.push(`Description: ${card.description}`);
  }

  if (card.tasks.length > 0) {
    const done = card.tasks.filter((t) => t.done).length;
    lines.push(`Tasks (${done}/${card.tasks.length} done):`);
    for (const t of card.tasks) {
      const check = t.done ? "\u2611" : "\u2610";
      lines.push(`  ${check} [${t.id.slice(0, 8)}] ${t.title}`);
    }
  } else {
    lines.push("Tasks: none");
  }

  return lines.join("\n");
}
