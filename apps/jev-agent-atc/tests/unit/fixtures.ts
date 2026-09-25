/**
 * Hand-built fixtures shared by the unit tests. They depend only on the public types
 * (`@/domain/types`) and `@jib/jev` types, never on engine / jev-layer / scenario code, so
 * each WORKPLAN package can be tested in isolation.
 */
import type {
  ChoiceResponse,
  DecisionRecord,
  NoulResponse,
  Questions,
  ScoreResponse,
  SystemOneResult,
} from "@jib/jev";
import type {
  AgentId,
  AgentState,
  DecisionKind,
  DecisionNeed,
  Dependency,
  JevState,
  RoutingEdge,
  ScenarioRun,
  ScenarioSpec,
  Task,
  TaskId,
  TaskSpec,
  TowerFrame,
  TowerState,
  Zone,
} from "@/domain/types";

export type Answers = SystemOneResult<Questions>["answers"];

/** Copy of the SPEC §4.4 SCENARIO table (spec order matters). */
export const SPEC_TASKS: TaskSpec[] = [
  {
    id: "api-orders",
    title: "POST /orders endpoint",
    kind: "backend",
    work: 12,
    files: ["api/orders.ts", "db/schema.sql"],
    faults: [{ attempt: 1, atUnit: 11, kind: "logic", message: "duplicate key on POST /orders" }],
  },
  {
    id: "pricing-tests",
    title: "Pricing unit tests",
    kind: "tests",
    work: 22,
    files: ["src/pricing/pricing.test.ts"],
    faults: [],
  },
  {
    id: "idempotency-research",
    title: "Idempotency key strategy",
    kind: "research",
    work: 8,
    files: ["docs/idempotency.md"],
    faults: [],
  },
  {
    id: "checkout-ui",
    title: "Checkout form",
    kind: "frontend",
    work: 14,
    files: ["app/checkout/page.tsx", "components/CheckoutForm.tsx"],
    faults: [],
  },
  {
    id: "e2e-checkout",
    title: "Checkout e2e test",
    kind: "tests",
    work: 10,
    files: ["e2e/checkout.spec.ts"],
    faults: [],
  },
];

export const SPEC_DEPENDENCIES: Dependency[] = [
  { task: "checkout-ui", on: "api-orders", kind: "contract" },
  { task: "e2e-checkout", on: "api-orders", kind: "hard" },
  { task: "e2e-checkout", on: "checkout-ui", kind: "hard" },
];

export const SPEC_FIXTURE: ScenarioSpec = {
  tasks: SPEC_TASKS,
  dependencies: SPEC_DEPENDENCIES,
  tokenBudget: 150_000,
};

export const TASK_IDS = SPEC_TASKS.map((t) => t.id);
export const ALL_AGENTS: AgentId[] = ["frontend", "backend", "tests", "research", "review"];

/** Fixture-local replica of the SPEC §4.2 zoneOf rule (keeps fixtures consistent). */
export function zoneFor(status: Task["status"], agent: AgentId | null): Zone {
  if (status === "done") return "landed";
  if (status === "escalated") return "human";
  if (status === "review" && agent === null) return "holding";
  if (status === "review" && agent === "review") return "gate:review";
  if (agent !== null) return `gate:${agent}`;
  return "approach";
}

/** A task from the SCENARIO table (or a custom TaskSpec) with state overrides. */
export function makeTask(spec: TaskId | TaskSpec, overrides: Partial<Task> = {}): Task {
  const s = typeof spec === "string" ? SPEC_TASKS.find((t) => t.id === spec) : spec;
  if (!s) throw new Error(`unknown fixture task ${String(spec)}`);
  const base: Task = {
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
  };
  const merged = { ...base, ...overrides };
  if (overrides.zone === undefined) merged.zone = zoneFor(merged.status, merged.agent);
  return merged;
}

/** A custom task spec (for engine tests that need more than the 5 scenario tasks). */
export function taskSpec(id: TaskId, kind: TaskSpec["kind"], extra: Partial<TaskSpec> = {}) {
  return { id, title: id, kind, work: 10, files: [`${id}.ts`], faults: [], ...extra };
}

/**
 * A TowerState built from the SCENARIO table: every task defaults to the initial state,
 * `tasks` overrides individual tasks by id.
 */
export function makeState(
  options: {
    tick?: number;
    tasks?: Record<TaskId, Partial<Task>>;
    taskList?: Task[];
    dependencies?: Dependency[];
    recentFailures?: TowerState["recentFailures"];
    failureCount?: number;
    tokenBudget?: TowerState["tokenBudget"];
    confidence?: TowerState["confidence"];
    edges?: RoutingEdge[];
  } = {},
): TowerState {
  const tasks =
    options.taskList ?? SPEC_TASKS.map((s) => makeTask(s.id, options.tasks?.[s.id] ?? {}));
  return {
    tick: options.tick ?? 0,
    tasks,
    dependencies: (options.dependencies ?? SPEC_DEPENDENCIES).map((d) => ({ ...d })),
    recentFailures: options.recentFailures ?? [],
    failureCount: options.failureCount ?? options.recentFailures?.length ?? 0,
    tokenBudget: options.tokenBudget ?? { total: 150_000, used: 0 },
    confidence: options.confidence ?? {},
    edges: options.edges ?? [],
  };
}

