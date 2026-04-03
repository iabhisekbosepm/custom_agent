import type { AppConfig } from "../types/config.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { HookManager } from "../hooks/index.js";
import type { Logger } from "../utils/logger.js";
import type { TaskManager } from "../tasks/TaskManager.js";
import type { AgentRouter } from "../agents/AgentRouter.js";
import type { ActiveToolCall } from "../state/AppStateStore.js";
import type { Message, SystemMessage, UserMessage } from "../types/messages.js";
import type {
  CreateTeamOptions,
  TeamState,
  TeammateDefinition,
  TeammateState,
  TeamListener,
} from "./TeamTypes.js";
import { Mailbox } from "./Mailbox.js";
import { generateId } from "../utils/id.js";
import { buildTeammateRegistry } from "./buildTeammateRegistry.js";
import { buildTeammatePromptAddendum } from "./teammatePrompt.js";
import { runQueryLoop } from "../query/query.js";
import { createStore } from "../state/store.js";
import { createDefaultAppState, type AppState } from "../state/AppStateStore.js";
import type { ModelProfileStore } from "../models/ModelProfileStore.js";
import { resolveModelConfig } from "../models/resolveModelConfig.js";

/**
 * Manages the lifecycle of agent teams: creation, parallel execution, and shutdown.
 */
export class TeamManager {
  private teams = new Map<string, TeamState>();
  private listeners = new Set<TeamListener>();
  private log: Logger;

  constructor(
    private agentRouter: AgentRouter,
    private taskManager: TaskManager,
    private hooks: HookManager,
    private baseRegistry: ToolRegistry,
    log: Logger,
    private modelProfileStore?: ModelProfileStore,
  ) {
    this.log = log.child("teams");
  }

  /** Create a team. Does NOT start it yet. */
  create(opts: CreateTeamOptions): TeamState {
    const teamId = generateId();

    // Resolve agent definitions for each teammate
    const teammateDefs: TeammateDefinition[] = opts.teammates.map((t) => {
      const agentDef = this.agentRouter.get(t.agent);
      if (!agentDef) {
        throw new Error(
          `Unknown agent "${t.agent}". Available: ${this.agentRouter
            .list()
            .map((a) => a.name)
            .join(", ")}`
        );
      }
      return {
        agentDef,
        initialTask: t.task,
        teammateId: `${t.agent}-${generateId().slice(0, 8)}`,
      };
    });

    // Create root task for the team
    const rootTask = this.taskManager.create({
      description: `Team: ${opts.name}`,
      metadata: { teamId, teamName: opts.name },
    });
    this.taskManager.transition(rootTask.id, "running");

    // Create child tasks per teammate
    for (const td of teammateDefs) {
      this.taskManager.create({
        description: td.initialTask,
        parentId: rootTask.id,
        metadata: { teamId, teammateId: td.teammateId, agentName: td.agentDef.name },
      });
    }

    const mailbox = new Mailbox(teamId);

    const teammateStates: TeammateState[] = teammateDefs.map((td) => ({
      teammateId: td.teammateId,
      agentDefinitionName: td.agentDef.name,
      status: "pending",
      output: null,
      activeToolCalls: [],
      currentStreamText: "",
    }));

    const teamState: TeamState = {
      id: teamId,
      name: opts.name,
      status: "forming",
      leadAgentId: opts.leadAgentId,
      teammates: teammateStates,
      mailbox,
      rootTaskId: rootTask.id,
      createdAt: Date.now(),
      completedAt: null,
    };

    this.teams.set(teamId, teamState);
    this.notify(teamState);
    this.log.info(`Team created: ${teamId} (${opts.name})`, {
      teammates: teammateDefs.map((t) => t.teammateId),
    });

    return teamState;
  }

