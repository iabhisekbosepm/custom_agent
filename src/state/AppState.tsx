import React, { createContext, useContext, useSyncExternalStore } from "react";
import type { AppState, AppStateStore } from "./AppStateStore.js";
import type { Updater } from "./store.js";

const AppStateContext = createContext<AppStateStore | null>(null);

export function AppStateProvider({
  store,
  children,
}: {
  store: AppStateStore;
  children: React.ReactNode;
}) {
  return (
    <AppStateContext.Provider value={store}>
      {children}
    </AppStateContext.Provider>
  );
}

function useStore(): AppStateStore {
  const store = useContext(AppStateContext);
  if (!store) {
    throw new Error("useAppState must be used within AppStateProvider");
  }
  return store;
}

/** Read the current app state reactively. Re-renders on any state change. */
export function useAppState(): AppState {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

/** Get the state updater. Stable reference — safe to use in deps arrays. */
export function useSetAppState(): (updater: Updater<AppState>) => void {
  const store = useStore();
  return store.set;
}
