import { generateId } from "../utils/id.js";

/** Task lifecycle status. */
export type TaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

/** Base shape for all task state. */
export interface TaskState {
  id: string;
  status: TaskStatus;
  description: string;
  createdAt: number;
  updatedAt: number;
  /** ID of the parent task or session that owns this task. */
  parentId?: string;
  /** Final output text once completed. */
  output?: string;
  /** Error message if failed. */
  error?: string;
  /** Arbitrary metadata attached to the task. */
  metadata: Record<string, unknown>;
}

/** Options for creating a new task. */
export interface CreateTaskOptions {
  description: string;
  parentId?: string;
  metadata?: Record<string, unknown>;
}

/** Create a new task in pending state. */
export function createTask(opts: CreateTaskOptions): TaskState {
  const now = Date.now();
  return {
    id: generateId(),
    status: "pending",
    description: opts.description,
    createdAt: now,
    updatedAt: now,
    parentId: opts.parentId,
    metadata: opts.metadata ?? {},
  };
}

/** Transition a task to a new status with validation. */
export function transitionTask(
  task: TaskState,
  to: TaskStatus,
  payload?: { output?: string; error?: string }
): TaskState {
  const allowed = VALID_TRANSITIONS[task.status];
  if (!allowed?.includes(to)) {
    throw new Error(
      `Invalid task transition: ${task.status} -> ${to}`
    );
  }

  return {
    ...task,
    status: to,
    updatedAt: Date.now(),
    ...(payload?.output !== undefined && { output: payload.output }),
    ...(payload?.error !== undefined && { error: payload.error }),
  };
}

const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ["running", "cancelled"],
  running: ["completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};