  /**
   * Run a team: launch all teammates concurrently via Promise.allSettled.
   * Blocks until all teammates finish. Returns updated team state.
   */
  async run(
    teamId: string,
    config: AppConfig,
    teamToolRegistry: ToolRegistry
  ): Promise<TeamState> {
    const team = this.teams.get(teamId);
    if (!team) throw new Error(`Team not found: ${teamId}`);

    // Resolve teammate definitions again for prompt building
    const teammateDefs: TeammateDefinition[] = team.teammates.map((ts) => {
      const agentDef = this.agentRouter.get(ts.agentDefinitionName)!;
      return {
        agentDef,
        initialTask: this.getTeammateTask(team, ts.teammateId),
        teammateId: ts.teammateId,
      };
    });

    this.updateTeamStatus(teamId, "running");

    await this.hooks.emit("team:start", {
      teamId,
      name: team.name,
    });

    // Launch all teammates concurrently
    const results = await Promise.allSettled(
      teammateDefs.map((td) =>
        this.runTeammate(teamId, td, teammateDefs, config, teamToolRegistry)
      )
    );

    // Process results
    let allSucceeded = true;
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const td = teammateDefs[i];
      if (result.status === "fulfilled") {
        this.updateTeammateState(teamId, td.teammateId, {
          status: "completed",
          output: result.value,
          activeToolCalls: [],
          currentStreamText: "",
        });
        await this.hooks.emit("team:teammate:end", {
          teamId,
          teammateId: td.teammateId,
          agentName: td.agentDef.name,
          status: "completed",
          output: result.value,
        });
      } else {
        allSucceeded = false;
        const error = result.reason instanceof Error
          ? result.reason.message
          : String(result.reason);
        this.updateTeammateState(teamId, td.teammateId, {
          status: "failed",
          output: `Error: ${error}`,
          activeToolCalls: [],
          currentStreamText: "",
        });
        await this.hooks.emit("team:teammate:end", {
          teamId,
          teammateId: td.teammateId,
          agentName: td.agentDef.name,
          status: "failed",
          output: `Error: ${error}`,
        });
      }
    }

    const finalStatus = allSucceeded ? "completed" : "failed";
    this.updateTeamStatus(teamId, finalStatus);

    const updatedTeam = this.teams.get(teamId)!;
    const duration = Date.now() - updatedTeam.createdAt;

    // Complete root task
    const outputs = updatedTeam.teammates
      .map((t) => `[${t.teammateId} (${t.agentDefinitionName})]: ${t.output ?? "(no output)"}`)
      .join("\n\n");
    this.taskManager.transition(updatedTeam.rootTaskId, allSucceeded ? "completed" : "failed", {
      output: outputs,
      ...(allSucceeded ? {} : { error: "One or more teammates failed" }),
    });

    await this.hooks.emit("team:complete", {
      teamId,
      name: updatedTeam.name,
      status: finalStatus,
      duration,
    });

