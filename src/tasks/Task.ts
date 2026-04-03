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
  /** IDs of tasks that must complete before this task can start. */
  blockedBy: string[];
  /** IDs of tasks that this task blocks. */
  blocks: string[];
  /** ID of the agent that claimed this task, if any. */
  claimedBy: string | null;
  /** Timestamp when the task was claimed. */
  claimedAt: number | null;
}

/** Options for creating a new task. */
export interface CreateTaskOptions {
  description: string;
  parentId?: string;
  metadata?: Record<string, unknown>;
  blockedBy?: string[];
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
    blockedBy: opts.blockedBy ?? [],
    blocks: [],
    claimedBy: null,
    claimedAt: null,
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
