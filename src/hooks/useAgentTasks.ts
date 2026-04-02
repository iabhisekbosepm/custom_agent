import { useState, useEffect } from "react";
import type { TaskManager } from "../tasks/TaskManager.js";
import type { TaskState } from "../tasks/Task.js";

/**
 * Subscribe to subtasks of an agent's parent task.
 * Returns a reactive list of child tasks that updates on every TaskManager change.
 */
export function useAgentTasks(
  taskManager: TaskManager,
  parentId: string | null
): TaskState[] {
  const [tasks, setTasks] = useState<TaskState[]>([]);

  useEffect(() => {
    if (!parentId) {
      setTasks([]);
      return;
    }

    // Initial population
    setTasks(taskManager.list({ parentId }));

    const unsubscribe = taskManager.subscribe(() => {
      setTasks(taskManager.list({ parentId }));
    });

    return unsubscribe;
  }, [taskManager, parentId]);

  return tasks;
}
