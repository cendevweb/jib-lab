/**
 * Tower engine (SPEC §4.2) — pure, synchronous, no I/O.
 * CONTRACT STUB (harness): constants are final; function bodies are implemented by WP-01.
 */
import type {
  AgentId,
  AgentState,
  DecisionNeed,
  RoutingAction,
  RoutingEdge,
  ScenarioSpec,
  Task,
  TaskId,
  TowerEvent,
  TowerState,
  Zone,
} from "./types";

/** Research diagnosis length. */
export const INVESTIGATE_TICKS = 8;
/** Review length. */
export const REVIEW_TICKS = 10;
export const MAX_RECENT_FAILURES = 3;
export const EDGE_TTL_TICKS = 4;
export const AGENT_TOKENS_PER_TICK: Record<AgentId, number> = {
  frontend: 900,
  backend: 1100,
  tests: 600,
  research: 1400,
  review: 500,
};

export function createInitialState(_spec: ScenarioSpec): TowerState {
  throw new Error("not implemented: createInitialState");
}

export function advanceWork(_state: TowerState): { state: TowerState; events: TowerEvent[] } {
  throw new Error("not implemented: advanceWork");
}

export function decisionsNeeded(
  _state: TowerState,
  _events: readonly TowerEvent[],
): DecisionNeed[] {
  throw new Error("not implemented: decisionsNeeded");
}

export function applyActions(_state: TowerState, _actions: readonly RoutingAction[]): TowerState {
  throw new Error("not implemented: applyActions");
}

export function startAssigned(_state: TowerState): TowerState {
  throw new Error("not implemented: startAssigned");
}

export function agentsOf(_state: TowerState): Record<AgentId, AgentState> {
  throw new Error("not implemented: agentsOf");
}

export function zoneOf(_task: Task): Zone {
  throw new Error("not implemented: zoneOf");
}

export function holdKeyOf(_state: TowerState, _taskId: TaskId): string {
  throw new Error("not implemented: holdKeyOf");
}

export function visibleEdges(_state: TowerState, _ttlTicks?: number): RoutingEdge[] {
  throw new Error("not implemented: visibleEdges");
}

export function unfinishedDeps(_state: TowerState, _taskId: TaskId): TaskId[] {
  throw new Error("not implemented: unfinishedDeps");
}
