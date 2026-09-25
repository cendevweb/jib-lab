/**
 * Tower engine (SPEC §4.2) — pure, synchronous, no I/O.
 * Every function returns new objects and never mutates its input.
 */
import {
  AGENT_IDS,
  type AgentId,
  type AgentState,
  type DecisionNeed,
  type Failure,
  type RoutingAction,
  type RoutingEdge,
  type ScenarioSpec,
  type Task,
  type TaskId,
  type TaskStatus,
  type TowerEvent,
  type TowerState,
  type Zone,
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

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

function cloneTask(task: Task): Task {
  return {
    ...task,
    files: [...task.files],
    faults: task.faults.map((f) => ({ ...f })),
    blockedBy: [...task.blockedBy],
  };
}

function cloneState(state: TowerState): TowerState {
  return {
    tick: state.tick,
    tasks: state.tasks.map(cloneTask),
    dependencies: state.dependencies.map((d) => ({ ...d })),
    recentFailures: state.recentFailures.map((f) => ({ ...f })),
    failureCount: state.failureCount,
    tokenBudget: { ...state.tokenBudget },
    confidence: { ...state.confidence },
    edges: state.edges.map((e) => ({ ...e })),
  };
}

function findTask(state: TowerState, taskId: TaskId): Task | undefined {
  return state.tasks.find((t) => t.id === taskId);
}

/** Sets the status and, if it changed, `since = tick`. */
function setStatus(task: Task, status: TaskStatus, tick: number): void {
  if (task.status !== status) {
    task.status = status;
    task.since = tick;
  }
}

function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

function edgeLabel(action: RoutingAction): string {
  const p = pct(action.p);
  switch (action.type) {
    case "assign":
      return action.retry ? `retry → ${action.agent} ${p}` : `${action.agent} ${p}`;
    case "reroute":
      return `research ${p}`;
    case "escalate":
      return `human ${p}`;
    default:
      return `${action.type} ${p}`;
  }
}

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

export function createInitialState(spec: ScenarioSpec): TowerState {
  return {
    tick: 0,
    tasks: spec.tasks.map((s) => ({
      id: s.id,
      title: s.title,
      kind: s.kind,
      work: s.work,
      files: [...s.files],
      faults: s.faults.map((f) => ({ ...f })),
      status: "queued",
      stage: "build",
      progress: 0,
      attempt: 1,
      agent: null,
      zone: "approach",
      blockedBy: [],
      holdKey: null,
      since: 0,
      startedAt: null,
    })),
    dependencies: spec.dependencies.map((d) => ({ ...d })),
    recentFailures: [],
    failureCount: 0,
    tokenBudget: { total: spec.tokenBudget, used: 0 },
    confidence: {},
    edges: [],
  };
}

export function zoneOf(task: Task): Zone {
  if (task.status === "done") return "landed";
  if (task.status === "escalated") return "human";
  if (task.status === "review" && task.agent === null) return "holding";
  if (task.status === "review" && task.agent === "review") return "gate:review";
  if (task.agent !== null) return `gate:${task.agent}`;
  return "approach";
}

export function agentsOf(state: TowerState): Record<AgentId, AgentState> {
  const out = {} as Record<AgentId, AgentState>;
  for (const id of AGENT_IDS) {
    const t = state.tasks.find((x) =>
      id === "review"
        ? x.status === "review" && x.agent === "review"
        : x.status === "running" && x.agent === id,
    );
    out[id] = { id, status: t ? "busy" : "idle", taskId: t ? t.id : null };
  }
  return out;
}

export function unfinishedDeps(state: TowerState, taskId: TaskId): TaskId[] {
  return state.dependencies
    .filter((d) => d.task === taskId && findTask(state, d.on)?.status !== "done")
    .map((d) => d.on);
}

export function holdKeyOf(state: TowerState, taskId: TaskId): string {
  const parts: string[] = [];
  for (const d of state.dependencies) {
    if (d.task !== taskId) continue;
    const status = findTask(state, d.on)?.status;
    if (status === "review" || status === "done") parts.push(`${d.on}:${status}`);
  }
  return parts.join(",");
}

export function advanceWork(state: TowerState): { state: TowerState; events: TowerEvent[] } {
  const next = cloneState(state);
  next.tick = state.tick + 1;
  const tick = next.tick;
  const events: TowerEvent[] = [];

  for (const task of next.tasks) {
    const working =
      task.status === "running" || (task.status === "review" && task.agent === "review");
    if (!working) continue;

    task.progress += 1;
    const agent: AgentId = task.agent ?? task.kind;
    next.tokenBudget.used += AGENT_TOKENS_PER_TICK[agent];

    if (task.status === "running" && task.stage === "build") {
      const fault = task.faults.find(
        (f) => f.attempt === task.attempt && f.atUnit === task.progress,
      );
      if (fault) {
        setStatus(task, "failed", tick);
        const failure: Failure = {
          taskId: task.id,
          agent,
          attempt: task.attempt,
          kind: fault.kind,
          message: fault.message,
          tick,
        };
        next.recentFailures = [...next.recentFailures, failure].slice(-MAX_RECENT_FAILURES);
        next.failureCount += 1;
        events.push({ type: "failed", taskId: task.id, failure: { ...failure } });
      } else if (task.progress >= task.work) {
        events.push({ type: "finished", taskId: task.id });
      }
    } else if (task.status === "running" && task.stage === "investigate") {
      if (task.progress >= INVESTIGATE_TICKS) {
        setStatus(task, "retrying", tick);
        task.stage = "build";
        task.progress = 0;
        task.attempt += 1;
        events.push({ type: "investigated", taskId: task.id });
      }
    } else if (task.status === "review" && task.stage === "review") {
      if (task.progress >= REVIEW_TICKS) {
        setStatus(task, "done", tick);
        task.agent = null;
        events.push({ type: "landed", taskId: task.id });
      }
    }
  }

  for (const task of next.tasks) task.zone = zoneOf(task);
  return { state: next, events };
}

export function decisionsNeeded(state: TowerState, events: readonly TowerEvent[]): DecisionNeed[] {
  const { tick, tasks } = state;
  const needs: DecisionNeed[] = [];

  // 1. failure — one tick after the failure.
  const failing = tasks.filter((t) => t.status === "failed" && t.since < tick);
  for (const t of failing) needs.push({ kind: "failure", taskId: t.id, retry: false });

  // 2. impact — only while a failure is being decided.
  if (failing.length > 0) {
    const failingIds = new Set(failing.map((t) => t.id));
    for (const t of tasks) {
      if (failingIds.has(t.id)) continue;
      if (t.status === "running" || (t.status === "queued" && t.agent !== null)) {
        needs.push({ kind: "impact", taskId: t.id, retry: false });
      }
    }
  }

  // 3. completion — one per `finished` event.
  for (const e of events) {
    if (e.type === "finished") needs.push({ kind: "completion", taskId: e.taskId, retry: false });
  }

  // 4. impact re-ask for paused tasks whose dependency snapshot changed.
  for (const t of tasks) {
    if (t.status === "blocked" && t.agent !== null && holdKeyOf(state, t.id) !== t.holdKey) {
      needs.push({ kind: "impact", taskId: t.id, retry: false });
    }
  }

  // 5. dispatch (retry) — one tick after `retrying`.
  for (const t of tasks) {
    if (t.status === "retrying" && t.since < tick) {
      needs.push({ kind: "dispatch", taskId: t.id, retry: true });
    }
  }

  // 6. dispatch re-ask for held tasks whose dependency snapshot changed.
  for (const t of tasks) {
    if (t.status === "blocked" && t.agent === null && holdKeyOf(state, t.id) !== t.holdKey) {
      needs.push({ kind: "dispatch", taskId: t.id, retry: false });
    }
  }

  // 7. at most one new dispatch per tick.
  const fresh = tasks.find((t) => t.status === "queued" && t.agent === null);
  if (fresh) needs.push({ kind: "dispatch", taskId: fresh.id, retry: false });

  return needs;
}

function holdBlockers(state: TowerState, task: Task): TaskId[] {
  const deps = unfinishedDeps(state, task.id);
  if (deps.length > 0) return deps;
  const files = new Set(task.files);
  return state.tasks
    .filter((o) => o.id !== task.id && o.status === "running" && o.files.some((f) => files.has(f)))
    .map((o) => o.id);
}

export function applyActions(state: TowerState, actions: readonly RoutingAction[]): TowerState {
  const next = cloneState(state);
  const tick = next.tick;

  for (const action of actions) {
    const task = findTask(next, action.taskId);
    if (!task) throw new Error(`applyActions: unknown task ${action.taskId}`);
    const from = zoneOf(task);

    switch (action.type) {
      case "assign":
        setStatus(task, "queued", tick);
        task.agent = action.agent;
        task.blockedBy = [];
        task.holdKey = null;
        break;
      case "hold":
        setStatus(task, "blocked", tick);
        task.agent = null;
        task.blockedBy = holdBlockers(next, task);
        task.holdKey = holdKeyOf(next, task.id);
        break;
      case "pause":
        setStatus(task, "blocked", tick);
        task.blockedBy = unfinishedDeps(next, task.id);
        task.holdKey = holdKeyOf(next, task.id);
        break;
      case "continue":
        break;
      case "resume":
        setStatus(task, "queued", tick);
        task.blockedBy = [];
        task.holdKey = null;
        break;
      case "reroute":
        setStatus(task, "queued", tick);
        task.stage = "investigate";
        task.progress = 0;
        task.agent = "research";
        break;
      case "retry":
        setStatus(task, "retrying", tick);
        task.stage = "build";
        task.progress = 0;
        task.attempt += 1;
        break;
      case "escalate":
        setStatus(task, "escalated", tick);
        task.agent = null;
        break;
      case "review":
        setStatus(task, "review", tick);
        task.stage = "review";
        task.progress = 0;
        task.agent = null;
        break;
      case "land":
        setStatus(task, "done", tick);
        task.agent = null;
        break;
    }

    task.zone = zoneOf(task);
    next.confidence[task.id] = action.p;
    next.edges.push({
      id: `e${next.edges.length + 1}`,
      tick,
      decisionId: action.decisionId,
      kind: action.kind,
      action: action.type,
      taskId: task.id,
      from,
      to: task.zone,
      label: edgeLabel(action),
      p: action.p,
      retry: action.type === "assign" ? action.retry : false,
      fallback: action.fallback,
    });
  }

  return next;
}

export function startAssigned(state: TowerState): TowerState {
  const next = cloneState(state);
  const tick = next.tick;
  const agents = agentsOf(next);

  for (const id of AGENT_IDS) {
    if (agents[id].status !== "idle") continue;
    if (id === "review") {
      let pick: Task | undefined;
      for (const t of next.tasks) {
        if (t.status !== "review" || t.agent !== null) continue;
        if (!pick || t.since < pick.since) pick = t;
      }
      if (pick) {
        pick.agent = "review";
        pick.progress = 0;
      }
    } else {
      const t = next.tasks.find((x) => x.status === "queued" && x.agent === id);
      if (t) {
        setStatus(t, "running", tick);
        if (t.startedAt === null) t.startedAt = tick;
      }
    }
  }

  for (const task of next.tasks) task.zone = zoneOf(task);
  return next;
}

export function visibleEdges(state: TowerState, ttlTicks: number = EDGE_TTL_TICKS): RoutingEdge[] {
  const latest = new Map<TaskId, RoutingEdge>();
  for (const e of state.edges) latest.set(e.taskId, e);
  const out: RoutingEdge[] = [];
  for (const task of state.tasks) {
    const e = latest.get(task.id);
    if (!e) continue;
    if (task.status === "done" && e.tick < state.tick - ttlTicks) continue;
    out.push({ ...e });
  }
  return out;
}
