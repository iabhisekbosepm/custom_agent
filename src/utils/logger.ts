export type LogLevel = "debug" | "info" | "warn" | "error";

let muted = false;

export function setLoggerMuted(flag: boolean): void {
  muted = flag;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  child(scope: string): Logger;
}

export function createLogger(
  minLevel: LogLevel = "info",
  scope?: string
): Logger {
  const threshold = LEVEL_ORDER[minLevel];

  function log(
    level: LogLevel,
    msg: string,
    data?: Record<string, unknown>
  ): void {
    if (muted || LEVEL_ORDER[level] < threshold) return;

    const timestamp = new Date().toISOString();
    const prefix = scope ? `[${scope}]` : "";
    const entry = data
      ? `${timestamp} ${level.toUpperCase()} ${prefix} ${msg} ${JSON.stringify(data)}`
      : `${timestamp} ${level.toUpperCase()} ${prefix} ${msg}`;

    // Write to stderr so it doesn't interfere with Ink's stdout rendering
    process.stderr.write(entry + "\n");
  }

  return {
    debug: (msg, data) => log("debug", msg, data),
    info: (msg, data) => log("info", msg, data),
    warn: (msg, data) => log("warn", msg, data),
    error: (msg, data) => log("error", msg, data),
    child(childScope: string): Logger {
      const newScope = scope ? `${scope}:${childScope}` : childScope;
      return createLogger(minLevel, newScope);
    },
  };
}
