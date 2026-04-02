import type { TaskState } from "../../tasks/Task.js";

/** Truncate text to a maximum character length, appending an ellipsis indicator. */
export function truncateOutput(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n\n... (truncated, ${text.length} total chars)`;
}

/** Format a TaskState into a human-readable summary string. */
export function formatTaskState(task: TaskState): string {
  const lines = [
    `ID:          ${task.id}`,
    `Status:      ${task.status}`,
    `Description: ${task.description}`,
    `Created:     ${new Date(task.createdAt).toISOString()}`,
    `Updated:     ${new Date(task.updatedAt).toISOString()}`,
  ];
  if (task.parentId) lines.push(`Parent:      ${task.parentId}`);
  if (task.output) lines.push(`Output:      ${task.output}`);
  if (task.error) lines.push(`Error:       ${task.error}`);
  if (Object.keys(task.metadata).length > 0) {
    lines.push(`Metadata:    ${JSON.stringify(task.metadata)}`);
  }
  return lines.join("\n");
}

/** Strip HTML tags from a string, returning plain text. */
export function stripHtmlTags(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
