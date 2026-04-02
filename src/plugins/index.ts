import type { Tool } from "../tools/Tool.js";
import type { Logger } from "../utils/logger.js";

/** A plugin can contribute tools, hooks, and skills to the runtime. */
export interface PluginDefinition {
  /** Unique plugin name. */
  name: string;
  /** Semver version string. */
  version: string;
  /** Short description. */
  description: string;
  /** Tools contributed by this plugin. */
  tools?: Tool[];
  /** Lifecycle hooks contributed by this plugin. */
  hooks?: Record<string, (...args: unknown[]) => void | Promise<void>>;
  /** Called once when the plugin is loaded. Return a cleanup function. */
  activate?(log: Logger): Promise<(() => void) | void>;
}

/**
 * Plugin loader. Discovers, validates, and activates plugins.
 */
export class PluginManager {
  private plugins = new Map<string, PluginDefinition>();
  private cleanups: Array<() => void> = [];
  private log: Logger;

  constructor(log: Logger) {
    this.log = log.child("plugins");
  }

  register(plugin: PluginDefinition): void {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" is already registered`);
    }
    this.plugins.set(plugin.name, plugin);
    this.log.debug(`Plugin registered: ${plugin.name}@${plugin.version}`);
  }

  async activateAll(): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.activate) {
        const cleanup = await plugin.activate(this.log.child(plugin.name));
        if (cleanup) this.cleanups.push(cleanup);
        this.log.info(`Plugin activated: ${plugin.name}`);
      }
    }
  }

  get(name: string): PluginDefinition | undefined {
    return this.plugins.get(name);
  }

  list(): PluginDefinition[] {
    return Array.from(this.plugins.values());
  }

  /** Deactivate all plugins (run cleanup functions in reverse order). */
  async deactivateAll(): Promise<void> {
    for (let i = this.cleanups.length - 1; i >= 0; i--) {
      try {
        this.cleanups[i]();
      } catch {
        // Best effort
      }
    }
    this.cleanups = [];
  }
}
