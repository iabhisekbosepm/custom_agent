import { EnvConfigSchema, type EnvConfig } from "../types/config.js";

/**
 * Load and validate environment variables.
 * Reads from process.env (Bun auto-loads .env files).
 * Fails fast with a clear message if required vars are missing.
 */
export function loadEnvConfig(): EnvConfig {
  const result = EnvConfigSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    console.error(`Environment validation failed:\n${issues}`);
    console.error(`\nSee .env.example for required variables.`);
    process.exit(1);
  }

  return result.data;
}
