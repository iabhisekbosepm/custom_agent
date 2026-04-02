import { z } from "zod";
import type { Tool, ToolResult, ToolUseContext } from "../Tool.js";

const NotebookEditInput = z.object({
  notebook_path: z
    .string()
    .describe("Absolute path to the .ipynb notebook file"),
  cell_index: z
    .number()
    .int()
    .nonnegative()
    .describe("0-based index of the cell to modify"),
  new_source: z
    .string()
    .describe("New source content for the cell"),
  cell_type: z
    .enum(["code", "markdown"])
    .optional()
    .describe("Cell type (required for insert mode)"),
  edit_mode: z
    .enum(["replace", "insert", "delete"])
    .optional()
    .describe("Edit mode: replace (default), insert a new cell, or delete a cell"),
});

type NotebookEditInput = z.infer<typeof NotebookEditInput>;

export const NotebookEditTool: Tool<NotebookEditInput> = {
  name: "notebook_edit",
  description:
    "Edit a Jupyter notebook (.ipynb) cell. Supports replacing, inserting, or deleting cells. Validates notebook JSON structure.",
  parameters: NotebookEditInput,
  isReadOnly: false,

  async call(input: NotebookEditInput, _context: ToolUseContext): Promise<ToolResult> {
    try {
      const file = Bun.file(input.notebook_path);
      if (!(await file.exists())) {
        return {
          content: `Notebook not found: ${input.notebook_path}`,
          isError: true,
        };
      }

      const raw = await file.text();
      let notebook: NotebookJSON;
      try {
        notebook = JSON.parse(raw);
      } catch {
        return {
          content: "Failed to parse notebook JSON. File may be corrupted.",
          isError: true,
        };
      }

      if (!notebook.cells || !Array.isArray(notebook.cells)) {
        return {
          content: "Invalid notebook structure: missing 'cells' array.",
          isError: true,
        };
      }

      const mode = input.edit_mode ?? "replace";

      if (mode === "replace") {
        if (input.cell_index >= notebook.cells.length) {
          return {
            content: `Cell index ${input.cell_index} out of range (notebook has ${notebook.cells.length} cells).`,
            isError: true,
          };
        }
        notebook.cells[input.cell_index].source = input.new_source
          .split("\n")
          .map((line, i, arr) => (i < arr.length - 1 ? line + "\n" : line));
        if (input.cell_type) {
          notebook.cells[input.cell_index].cell_type = input.cell_type;
        }
      } else if (mode === "insert") {
        const cellType = input.cell_type ?? "code";
        const newCell: NotebookCell = {
          cell_type: cellType,
          source: input.new_source
            .split("\n")
            .map((line, i, arr) => (i < arr.length - 1 ? line + "\n" : line)),
          metadata: {},
          ...(cellType === "code"
            ? { outputs: [], execution_count: null }
            : {}),
        };
        notebook.cells.splice(input.cell_index, 0, newCell);
      } else if (mode === "delete") {
        if (input.cell_index >= notebook.cells.length) {
          return {
            content: `Cell index ${input.cell_index} out of range (notebook has ${notebook.cells.length} cells).`,
            isError: true,
          };
        }
        notebook.cells.splice(input.cell_index, 1);
      }

      await Bun.write(input.notebook_path, JSON.stringify(notebook, null, 1));

      return {
        content: `Notebook ${mode}d cell at index ${input.cell_index}. Total cells: ${notebook.cells.length}.`,
      };
    } catch (err) {
      return {
        content: `Notebook edit failed: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  },
};

interface NotebookCell {
  cell_type: string;
  source: string[];
  metadata: Record<string, unknown>;
  outputs?: unknown[];
  execution_count?: number | null;
}

interface NotebookJSON {
  cells: NotebookCell[];
  metadata?: Record<string, unknown>;
  nbformat?: number;
  nbformat_minor?: number;
}
