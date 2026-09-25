import { describe, expect, it } from "vitest";
import {
  AGENT_TOKENS_PER_TICK,
  advanceWork,
  agentsOf,
  applyActions,
  createInitialState,
  EDGE_TTL_TICKS,
  INVESTIGATE_TICKS,
  MAX_RECENT_FAILURES,
  REVIEW_TICKS,
  startAssigned,
  visibleEdges,
  zoneOf,
} from "@/domain/engine";
import {
  AGENT_IDS,
  type DecisionKind,
  type RoutingAction,
  type RoutingActionType,
  type Task,
  type TaskId,
  type TowerState,
  WORKER_KINDS,
  type WorkerKind,
} from "@/domain/types";
import {
  ALL_AGENTS,
  API_FAILURE,
  makeEdge,
  makeState,
  makeTask,
  SPEC_DEPENDENCIES,
  SPEC_FIXTURE,
  TASK_IDS,
  taskSpec,
} from "./fixtures";

function taskOf(state: TowerState, id: TaskId): Task {
  const t = state.tasks.find((x) => x.id === id);
  if (!t) throw new Error(`task ${id} missing`);
  return t;
}

function assign(taskId: TaskId, agent: WorkerKind, p: number, retry = false): RoutingAction {
  return {
    type: "assign",
    agent,
    retry,
    taskId,
    kind: "dispatch",
    p,
    decisionId: "d1",
    fallback: false,
  };
}

function action(
  type: Exclude<RoutingActionType, "assign">,
  taskId: TaskId,
  kind: DecisionKind,
  p: number,
  fallback = false,
): RoutingAction {
  return { type, taskId, kind, p, decisionId: "d9", fallback };
}

describe("engine constants", () => {
  it("[AC-01] exposes the SPEC §4.2 constants and the 5 agents (4 workers + review)", () => {
    expect(INVESTIGATE_TICKS).toBe(8);
    expect(REVIEW_TICKS).toBe(10);
    expect(MAX_RECENT_FAILURES).toBe(3);
    expect(EDGE_TTL_TICKS).toBe(4);
    expect(AGENT_TOKENS_PER_TICK).toEqual({
      frontend: 900,
      backend: 1100,
      tests: 600,
      research: 1400,
      review: 500,
    });
    expect([...AGENT_IDS]).toEqual(ALL_AGENTS);
    expect(WORKER_KINDS).toEqual(["frontend", "backend", "tests", "research"]);
  });
});

describe("createInitialState", () => {
  it("[AC-01] returns tick 0 with the 5 tasks queued on approach in spec order", () => {
    const s = createInitialState(SPEC_FIXTURE);
    expect(s.tick).toBe(0);
    expect(s.tasks.map((t) => t.id)).toEqual(TASK_IDS);
    for (const [i, t] of s.tasks.entries()) {
      const spec = SPEC_FIXTURE.tasks[i];
      expect(t).toEqual({
        id: spec?.id,
        title: spec?.title,
        kind: spec?.kind,
        work: spec?.work,
        files: spec?.files,
        faults: spec?.faults,
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
      });
    }
  });

  it("[AC-01] carries the 3 dependencies, token budget 150000 and empty history", () => {
    const s = createInitialState(SPEC_FIXTURE);
    expect(s.dependencies).toEqual(SPEC_DEPENDENCIES);
    expect(s.dependencies).toHaveLength(3);
    expect(s.recentFailures).toEqual([]);
    expect(s.failureCount).toBe(0);
    expect(s.tokenBudget).toEqual({ total: 150_000, used: 0 });
    expect(s.confidence).toEqual({});
    expect(s.edges).toEqual([]);
  });

  it("[AC-01] agentsOf reports all 5 agents idle on the initial state", () => {
    const agents = agentsOf(createInitialState(SPEC_FIXTURE));
    expect(Object.keys(agents).sort()).toEqual([...ALL_AGENTS].sort());
    for (const id of ALL_AGENTS) {
      expect(agents[id]).toEqual({ id, status: "idle", taskId: null });
    }
  });
});

