import type { Logger } from "../utils/logger.js";
import {
  createTask,
  transitionTask,
  type CreateTaskOptions,
  type TaskState,
  type TaskStatus,
} from "./Task.js";

type TaskListener = (task: TaskState) => void;

/**
 * Manages the lifecycle of background tasks.
 * Holds tasks in memory and notifies listeners on status changes.
 */
export class TaskManager {
  private tasks = new Map<string, TaskState>();
  private listeners = new Set<TaskListener>();
  private log: Logger;

  constructor(log: Logger) {
    this.log = log.child("tasks");
  }

  create(opts: CreateTaskOptions): TaskState {
    const task = createTask(opts);
    this.tasks.set(task.id, task);
    this.notify(task);
    this.log.debug(`Task created: ${task.id}`, {
      description: task.description,
    });
    return task;
  }

  get(id: string): TaskState | undefined {
    return this.tasks.get(id);
  }

  list(filter?: { status?: TaskStatus; parentId?: string }): TaskState[] {
    let results = Array.from(this.tasks.values());
    if (filter?.status) {
      results = results.filter((t) => t.status === filter.status);
    }
    if (filter?.parentId) {
      results = results.filter((t) => t.parentId === filter.parentId);
    }
    return results;
  }

  transition(
    id: string,
    to: TaskStatus,
    payload?: { output?: string; error?: string }
  ): TaskState {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`Task not found: ${id}`);

    const updated = transitionTask(task, to, payload);
    this.tasks.set(id, updated);
    this.notify(updated);
    this.log.debug(`Task ${id} transitioned to ${to}`);

    // When a task completes, remove it from all blockedBy arrays
    if (to === "completed") {
      for (const [, other] of this.tasks) {
        if (other.blockedBy.includes(id)) {
          const unblocked: TaskState = {
            ...other,
            blockedBy: other.blockedBy.filter((bid) => bid !== id),
            updatedAt: Date.now(),
          };
          this.tasks.set(unblocked.id, unblocked);
          this.notify(unblocked);
        }
      }
    }

    return updated;
  }

  /** Link two tasks: blockerTaskId must complete before taskId can start. */
  addDependency(taskId: string, blockerTaskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    const blocker = this.tasks.get(blockerTaskId);
    if (!blocker) throw new Error(`Blocker task not found: ${blockerTaskId}`);

    if (!task.blockedBy.includes(blockerTaskId)) {
      const updatedTask: TaskState = {
        ...task,
        blockedBy: [...task.blockedBy, blockerTaskId],
        updatedAt: Date.now(),
      };
      this.tasks.set(taskId, updatedTask);
      this.notify(updatedTask);
    }
    if (!blocker.blocks.includes(taskId)) {
      const updatedBlocker: TaskState = {
        ...blocker,
        blocks: [...blocker.blocks, taskId],
        updatedAt: Date.now(),
      };
      this.tasks.set(blockerTaskId, updatedBlocker);
    }
  }

  /** True if all blockers are completed (or there are none). */
  isReady(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    return task.blockedBy.length === 0;
  }

  /** Atomically claim a task for an agent. Returns the task if successful, null if already claimed or blocked. */
  claim(taskId: string, agentId: string): TaskState | null {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (task.claimedBy !== null) return null;
    if (task.status !== "pending") return null;
    if (!this.isReady(taskId)) return null;

    const claimed: TaskState = {
      ...task,
      claimedBy: agentId,
      claimedAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.tasks.set(taskId, claimed);
    this.notify(claimed);
    this.log.debug(`Task ${taskId} claimed by ${agentId}`);
    return claimed;
  }

  /** List tasks that are pending, unclaimed, and have no unresolved blockers. */
  listClaimable(): TaskState[] {
    return Array.from(this.tasks.values()).filter(
      (t) => t.status === "pending" && t.claimedBy === null && t.blockedBy.length === 0
    );
  }

  /** Subscribe to task changes. Returns unsubscribe function. */
  subscribe(listener: TaskListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(task: TaskState): void {
    for (const listener of this.listeners) {
      listener(task);
    }
  }
}
