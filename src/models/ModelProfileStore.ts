import { join } from "path";
import { readFile, writeFile, mkdir } from "fs/promises";
import { z } from "zod";

/** Zod schema for a single model profile. */
export const ModelProfileSchema = z.object({
  name: z
    .string()
    .regex(/^[a-z][a-z0-9_-]*$/, "Must be lowercase alphanumeric with hyphens/underscores")
    .min(1)
    .max(40),
  model: z.string().min(1),
  apiKey: z.string().min(1),
  baseUrl: z.string().url(),
});

export type ModelProfile = z.infer<typeof ModelProfileSchema>;

interface StoreFile {
  version: 1;
  profiles: ModelProfile[];
}

/**
 * Reads/writes model profiles to `.custom-agents/models.json`.
 * Follows the same pattern as CustomAgentStore / CustomSkillStore.
 */
export class ModelProfileStore {
  private filePath: string;

  constructor(dataDir: string) {
    this.filePath = join(dataDir, "models.json");
  }

  async load(): Promise<ModelProfile[]> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      const data: StoreFile = JSON.parse(raw);
      if (!data || !Array.isArray(data.profiles)) return [];
      return data.profiles;
    } catch {
      return [];
    }
  }

  async save(profiles: ModelProfile[]): Promise<void> {
    const dir = join(this.filePath, "..");
    await mkdir(dir, { recursive: true });
    const data: StoreFile = { version: 1, profiles };
    await writeFile(this.filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
  }

  /** Upsert: overwrites if same name exists, appends otherwise. */
  async add(profile: ModelProfile): Promise<void> {
    const profiles = await this.load();
    const idx = profiles.findIndex((p) => p.name === profile.name);
    if (idx >= 0) {
      profiles[idx] = profile;
    } else {
      profiles.push(profile);
    }
    await this.save(profiles);
  }

  async remove(name: string): Promise<boolean> {
    const profiles = await this.load();
    const filtered = profiles.filter((p) => p.name !== name);
    if (filtered.length === profiles.length) return false;
    await this.save(filtered);
    return true;
  }

  /** Get a single profile by name. Returns undefined if not found. */
  async get(name: string): Promise<ModelProfile | undefined> {
    const profiles = await this.load();
    return profiles.find((p) => p.name === name);
  }
}
