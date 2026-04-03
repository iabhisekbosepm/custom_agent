# Multi-Model Orchestration: Per-Agent Model Profiles

## Context

Currently, all agents (explorer, coder, reviewer, documenter, architect) and custom agents share a single model from the global `AppConfig` loaded from `.env`. There is no way to route different agents to different LLM providers or models. This feature adds per-agent model profiles so that, for example, an explorer can use a fast/cheap model while a coder uses a powerful one.

## Approach

Introduce a `ModelProfileStore` (file-backed, `.custom-agents/models.json`) that holds named model profiles. Each profile specifies `model`, `apiKey`, and `baseUrl`. Agents gain an optional `modelProfile` field referencing a profile name. At agent execution time, the profile is resolved and overrides the global config for that agent's query loop.

## Example `models.json`

```json
{
  "version": 1,
  "profiles": [
    {
      "name": "fast",
      "model": "openai/gpt-4o-mini",
      "apiKey": "sk-or-v1-...",
      "baseUrl": "https://openrouter.ai/api/v1"
    },
    {
      "name": "reasoning",
      "model": "anthropic/claude-opus-4",
      "apiKey": "sk-or-v1-...",
      "baseUrl": "https://openrouter.ai/api/v1"
    }
  ]
}
```

## Implementation Steps

### Step 1: Create `src/models/ModelProfileStore.ts` (NEW)

File-backed store following `CustomAgentStore` / `CustomSkillStore` pattern:
- `ModelProfile` type: `{ name, model, apiKey, baseUrl }` with Zod schema
- `ModelProfileStore` class: `load()`, `save()`, `add()`, `remove()`, `get(name)`
- Persists to `.custom-agents/models.json`

Also create `src/models/index.ts` barrel export.

### Step 2: Create `src/models/resolveModelConfig.ts` (NEW)

Single utility function used by both `runAgent` and `TeamManager`:
```typescript
async function resolveModelConfig(
  config: AppConfig,
  modelProfileName: string | undefined,
  profileStore: ModelProfileStore,
  log: Logger,
): Promise<{ model: string; apiKey: string; baseUrl: string }>
```
- If no profile name: returns global config values (backward compatible)
- If profile not found: logs warning, returns global config (graceful fallback)
- If profile found: returns profile's model/apiKey/baseUrl

### Step 3: Add `modelProfile?` to `AgentDefinition`

**File:** `src/agents/AgentDefinition.ts`
- Add `modelProfile?: string` to `AgentDefinition` interface

**File:** `src/agents/customAgentStore.ts`
- Add `modelProfile?: string` to `PersistedAgentDefinition` interface
- No changes to store methods (optional field serializes naturally)

### Step 4: Integrate into `runAgent.ts`

**File:** `src/agents/runAgent.ts`
- Add `modelProfileStore?: ModelProfileStore` to `RunAgentOptions`
- Before building `agentConfig`, call `resolveModelConfig()`
- Spread resolved `model`, `apiKey`, `baseUrl` into `agentConfig`

### Step 5: Integrate into `TeamManager.ts`

**File:** `src/teams/TeamManager.ts`
- Add `private modelProfileStore?: ModelProfileStore` to constructor
- In `runTeammate()`, call `resolveModelConfig()` before building `agentConfig`
- Same spread pattern as Step 4

### Step 6: Update `AgentCreateTool`

**File:** `src/tools/AgentCreateTool/AgentCreateTool.ts`
- Add `modelProfile: z.string().max(40).optional()` to the Zod schema
- Include in the persisted definition object
- Show in success message if specified

### Step 7: Update `AgentSpawnTool`

**File:** `src/tools/AgentSpawnTool/AgentSpawnTool.ts`
- Add `modelProfileStore?: ModelProfileStore` parameter to `createAgentSpawnTool()`
- Pass it through to `runAgent()` call

### Step 8: Wire in `init.ts`

**File:** `src/entrypoints/init.ts`
- Import and create `ModelProfileStore`
- Pass to `createAgentSpawnTool(..., modelProfileStore)`
- Pass to `new TeamManager(..., modelProfileStore)`
- Add to `InitResult` interface and return object

## Files Changed

| File | Type | Change |
|------|------|--------|
| `src/models/ModelProfileStore.ts` | NEW | Profile type, Zod schema, persistence store |
| `src/models/resolveModelConfig.ts` | NEW | Profile resolution utility |
| `src/models/index.ts` | NEW | Barrel exports |
| `src/agents/AgentDefinition.ts` | MODIFY | Add `modelProfile?: string` |
| `src/agents/customAgentStore.ts` | MODIFY | Add `modelProfile?: string` to `PersistedAgentDefinition` |
| `src/agents/runAgent.ts` | MODIFY | Accept store, resolve profile, spread into config |
| `src/teams/TeamManager.ts` | MODIFY | Accept store in constructor, resolve in `runTeammate` |
| `src/tools/AgentCreateTool/AgentCreateTool.ts` | MODIFY | Add `modelProfile` to Zod schema |
| `src/tools/AgentSpawnTool/AgentSpawnTool.ts` | MODIFY | Pass `ModelProfileStore` through |
| `src/entrypoints/init.ts` | MODIFY | Create store, wire into spawn tool + team manager |

## Backward Compatibility

- All new fields are optional; existing agents/configs work unchanged
- Missing `models.json` returns empty array, all agents use global config
- Unknown profile name logs a warning and falls back to global config
- Existing `agents.json` without `modelProfile` deserializes as `undefined`

## Verification

1. `bun x tsc --noEmit` — no type errors
2. Create `.custom-agents/models.json` with a test profile
3. Create a custom agent via `/agent` with `modelProfile: "fast"`
4. Spawn the agent and verify logs show the correct model being used
5. Spawn a built-in agent (no profile) and verify it still uses the global config
