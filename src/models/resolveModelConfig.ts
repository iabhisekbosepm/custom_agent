import type { AppConfig } from "../types/config.js";
import type { ModelProfileStore } from "./ModelProfileStore.js";
import type { Logger } from "../utils/logger.js";

/**
 * Resolve model/apiKey/baseUrl for an agent run.
 *
 * - If no profile name: returns global config values (backward compatible).
 * - If profile not found: logs warning, returns global config (graceful fallback).
 * - If profile found: returns profile's model/apiKey/baseUrl.
 */
export async function resolveModelConfig(
  config: AppConfig,
  modelProfileName: string | undefined,
  profileStore: ModelProfileStore,
  log: Logger,
): Promise<{ model: string; apiKey: string; baseUrl: string }> {
  const defaults = { model: config.model, apiKey: config.apiKey, baseUrl: config.baseUrl };

  if (!modelProfileName) {
    return defaults;
  }

  const profile = await profileStore.get(modelProfileName);
  if (!profile) {
    log.warn(`Model profile "${modelProfileName}" not found, using global config`);
    return defaults;
  }

  log.info(`Using model profile "${modelProfileName}": ${profile.model}`);
  return { model: profile.model, apiKey: profile.apiKey, baseUrl: profile.baseUrl };
}
