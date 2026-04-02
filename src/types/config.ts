import { z } from "zod";

/** Zod schema for environment variables. Bun auto-loads .env files. */
export const EnvConfigSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  OPENAI_BASE_URL: z
    .string()
    .url()
    .default("https://openrouter.ai/api/v1"),
  MODEL: z.string().default("openai/gpt-4o"),
  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),
  MAX_TURNS: z.coerce.number().int().positive().default(20),
  CONTEXT_BUDGET: z.coerce.number().int().positive().default(120_000),
});

export type EnvConfig = z.infer<typeof EnvConfigSchema>;

/**
 * Runtime application config built from EnvConfig + any overrides.
 * This is the single config object passed around — never read env vars directly
 * outside of the init layer.
 */
export interface AppConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  logLevel: "debug" | "info" | "warn" | "error";
  maxTurns: number;
  systemPrompt: string;
  /** Max estimated tokens for the context window. Compaction triggers at ~80%. */
  contextBudget: number;
}