describe("advanceWork", () => {
  it("[AC-02] increments tick, advances running tasks by 1 unit and consumes agent tokens", () => {
    const s = makeState({
      tick: 3,
      tasks: {
        "api-orders": { status: "running", agent: "backend", progress: 2, startedAt: 1 },
        "pricing-tests": { status: "running", agent: "tests", progress: 1, startedAt: 2 },
        "checkout-ui": { status: "queued", agent: "frontend" },
      },
      tokenBudget: { total: 150_000, used: 1000 },
    });
    const { state, events } = advanceWork(s);
    expect(state.tick).toBe(4);
    expect(taskOf(state, "api-orders").progress).toBe(3);
    expect(taskOf(state, "pricing-tests").progress).toBe(2);
    expect(taskOf(state, "checkout-ui").progress).toBe(0);
    expect(taskOf(state, "e2e-checkout").progress).toBe(0);
    expect(state.tokenBudget).toEqual({ total: 150_000, used: 1000 + 1100 + 600 });
    expect(events).toEqual([]);
  });

  it("[AC-02] does not advance queued, blocked, failed, retrying or holding tasks", () => {
    const s = makeState({
      tick: 20,
      tasks: {
        "api-orders": { status: "failed", agent: "backend", progress: 11 },
        "pricing-tests": { status: "retrying", agent: "tests", progress: 0, attempt: 2 },
        "checkout-ui": { status: "blocked", agent: "frontend", progress: 9 },
        "idempotency-research": { status: "review", stage: "review", agent: null, progress: 0 },
      },
    });
    const { state, events } = advanceWork(s);
    expect(state.tasks.map((t) => t.progress)).toEqual([11, 0, 0, 9, 0]);
    expect(state.tokenBudget.used).toBe(0);
    expect(events).toEqual([]);
  });

  it("[AC-02] a matching FaultSpec fails the task at the gate and records the failure", () => {
    const s = makeState({
      tick: 11,
      tasks: {
        "api-orders": { status: "running", agent: "backend", progress: 10, startedAt: 1, since: 1 },
      },
    });
    const { state, events } = advanceWork(s);
    const api = taskOf(state, "api-orders");
    expect(api.status).toBe("failed");
    expect(api.progress).toBe(11);
    expect(api.agent).toBe("backend");
    expect(api.zone).toBe("gate:backend");
    expect(api.since).toBe(12);
    expect(agentsOf(state).backend).toEqual({ id: "backend", status: "idle", taskId: null });
    const failure = {
      taskId: "api-orders",
      agent: "backend",
      attempt: 1,
      kind: "logic",
      message: "duplicate key on POST /orders",
      tick: 12,
    };
    expect(state.recentFailures).toEqual([failure]);
    expect(state.failureCount).toBe(1);
    expect(events).toEqual([{ type: "failed", taskId: "api-orders", failure }]);
  });

  it("[AC-02] a fault only matches its attempt (attempt 2 passes unit 11)", () => {
    const s = makeState({
      tick: 30,
      tasks: { "api-orders": { status: "running", agent: "backend", progress: 10, attempt: 2 } },
    });
    const { state, events } = advanceWork(s);
    expect(taskOf(state, "api-orders").status).toBe("running");
    expect(taskOf(state, "api-orders").progress).toBe(11);
    expect(state.failureCount).toBe(0);
    expect(events).toEqual([]);
  });

  it("[AC-02] keeps only the last MAX_RECENT_FAILURES failures but counts them all", () => {
    const old = [1, 2, 3].map((tick) => ({ ...API_FAILURE, taskId: `old-${tick}`, tick }));
    const s = makeState({
      tick: 11,
      tasks: { "api-orders": { status: "running", agent: "backend", progress: 10 } },
      recentFailures: old,
      failureCount: 5,
    });
    const { state } = advanceWork(s);
    expect(state.recentFailures).toHaveLength(3);
    expect(state.recentFailures.map((f) => f.taskId)).toEqual(["old-2", "old-3", "api-orders"]);
    expect(state.failureCount).toBe(6);
  });

  it("[AC-02] reaching `work` emits `finished` without changing the status", () => {
    const s = makeState({
      tick: 23,
      tasks: { "pricing-tests": { status: "running", agent: "tests", progress: 21, since: 2 } },
    });
    const { state, events } = advanceWork(s);
    const t = taskOf(state, "pricing-tests");
    expect(t.progress).toBe(22);
    expect(t.status).toBe("running");
    expect(t.agent).toBe("tests");
    expect(t.since).toBe(2);
    expect(events).toEqual([{ type: "finished", taskId: "pricing-tests" }]);
  });

  it("[AC-02] investigate reaching 8 → retrying, attempt + 1, stage build, event investigated", () => {
    const s = makeState({
      tick: 20,
      tasks: {
        "api-orders": {
          status: "running",
          stage: "investigate",
          agent: "research",
          progress: 7,
          attempt: 1,
          since: 13,
        },
      },
    });
    const { state, events } = advanceWork(s);
    const api = taskOf(state, "api-orders");
    expect(api.status).toBe("retrying");
    expect(api.stage).toBe("build");
    expect(api.progress).toBe(0);
    expect(api.attempt).toBe(2);
    expect(api.agent).toBe("research");
    expect(api.zone).toBe("gate:research");
    expect(api.since).toBe(21);
    expect(state.tokenBudget.used).toBe(1400);
    expect(events).toEqual([{ type: "investigated", taskId: "api-orders" }]);
  });

  it("[AC-02] review reaching 10 → done, agent null, landed, event landed", () => {
    const s = makeState({
      tick: 43,
      tasks: {
        "api-orders": {
          status: "review",
          stage: "review",
          agent: "review",
          progress: 9,
          since: 34,
        },
      },
    });
    const { state, events } = advanceWork(s);
    const api = taskOf(state, "api-orders");
    expect(api.status).toBe("done");
    expect(api.agent).toBeNull();
    expect(api.zone).toBe("landed");
    expect(api.since).toBe(44);
    expect(state.tokenBudget.used).toBe(500);
    expect(events).toEqual([{ type: "landed", taskId: "api-orders" }]);
  });

  it("[AC-02] does not mutate its input", () => {
    const s = makeState({
      tick: 11,
      tasks: {
        "api-orders": { status: "running", agent: "backend", progress: 10 },
        "pricing-tests": { status: "running", agent: "tests", progress: 21 },
      },
    });
    const before = structuredClone(s);
    advanceWork(s);
    expect(s).toEqual(before);
  });
});

