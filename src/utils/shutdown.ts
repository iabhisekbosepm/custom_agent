type CleanupFn = () => void | Promise<void>;

const cleanupHandlers: CleanupFn[] = [];
let shutdownInProgress = false;

/** Register a function to run during graceful shutdown. */
export function onShutdown(fn: CleanupFn): void {
  cleanupHandlers.push(fn);
}

/** Run all registered cleanup handlers in reverse order, then exit. */
async function runShutdown(signal: string): Promise<void> {
  if (shutdownInProgress) return;
  shutdownInProgress = true;

  process.stderr.write(`\nReceived ${signal}, shutting down...\n`);

  // Run handlers in reverse registration order (LIFO)
  for (let i = cleanupHandlers.length - 1; i >= 0; i--) {
    try {
      await cleanupHandlers[i]();
    } catch {
      // Best effort — don't block shutdown on a failing handler
    }
  }

  process.exit(0);
}

/** Install SIGINT and SIGTERM handlers. Call once at startup. */
export function installShutdownHandlers(): void {
  process.on("SIGINT", () => runShutdown("SIGINT"));
  process.on("SIGTERM", () => runShutdown("SIGTERM"));
}