    return updatedTeam;
  }

  /** Run a single teammate's query loop. */
  private async runTeammate(
    teamId: string,
    td: TeammateDefinition,
    allTeammates: TeammateDefinition[],
    config: AppConfig,
    teamToolRegistry: ToolRegistry
  ): Promise<string> {
    const team = this.teams.get(teamId)!;

    this.updateTeammateState(teamId, td.teammateId, { status: "running" });

    await this.hooks.emit("team:teammate:start", {
      teamId,
      teammateId: td.teammateId,
      agentName: td.agentDef.name,
    });

    // Build scoped registry: agent's allowed tools + team tools
    const teamToolNames = ["team_message", "team_check_messages", "team_task_claim"];
    const scopedRegistry = buildTeammateRegistry(
      td.agentDef,
      teamToolRegistry,
      teamToolNames
    );

    // Build system prompt with team context
    const promptAddendum = buildTeammatePromptAddendum({
      teamName: team.name,
      teamId,
      teammateId: td.teammateId,
      allTeammates,
      rootTaskId: team.rootTaskId,
    });

    // Resolve per-agent model profile (falls back to global config if none)
    const modelOverrides = this.modelProfileStore
      ? await resolveModelConfig(config, td.agentDef.modelProfile, this.modelProfileStore, this.log)
      : { model: config.model, apiKey: config.apiKey, baseUrl: config.baseUrl };

    const agentConfig: AppConfig = {
      ...config,
      maxTurns: td.agentDef.maxTurns,
      systemPrompt: td.agentDef.systemPrompt + promptAddendum,
      model: modelOverrides.model,
      apiKey: modelOverrides.apiKey,
      baseUrl: modelOverrides.baseUrl,
    };

    // Build messages
    const systemMsg: SystemMessage = { role: "system", content: agentConfig.systemPrompt };
    const userMsg: UserMessage = { role: "user", content: td.initialTask };
    const messages: Message[] = [systemMsg, userMsg];

    // Create isolated store for this teammate
    const teammateStore = createStore<AppState>(createDefaultAppState(agentConfig.model));

    // Forward teammate tool activity to team state
    let prevToolCalls: ActiveToolCall[] = [];
    const unsub = teammateStore.subscribe(() => {
      const s = teammateStore.get();
      if (s.activeToolCalls !== prevToolCalls) {
        prevToolCalls = s.activeToolCalls;
        this.updateTeammateState(teamId, td.teammateId, {
          activeToolCalls: s.activeToolCalls,
        });
      }
      if (s.currentStreamText) {
        this.updateTeammateState(teamId, td.teammateId, {
          currentStreamText: s.currentStreamText,
        });
      }
    });

    try {
      const result = await runQueryLoop(messages, {
        config: agentConfig,
        registry: scopedRegistry,
        hooks: this.hooks,
        getAppState: teammateStore.get,
        setAppState: teammateStore.set,
        abortSignal: new AbortController().signal,
        log: this.log.child(`teammate:${td.teammateId}`),
      });

      // Extract final assistant text
      const lastAssistant = result.messages
        .filter((m) => m.role === "assistant")
        .pop();
      const output =
        (lastAssistant && "content" in lastAssistant
          ? (lastAssistant as { content?: string }).content
          : null) ?? "(no output)";

      return output;
    } finally {
      unsub();
    }
  }

  get(teamId: string): TeamState | undefined {
    return this.teams.get(teamId);
  }

  list(): TeamState[] {
    return Array.from(this.teams.values());
  }

  shutdown(teamId: string): void {
    const team = this.teams.get(teamId);
    if (!team) return;
    this.updateTeamStatus(teamId, "shutdown");
    team.mailbox.clear();
    this.log.info(`Team shutdown: ${teamId}`);
  }

  subscribe(listener: TeamListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private updateTeamStatus(teamId: string, status: TeamState["status"]): void {
    const team = this.teams.get(teamId);
    if (!team) return;
    const updated: TeamState = {
      ...team,
      status,
      completedAt: status === "completed" || status === "failed" || status === "shutdown"
        ? Date.now()
        : team.completedAt,
    };
    this.teams.set(teamId, updated);
    this.notify(updated);
  }

  private updateTeammateState(
    teamId: string,
    teammateId: string,
    patch: Partial<TeammateState>
  ): void {
    const team = this.teams.get(teamId);
    if (!team) return;
    const updated: TeamState = {
      ...team,
      teammates: team.teammates.map((t) =>
        t.teammateId === teammateId ? { ...t, ...patch } : t
      ),
    };
    this.teams.set(teamId, updated);
    this.notify(updated);
  }

  private getTeammateTask(team: TeamState, teammateId: string): string {
    const tasks = this.taskManager.list({ parentId: team.rootTaskId });
    const task = tasks.find((t) => t.metadata.teammateId === teammateId);
    return task?.description ?? "";
  }

  private notify(team: TeamState): void {
    for (const listener of this.listeners) {
      listener(team);
    }
  }
}