export function need(kind: DecisionKind, taskId: TaskId, retry = false): DecisionNeed {
  return { kind, taskId, retry };
}

/** The scripted api-orders failure (attempt 1, tick 12). */
export const API_FAILURE: TowerState["recentFailures"][number] = {
  taskId: "api-orders",
  agent: "backend",
  attempt: 1,
  kind: "logic",
  message: "duplicate key on POST /orders",
  tick: 12,
};

/** Fixture-local replica of the SPEC §4.2 agentsOf rule. */
export function agentsFor(state: TowerState): Record<AgentId, AgentState> {
  const out = {} as Record<AgentId, AgentState>;
  for (const id of ALL_AGENTS) {
    const t = state.tasks.find((x) =>
      id === "review"
        ? x.status === "review" && x.agent === "review"
        : x.status === "running" && x.agent === id,
    );
    out[id] = { id, status: t ? "busy" : "idle", taskId: t ? t.id : null };
  }
  return out;
}

export function makeEdge(partial: Partial<RoutingEdge> & { taskId: TaskId }): RoutingEdge {
  return {
    id: "e1",
    tick: 0,
    decisionId: "d1",
    kind: "dispatch",
    action: "assign",
    from: "approach",
    to: "approach",
    label: "",
    p: 0.5,
    retry: false,
    fallback: false,
    ...partial,
  };
}

export function makeFrame(
  state: TowerState,
  options: {
    edges?: RoutingEdge[];
    caption?: string;
    decisionIds?: string[];
    tickMs?: number;
  } = {},
): TowerFrame {
  return {
    tick: state.tick,
    t: state.tick * (options.tickMs ?? 500),
    state,
    agents: agentsFor(state),
    edges: options.edges ?? [],
    caption: options.caption ?? `caption ${state.tick}`,
    decisionIds: options.decisionIds ?? [],
  };
}

export function choiceAnswer(probabilities: Record<string, number>, confidence = 0.4) {
  const entries = Object.entries(probabilities);
  let best = entries[0]?.[0] ?? "";
  for (const [k, p] of entries) if (p > (probabilities[best] ?? -1)) best = k;
  const answer: ChoiceResponse = { type: "choice", choice: best, confidence, probabilities };
  return answer;
}

export function noulAnswer(p: number): NoulResponse {
  return { type: "noul", noul: p };
}

export const RISK_LEVELS = ["trivial", "low", "medium", "high"] as const;

export function scoreAnswer(weights: number[], confidence = 0.3): ScoreResponse {
  const expected = weights.reduce((acc, w, i) => acc + w * i, 0);
  return {
    type: "score",
    score: Math.round(expected * 10_000) / 10_000,
    confidence,
    legend: Object.fromEntries(RISK_LEVELS.map((l, i) => [String(i), l])),
    probabilities: Object.fromEntries(weights.map((w, i) => [String(i), w])),
  };
}

/** A JevState-shaped object for fixture records (only used as opaque request state). */
export function fixtureJevState(focus: TaskId, decision: DecisionKind): JevState {
  return {
    focus: { taskId: focus, decision, retry: false },
    tasks: SPEC_TASKS.map((t) => ({
      id: t.id,
      title: t.title,
      kind: t.kind,
      status: "running",
      stage: "build",
      agent: t.kind,
      progress: 0.5,
      attempt: 1,
    })),
    dependencies: SPEC_DEPENDENCIES.map((d) => ({ ...d })),
    agentStatus: {
      frontend: "busy",
      backend: "idle",
      tests: "busy",
      research: "busy",
      review: "idle",
    },
    recentFailures: [API_FAILURE],
    tokenBudget: { total: 150_000, used: 40_000, remaining: 110_000 },
    changedFiles: { "api-orders": ["api/orders.ts", "db/schema.sql"] },
    confidence: { "api-orders": 0.76 },
    blockedBy: { "checkout-ui": ["api-orders"] },
  };
}

export function makeRecord(o: {
  id: string;
  name: DecisionKind;
  at: number;
  task: TaskId;
  answers: Answers;
  state?: JevState;
}): DecisionRecord {
  return {
    id: o.id,
    name: o.name,
    at: o.at,
    provider: "simulated",
    request: { state: o.state ?? fixtureJevState(o.task, o.name), questions: {} },
    result: {
      model: "jev-simulated",
      answers: o.answers,
      usage: { input_tokens: 10, output_tokens: 1 },
    },
    latencyMs: 0,
    tags: { task: o.task, tick: String(o.at / 500) },
  };
}

// ---------------------------------------------------------------------------------------------
// A small fixture run (5 frames, tickMs 500) mirroring the SPEC §7 beats around the failure.
// ---------------------------------------------------------------------------------------------

