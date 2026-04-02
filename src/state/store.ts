export type Listener = () => void;
export type Updater<T> = (prev: T) => T;

export interface Store<T> {
  get(): T;
  set(updater: Updater<T>): void;
  subscribe(listener: Listener): () => void;
}

/**
 * Minimal reactive store. Works with React's useSyncExternalStore
 * and is also usable outside React (query loop, tests).
 */
export function createStore<T>(initialState: T): Store<T> {
  let state = initialState;
  const listeners = new Set<Listener>();

  return {
    get() {
      return state;
    },

    set(updater: Updater<T>) {
      const next = updater(state);
      if (next === state) return; // No change, skip notification
      state = next;
      for (const listener of listeners) {
        listener();
      }
    },

    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