describe("startAssigned / agentsOf / zoneOf", () => {
  it("[AC-03] starts at most one task per agent: the first queued task (spec order)", () => {
    const s = makeState({
      tick: 3,
      tasks: {
        "pricing-tests": { status: "queued", agent: "tests" },
        "e2e-checkout": { status: "queued", agent: "tests" },
        "api-orders": { status: "queued", agent: "backend" },
      },
    });
    const next = startAssigned(s);
    expect(taskOf(next, "pricing-tests").status).toBe("running");
    expect(taskOf(next, "pricing-tests").startedAt).toBe(3);
    expect(taskOf(next, "pricing-tests").zone).toBe("gate:tests");
    expect(taskOf(next, "e2e-checkout").status).toBe("queued");
    expect(taskOf(next, "e2e-checkout").startedAt).toBeNull();
    expect(taskOf(next, "api-orders").status).toBe("running");
    const agents = agentsOf(next);
    expect(agents.tests).toEqual({ id: "tests", status: "busy", taskId: "pricing-tests" });
    expect(agents.backend).toEqual({ id: "backend", status: "busy", taskId: "api-orders" });
  });

  it("[AC-03] a busy agent does not take a second task", () => {
    const s = makeState({
      tick: 10,
      tasks: {
        "pricing-tests": { status: "running", agent: "tests", progress: 8, startedAt: 2 },
        "e2e-checkout": { status: "queued", agent: "tests" },
      },
    });
    const next = startAssigned(s);
    expect(taskOf(next, "e2e-checkout").status).toBe("queued");
    expect(taskOf(next, "pricing-tests").status).toBe("running");
  });

  it("[AC-03] sets startedAt only on the first start and keeps progress (resume)", () => {
    const s = makeState({
      tick: 35,
      tasks: {
        "checkout-ui": { status: "queued", agent: "frontend", progress: 9, startedAt: 4 },
      },
    });
    const t = taskOf(startAssigned(s), "checkout-ui");
    expect(t.status).toBe("running");
    expect(t.startedAt).toBe(4);
    expect(t.progress).toBe(9);
    expect(t.zone).toBe("gate:frontend");
  });

  it("[AC-03] review takes the holding task with the smallest `since`", () => {
    const s = makeState({
      tick: 44,
      tasks: {
        "api-orders": { status: "review", stage: "review", agent: null, progress: 3, since: 42 },
        "checkout-ui": { status: "review", stage: "review", agent: null, progress: 0, since: 40 },
      },
    });
    const next = startAssigned(s);
    expect(taskOf(next, "checkout-ui").agent).toBe("review");
    expect(taskOf(next, "checkout-ui").zone).toBe("gate:review");
    expect(taskOf(next, "checkout-ui").progress).toBe(0);
    expect(taskOf(next, "api-orders").agent).toBeNull();
    expect(taskOf(next, "api-orders").zone).toBe("holding");
    expect(agentsOf(next).review).toEqual({ id: "review", status: "busy", taskId: "checkout-ui" });
  });

  it("[AC-03] review tie on `since` resolves in spec order; a busy review gate takes nothing", () => {
    const tie = makeState({
      tick: 44,
      tasks: {
        "api-orders": { status: "review", stage: "review", agent: null, since: 40 },
        "checkout-ui": { status: "review", stage: "review", agent: null, since: 40 },
      },
    });
    const next = startAssigned(tie);
    expect(taskOf(next, "api-orders").agent).toBe("review");
    expect(taskOf(next, "checkout-ui").agent).toBeNull();

    const busy = makeState({
      tick: 42,
      tasks: {
        "api-orders": { status: "review", stage: "review", agent: "review", progress: 8 },
        "checkout-ui": { status: "review", stage: "review", agent: null, since: 40 },
      },
    });
    const after = startAssigned(busy);
    expect(taskOf(after, "checkout-ui").agent).toBeNull();
    expect(taskOf(after, "checkout-ui").zone).toBe("holding");
    expect(taskOf(after, "api-orders").progress).toBe(8);
  });

  it("[AC-03] a paused (blocked) task never occupies its gate", () => {
    const s = makeState({
      tick: 14,
      tasks: {
        "checkout-ui": {
          status: "blocked",
          agent: "frontend",
          progress: 9,
          blockedBy: ["api-orders"],
          holdKey: "",
        },
      },
    });
    expect(agentsOf(s).frontend).toEqual({ id: "frontend", status: "idle", taskId: null });
    const t = taskOf(startAssigned(s), "checkout-ui");
    expect(t.status).toBe("blocked");
    expect(t.zone).toBe("gate:frontend");
  });

  it("[AC-03] agentsOf: busy iff running (workers) / review with agent review", () => {
    const s = makeState({
      tick: 40,
      tasks: {
        "api-orders": { status: "failed", agent: "backend" },
        "pricing-tests": { status: "running", agent: "tests" },
        "idempotency-research": { status: "queued", agent: "research" },
        "checkout-ui": { status: "review", stage: "review", agent: "review" },
      },
    });
    const a = agentsOf(s);
    expect(a.backend.status).toBe("idle");
    expect(a.research.status).toBe("idle");
    expect(a.frontend.status).toBe("idle");
    expect(a.tests).toEqual({ id: "tests", status: "busy", taskId: "pricing-tests" });
    expect(a.review).toEqual({ id: "review", status: "busy", taskId: "checkout-ui" });
  });

  it("[AC-03] zoneOf derives placement from status and agent", () => {
    const z = (overrides: Partial<Task>) =>
      zoneOf(makeTask("api-orders", { ...overrides, zone: "approach" }));
    expect(z({ status: "done", agent: null })).toBe("landed");
    expect(z({ status: "escalated", agent: null })).toBe("human");
    expect(z({ status: "review", agent: null })).toBe("holding");
    expect(z({ status: "review", agent: "review" })).toBe("gate:review");
    expect(z({ status: "running", agent: "backend" })).toBe("gate:backend");
    expect(z({ status: "failed", agent: "backend" })).toBe("gate:backend");
    expect(z({ status: "blocked", agent: "frontend" })).toBe("gate:frontend");
    expect(z({ status: "retrying", agent: "research" })).toBe("gate:research");
    expect(z({ status: "queued", agent: "tests" })).toBe("gate:tests");
    expect(z({ status: "blocked", agent: null })).toBe("approach");
    expect(zoneOf(makeTask("api-orders", { status: "queued", agent: null, zone: "landed" }))).toBe(
      "approach",
    );
  });
});

