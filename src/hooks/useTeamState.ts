import { useEffect } from "react";
import type { TeamManager } from "../teams/TeamManager.js";
import type { TeamState } from "../teams/TeamTypes.js";
import type { AppState, TeamUIState } from "../state/AppStateStore.js";
import type { Updater } from "../state/store.js";

/**
 * React hook that subscribes to TeamManager state changes
 * and pushes updates into AppState.activeTeams.
 */
export function useTeamState(
  teamManager: TeamManager,
  setAppState: (updater: Updater<AppState>) => void
): void {
  useEffect(() => {
    const unsub = teamManager.subscribe((teamState: TeamState) => {
      setAppState((s) => {
        const uiState = teamStateToUI(teamState);
        const idx = s.activeTeams.findIndex((t) => t.teamId === teamState.id);

        // Remove completed/failed/shutdown teams from active display
        if (
          teamState.status === "completed" ||
          teamState.status === "failed" ||
          teamState.status === "shutdown"
        ) {
          if (idx >= 0) {
            return {
              ...s,
              activeTeams: s.activeTeams.filter((t) => t.teamId !== teamState.id),
            };
          }
          return s;
        }

        // Update existing or add new
        if (idx >= 0) {
          const updated = [...s.activeTeams];
          updated[idx] = uiState;
          return { ...s, activeTeams: updated };
        }
        return { ...s, activeTeams: [...s.activeTeams, uiState] };
      });
    });

    return unsub;
  }, [teamManager, setAppState]);
}

function teamStateToUI(team: TeamState): TeamUIState {
  return {
    teamId: team.id,
    name: team.name,
    status: team.status,
    teammates: team.teammates.map((t) => ({
      teammateId: t.teammateId,
      agentName: t.agentDefinitionName,
      status: t.status,
      activeToolCalls: t.activeToolCalls,
      taskDescription: "",
    })),
  };
}
