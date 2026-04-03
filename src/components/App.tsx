import React, { createContext, useContext } from "react";
import { AppStateProvider } from "../state/AppState.js";
import type { AppStateStore } from "../state/AppStateStore.js";
import type { AppConfig } from "../types/config.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { Logger } from "../utils/logger.js";
import type { MemoryStore } from "../memory/index.js";
import type { SessionPersistence } from "../persistence/SessionPersistence.js";
import type { HookManager } from "../hooks/index.js";
import type { TaskManager } from "../tasks/TaskManager.js";
import type { AgentRouter } from "../agents/AgentRouter.js";
import type { SkillRegistry } from "../skills/index.js";
import type { TeamManager } from "../teams/TeamManager.js";
import type { KanbanStore } from "../kanban/KanbanStore.js";
import { REPL } from "../screens/REPL.js";

/** Runtime dependencies available throughout the React tree. */
export interface RuntimeContextValue {
  config: AppConfig;
  registry: ToolRegistry;
  hooks: HookManager;
  log: Logger;
  abortController: AbortController;
  memory: MemoryStore;
  sessionPersistence: SessionPersistence;
  sessionId: string;
  taskManager: TaskManager;
  agentRouter: AgentRouter;
  skillRegistry: SkillRegistry;
  teamManager: TeamManager;
  kanbanStore: KanbanStore;
}

const RuntimeContext = createContext<RuntimeContextValue | null>(null);

export function useRuntime(): RuntimeContextValue {
  const ctx = useContext(RuntimeContext);
  if (!ctx) {
    throw new Error("useRuntime must be used within App");
  }
  return ctx;
}

interface AppProps {
  store: AppStateStore;
  config: AppConfig;
  registry: ToolRegistry;
  hooks: HookManager;
  log: Logger;
  abortController: AbortController;
  memory: MemoryStore;
  sessionPersistence: SessionPersistence;
  sessionId: string;
  taskManager: TaskManager;
  agentRouter: AgentRouter;
  skillRegistry: SkillRegistry;
  teamManager: TeamManager;
  kanbanStore: KanbanStore;
}

export function App({
  store,
  config,
  registry,
  hooks,
  log,
  abortController,
  memory,
  sessionPersistence,
  sessionId,
  taskManager,
  agentRouter,
  skillRegistry,
  teamManager,
  kanbanStore,
}: AppProps) {
  return (
    <RuntimeContext.Provider
      value={{
        config,
        registry,
        hooks,
        log,
        abortController,
        memory,
        sessionPersistence,
        sessionId,
        taskManager,
        agentRouter,
        skillRegistry,
        teamManager,
        kanbanStore,
      }}
    >
      <AppStateProvider store={store}>
        <REPL store={store} />
      </AppStateProvider>
    </RuntimeContext.Provider>
  );
}