describe("applyActions", () => {
  it("[AC-04] assign: queued at the agent, clears blockedBy/holdKey, edge `{agent} {pct}`", () => {
    const s = makeState({
      tick: 54,
      tasks: {
        "e2e-checkout": {
          status: "blocked",
          blockedBy: ["checkout-ui"],
          holdKey: "api-orders:done,checkout-ui:review",
          since: 44,
        },
      },
    });
    const next = applyActions(s, [assign("e2e-checkout", "tests", 0.84)]);
    const t = taskOf(next, "e2e-checkout");
    expect(t.status).toBe("queued");
    expect(t.agent).toBe("tests");
    expect(t.blockedBy).toEqual([]);
    expect(t.holdKey).toBeNull();
    expect(t.zone).toBe("gate:tests");
    expect(t.since).toBe(54);
    expect(next.confidence["e2e-checkout"]).toBe(0.84);
    expect(next.edges).toEqual([
      {
        id: "e1",
        tick: 54,
        decisionId: "d1",
        kind: "dispatch",
        action: "assign",
        taskId: "e2e-checkout",
        from: "approach",
        to: "gate:tests",
        label: "tests 84%",
        p: 0.84,
        retry: false,
        fallback: false,
      },
    ]);
  });

  it("[AC-04] assign with retry: loops back to the agent, label `retry → {agent} {pct}`", () => {
    const s = makeState({
      tick: 22,
      tasks: {
        "api-orders": {
          status: "retrying",
          agent: "research",
          attempt: 2,
          startedAt: 1,
          since: 21,
        },
      },
    });
    const next = applyActions(s, [assign("api-orders", "backend", 0.89, true)]);
    const t = taskOf(next, "api-orders");
    expect(t.status).toBe("queued");
    expect(t.agent).toBe("backend");
    expect(t.attempt).toBe(2);
    expect(t.zone).toBe("gate:backend");
    expect(next.edges[0]).toMatchObject({
      action: "assign",
      from: "gate:research",
      to: "gate:backend",
      label: "retry → backend 89%",
      retry: true,
    });
  });

  it("[AC-04] hold: blocked on approach, blockedBy = unfinished deps, holdKey = holdKeyOf", () => {
    const s = makeState({
      tick: 5,
      tasks: {
        "api-orders": { status: "running", agent: "backend", progress: 4 },
        "checkout-ui": { status: "running", agent: "frontend", progress: 1 },
      },
    });
    const next = applyActions(s, [action("hold", "e2e-checkout", "dispatch", 0.88)]);
    const t = taskOf(next, "e2e-checkout");
    expect(t.status).toBe("blocked");
    expect(t.agent).toBeNull();
    expect(t.blockedBy).toEqual(["api-orders", "checkout-ui"]);
    expect(t.holdKey).toBe("");
    expect(t.zone).toBe("approach");
    expect(t.since).toBe(5);
    expect(next.edges[0]).toMatchObject({
      action: "hold",
      kind: "dispatch",
      from: "approach",
      to: "approach",
      label: "hold 88%",
      decisionId: "d9",
    });
    expect(next.confidence["e2e-checkout"]).toBe(0.88);
  });

  it("[AC-04] hold: holdKey lists deps in review/done as `<on>:<status>` in dependency order", () => {
    const s = makeState({
      tick: 44,
      tasks: {
        "api-orders": { status: "done", stage: "review" },
        "checkout-ui": { status: "review", stage: "review", agent: "review" },
        "e2e-checkout": { status: "blocked", holdKey: "api-orders:review", blockedBy: [] },
      },
    });
    const t = taskOf(
      applyActions(s, [action("hold", "e2e-checkout", "dispatch", 0.88)]),
      "e2e-checkout",
    );
    expect(t.blockedBy).toEqual(["checkout-ui"]);
    expect(t.holdKey).toBe("api-orders:done,checkout-ui:review");
  });

  it("[AC-04] hold without unfinished deps: blocked by running tasks sharing a file", () => {
    const tasks = [
      makeTask(taskSpec("a", "backend", { files: ["shared.ts"] }), {
        status: "running",
        agent: "backend",
      }),
      makeTask(taskSpec("b", "frontend", { files: ["shared.ts", "b.ts"] })),
      makeTask(taskSpec("c", "tests", { files: ["c.ts"] })),
    ];
    const s = makeState({ tick: 3, taskList: tasks, dependencies: [] });
    const next = applyActions(s, [
      action("hold", "b", "dispatch", 0.6),
      action("hold", "c", "dispatch", 0.6),
    ]);
    expect(taskOf(next, "b").blockedBy).toEqual(["a"]);
    expect(taskOf(next, "c").blockedBy).toEqual([]);
  });

  it("[AC-04] pause: blocked at its gate, agent and progress kept, label `pause {pct}`", () => {
    const s = makeState({
      tick: 13,
      tasks: {
        "api-orders": { status: "queued", stage: "investigate", agent: "research" },
        "checkout-ui": { status: "running", agent: "frontend", progress: 9, startedAt: 4 },
      },
    });
    const next = applyActions(s, [action("pause", "checkout-ui", "impact", 0.91)]);
    const t = taskOf(next, "checkout-ui");
    expect(t.status).toBe("blocked");
    expect(t.agent).toBe("frontend");
    expect(t.progress).toBe(9);
    expect(t.blockedBy).toEqual(["api-orders"]);
    expect(t.holdKey).toBe("");
    expect(t.zone).toBe("gate:frontend");
    expect(t.since).toBe(13);
    expect(next.edges[0]).toMatchObject({
      action: "pause",
      kind: "impact",
      from: "gate:frontend",
      to: "gate:frontend",
      label: "pause 91%",
    });
  });

  it("[AC-04] continue: task unchanged, edge from = to, label `continue {pct}`", () => {
    const s = makeState({
      tick: 13,
      tasks: { "pricing-tests": { status: "running", agent: "tests", progress: 11, since: 2 } },
    });
    const next = applyActions(s, [action("continue", "pricing-tests", "impact", 0.96)]);
    expect(taskOf(next, "pricing-tests")).toEqual(taskOf(s, "pricing-tests"));
    expect(next.confidence["pricing-tests"]).toBe(0.96);
    expect(next.edges[0]).toMatchObject({
      action: "continue",
      from: "gate:tests",
      to: "gate:tests",
      label: "continue 96%",
    });
  });

  it("[AC-04] resume: queued at its agent, blockedBy [] and holdKey null, label `resume {pct}`", () => {
    const s = makeState({
      tick: 35,
      tasks: {
        "checkout-ui": {
          status: "blocked",
          agent: "frontend",
          progress: 9,
          blockedBy: ["api-orders"],
          holdKey: "",
          since: 13,
        },
      },
    });
    const next = applyActions(s, [action("resume", "checkout-ui", "impact", 0.78)]);
    const t = taskOf(next, "checkout-ui");
    expect(t.status).toBe("queued");
    expect(t.agent).toBe("frontend");
    expect(t.progress).toBe(9);
    expect(t.blockedBy).toEqual([]);
    expect(t.holdKey).toBeNull();
    expect(t.since).toBe(35);
    expect(next.edges[0]).toMatchObject({ action: "resume", label: "resume 78%" });
  });

  it("[AC-04] reroute: investigate at Research, progress 0, label `research {pct}`", () => {
    const s = makeState({
      tick: 13,
      tasks: { "api-orders": { status: "failed", agent: "backend", progress: 11, since: 12 } },
      recentFailures: [API_FAILURE],
    });
    const next = applyActions(s, [action("reroute", "api-orders", "failure", 0.76)]);
    const t = taskOf(next, "api-orders");
    expect(t.status).toBe("queued");
    expect(t.stage).toBe("investigate");
    expect(t.progress).toBe(0);
    expect(t.agent).toBe("research");
    expect(t.attempt).toBe(1);
    expect(t.zone).toBe("gate:research");
    expect(t.since).toBe(13);
    expect(next.edges[0]).toMatchObject({
      kind: "failure",
      action: "reroute",
      from: "gate:backend",
      to: "gate:research",
      label: "research 76%",
      p: 0.76,
    });
  });

  it("[AC-04] retry: retrying at the same agent, attempt + 1, label `retry {pct}`", () => {
    const s = makeState({
      tick: 13,
      tasks: { "api-orders": { status: "failed", agent: "backend", progress: 11, since: 12 } },
    });
    const next = applyActions(s, [action("retry", "api-orders", "failure", 0.78)]);
    const t = taskOf(next, "api-orders");
    expect(t.status).toBe("retrying");
    expect(t.stage).toBe("build");
    expect(t.progress).toBe(0);
    expect(t.attempt).toBe(2);
    expect(t.agent).toBe("backend");
    expect(t.zone).toBe("gate:backend");
    expect(next.edges[0]).toMatchObject({ action: "retry", label: "retry 78%" });
  });

  it("[AC-04] escalate: escalated to the human pad, label `human {pct}`, fallback copied", () => {
    const s = makeState({
      tick: 13,
      tasks: { "api-orders": { status: "failed", agent: "backend", progress: 11, attempt: 3 } },
    });
    const next = applyActions(s, [action("escalate", "api-orders", "failure", 0.7, true)]);
    const t = taskOf(next, "api-orders");
    expect(t.status).toBe("escalated");
    expect(t.agent).toBeNull();
    expect(t.zone).toBe("human");
    expect(next.edges[0]).toMatchObject({
      action: "escalate",
      from: "gate:backend",
      to: "human",
      label: "human 70%",
      fallback: true,
    });
  });

  it("[AC-04] review: review stage in the holding pattern, label `review {pct}`", () => {
    const s = makeState({
      tick: 34,
      tasks: { "api-orders": { status: "running", agent: "backend", progress: 12, attempt: 2 } },
    });
    const next = applyActions(s, [action("review", "api-orders", "completion", 0.9)]);
    const t = taskOf(next, "api-orders");
    expect(t.status).toBe("review");
    expect(t.stage).toBe("review");
    expect(t.progress).toBe(0);
    expect(t.agent).toBeNull();
    expect(t.zone).toBe("holding");
    expect(next.edges[0]).toMatchObject({
      kind: "completion",
      action: "review",
      from: "gate:backend",
      to: "holding",
      label: "review 90%",
    });
  });

  it("[AC-04] land: done on the runway, label `land {pct}`", () => {
    const s = makeState({
      tick: 24,
      tasks: { "pricing-tests": { status: "running", agent: "tests", progress: 22 } },
    });
    const next = applyActions(s, [action("land", "pricing-tests", "completion", 0.85)]);
    const t = taskOf(next, "pricing-tests");
    expect(t.status).toBe("done");
    expect(t.agent).toBeNull();
    expect(t.zone).toBe("landed");
    expect(t.since).toBe(24);
    expect(next.edges[0]).toMatchObject({
      action: "land",
      from: "gate:tests",
      to: "landed",
      label: "land 85%",
    });
  });

  it("[AC-04] appends one edge per action with sequential ids and does not mutate input", () => {
    const s = makeState({
      tick: 13,
      tasks: {
        "api-orders": { status: "failed", agent: "backend", progress: 11 },
        "pricing-tests": { status: "running", agent: "tests", progress: 11 },
      },
      edges: [
        makeEdge({ id: "e1", taskId: "api-orders" }),
        makeEdge({ id: "e2", taskId: "pricing-tests" }),
      ],
    });
    const before = structuredClone(s);
    const next = applyActions(s, [
      action("reroute", "api-orders", "failure", 0.76),
      action("continue", "pricing-tests", "impact", 0.96),
    ]);
    expect(next.edges.map((e) => e.id)).toEqual(["e1", "e2", "e3", "e4"]);
    expect(next.edges.slice(2).map((e) => [e.taskId, e.tick])).toEqual([
      ["api-orders", 13],
      ["pricing-tests", 13],
    ]);
    expect(s).toEqual(before);
  });
});

describe("visibleEdges", () => {
  it("[AC-04] keeps the latest edge per task (spec order) and drops stale edges of done tasks", () => {
    const s = makeState({
      tick: 20,
      tasks: {
        "api-orders": { status: "running", agent: "backend" },
        "pricing-tests": { status: "done" },
        "idempotency-research": { status: "done" },
      },
      edges: [
        makeEdge({ id: "e1", tick: 1, taskId: "checkout-ui" }),
        makeEdge({ id: "e2", tick: 1, taskId: "api-orders" }),
        makeEdge({ id: "e3", tick: 15, taskId: "idempotency-research" }),
        makeEdge({ id: "e4", tick: 16, taskId: "pricing-tests" }),
        makeEdge({ id: "e5", tick: 13, taskId: "api-orders" }),
      ],
    });
    expect(visibleEdges(s).map((e) => e.id)).toEqual(["e5", "e4", "e1"]);
    expect(visibleEdges(s, 10).map((e) => e.id)).toEqual(["e5", "e4", "e3", "e1"]);
    expect(visibleEdges(makeState())).toEqual([]);
  });
});
