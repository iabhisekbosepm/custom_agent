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
    return updated;
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
