import type { Logger } from "../utils/logger.js";

/**
 * A service is a long-lived background capability (e.g., MCP server connection,
 * file watcher, LSP client). Services have a start/stop lifecycle.
 */
export interface ServiceDefinition {
  name: string;
  description: string;
  /** Start the service. Return a handle for stopping it. */
  start(log: Logger): Promise<ServiceHandle>;
}

export interface ServiceHandle {
  /** Stop the service and release resources. */
  stop(): Promise<void>;
}

/**
 * Manages external service lifecycles.
 */
export class ServiceManager {
  private running = new Map<string, ServiceHandle>();
  private definitions = new Map<string, ServiceDefinition>();
  private log: Logger;

  constructor(log: Logger) {
    this.log = log.child("services");
  }

  register(service: ServiceDefinition): void {
    if (this.definitions.has(service.name)) {
      throw new Error(`Service "${service.name}" is already registered`);
    }
    this.definitions.set(service.name, service);
  }

  async start(name: string): Promise<void> {
    if (this.running.has(name)) {
      this.log.warn(`Service "${name}" is already running`);
      return;
    }

    const definition = this.definitions.get(name);
    if (!definition) {
      throw new Error(`Service "${name}" is not registered`);
    }

    const handle = await definition.start(this.log.child(name));
    this.running.set(name, handle);
    this.log.info(`Service started: ${name}`);
  }

  async stop(name: string): Promise<void> {
    const handle = this.running.get(name);
    if (!handle) return;

    await handle.stop();
    this.running.delete(name);
    this.log.info(`Service stopped: ${name}`);
  }

  async stopAll(): Promise<void> {
    const names = Array.from(this.running.keys());
    for (const name of names) {
      try {
        await this.stop(name);
      } catch {
        // Best effort
      }
    }
  }

  isRunning(name: string): boolean {
    return this.running.has(name);
  }

  listRegistered(): string[] {
    return Array.from(this.definitions.keys());
  }

  listRunning(): string[] {
    return Array.from(this.running.keys());
  }
}