export const FAILURE_RECORD = makeRecord({
  id: "d7",
  name: "failure",
  at: 1500,
  task: "api-orders",
  answers: {
    onFailure: choiceAnswer({ retry: 0.18, research: 0.76, escalate: 0.06 }, 0.3755),
  },
});

export const FIXTURE_RECORDS: DecisionRecord[] = [
  makeRecord({
    id: "d1",
    name: "dispatch",
    at: 500,
    task: "api-orders",
    answers: {
      assignee: choiceAnswer({ frontend: 0.05, backend: 0.86, tests: 0.05, research: 0.04 }),
      parallelSafe: noulAnswer(0.94),
    },
  }),
  makeRecord({
    id: "d2",
    name: "completion",
    at: 1000,
    task: "idempotency-research",
    answers: { risk: scoreAnswer([0.7, 0.22, 0.06, 0.02]) },
  }),
  makeRecord({
    id: "d3",
    name: "dispatch",
    at: 1000,
    task: "e2e-checkout",
    answers: {
      assignee: choiceAnswer({ frontend: 0.04, backend: 0.04, tests: 0.88, research: 0.04 }),
      parallelSafe: noulAnswer(0.12),
    },
  }),
  makeRecord({
    id: "d4",
    name: "impact",
    at: 1500,
    task: "pricing-tests",
    answers: { blocked: noulAnswer(0.04) },
  }),
  FAILURE_RECORD,
  makeRecord({
    id: "d8",
    name: "impact",
    at: 1500,
    task: "checkout-ui",
    answers: { blocked: noulAnswer(0.91) },
  }),
  makeRecord({
    id: "d9",
    name: "impact",
    at: 2000,
    task: "pricing-tests",
    answers: { blocked: noulAnswer(0.22) },
  }),
  makeRecord({
    id: "d10",
    name: "impact",
    at: 2000,
    task: "checkout-ui",
    answers: { blocked: noulAnswer(0.04) },
  }),
];

function fixtureFrames(): TowerFrame[] {
  const s0 = makeState({ tick: 0 });
  const s1 = makeState({
    tick: 1,
    tasks: { "api-orders": { status: "running", agent: "backend", startedAt: 1, since: 1 } },
  });
  const assignEdge = makeEdge({
    id: "e1",
    tick: 1,
    taskId: "api-orders",
    from: "approach",
    to: "gate:backend",
    label: "backend 86%",
    p: 0.86,
  });
  const s2 = makeState({
    tick: 2,
    tasks: {
      "api-orders": { status: "failed", agent: "backend", progress: 11, startedAt: 1, since: 2 },
      "idempotency-research": { status: "done", progress: 8, startedAt: 1, since: 2 },
    },
    recentFailures: [API_FAILURE],
  });
  const s3 = makeState({
    tick: 3,
    tasks: {
      "api-orders": {
        status: "running",
        stage: "investigate",
        agent: "research",
        startedAt: 1,
        since: 3,
      },
      "pricing-tests": { status: "running", agent: "tests", progress: 11, startedAt: 1 },
      "idempotency-research": { status: "done", progress: 8, startedAt: 1, since: 2 },
      "checkout-ui": {
        status: "blocked",
        agent: "frontend",
        progress: 9,
        startedAt: 1,
        blockedBy: ["api-orders"],
        holdKey: "",
        since: 3,
      },
      "e2e-checkout": {
        status: "blocked",
        blockedBy: ["api-orders", "checkout-ui"],
        holdKey: "",
        since: 1,
      },
    },
    recentFailures: [API_FAILURE],
  });
  const rerouteEdge = makeEdge({
    id: "e3",
    tick: 3,
    decisionId: "d7",
    kind: "failure",
    action: "reroute",
    taskId: "api-orders",
    from: "gate:backend",
    to: "gate:research",
    label: "research 76%",
    p: 0.76,
  });
  const pauseEdge = makeEdge({
    id: "e4",
    tick: 3,
    decisionId: "d8",
    kind: "impact",
    action: "pause",
    taskId: "checkout-ui",
    from: "gate:frontend",
    to: "gate:frontend",
    label: "pause 91%",
    p: 0.91,
  });
  const s4 = makeState({ tick: 4, taskList: s3.tasks, recentFailures: [API_FAILURE] });
  return [
    makeFrame(s0, { caption: "intro" }),
    makeFrame(s1, { edges: [assignEdge], caption: "Jev: api-orders → backend (86%)" }),
    makeFrame(s2, { edges: [assignEdge], caption: "✗ api-orders failed on backend — boom" }),
    makeFrame(s3, {
      edges: [rerouteEdge, pauseEdge],
      caption: "Jev: retry 18% · research 76% → reroute api-orders to Research",
      decisionIds: ["d7", "d8"],
    }),
    makeFrame(s4, {
      edges: [rerouteEdge, pauseEdge],
      caption: "Jev: retry 18% · research 76% → reroute api-orders to Research",
    }),
  ];
}

export function makeFixtureRun(): ScenarioRun {
  return {
    seed: 7,
    provider: "simulated",
    tickMs: 500,
    duration: 2000,
    frames: fixtureFrames(),
    records: FIXTURE_RECORDS,
  };
}
