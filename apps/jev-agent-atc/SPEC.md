# Jev Agent Air-Traffic Controller — Specification

> Phase: spec · Source: https://app.notion.com/p/3e529c70962581eea85dd2db96b1f204 · Slug: `jev-agent-atc` · Port: 3101

## 1. Concept (refined)
A control tower for five simulated coding agents (Frontend, Backend, Tests, Research, Review).
The agents only *do work*; every routing move — who takes a task, whether it may start in
parallel, what happens after a failure, whether a task is blocked, whether it needs review — is
a typed question to **Jev** (TypeSafe System One), answered with calibrated probabilities in one
forward pass and applied by an explicit policy with thresholds. The tower renders each move as a
flight path with its probability on it, so the orchestration logic lives on screen, not inside
agent prompts.

## 2. Demo promise
- **Hook:** I stopped letting my AI agents decide what to do next. Jev does it for them.
- **5-second demo:** five task "aircraft" sit on the approach strip; every 0.5 s Jev routes one
  to a gate with a badge (`backend 86%`, `tests 83%`…); `e2e-checkout` gets `hold 88%` with two
  red dashed dependency lanes; four agents run in parallel. At 6.0 s the backend card flashes red
  (`✗ api-orders failed`), at 6.5 s the probability bars show `retry 18% · research 76%` and the
  whole board re-routes at once: backend work flies to Research, the dependent checkout UI is
  paused, the unrelated tests keep running.

## 3. Notion corrections
| Notion said | Spec says | Why |
|---|---|---|
| "confidence visible on each routing decision"; "retry backend: low confidence / send to research: high confidence" | Jev returns a **probability distribution** per question. Edges show P(chosen option) (`research 76%`); the bars show every option (`retry 18%`). Jev's own `confidence` field (normalised entropy, e.g. 0.38 for that answer) is shown only as the bars' caption. "Retry vs research" is **one** `choice` question, not two decisions. | System One semantics: `confidence` ≠ option probability; showing 38% next to "research" would contradict the 76% the story needs. |
| "4 Jev decisions" (6 example questions) | 4 decision kinds — `dispatch`, `failure`, `impact`, `completion` — asking 5 named questions (`assignee`, `parallelSafe`, `onFailure`, `blocked`, `risk`) that use all 3 question types (choice / noul / score); `dispatch` carries two questions in one request. 18 decisions in the 30 s run. | Maps each Notion question to a real System One question type; multi-question requests are how System One is meant to be used. |
| "pause dependent frontend task" | Dependencies have a kind: `contract` (may start early if Jev's `parallelSafe` ≥ 0.6) or `hard`. `checkout-ui` starts against the API contract, is paused by the `blocked` question when the API fails, and resumes when the API reaches review. | A task that depends on the failed one could otherwise never be running, so it could not be "paused". |
| "retry path" = "should a failed agent retry" | Retry is a **loop**: failure → Research diagnoses (4 s) → task loops back to Backend as attempt 2 (retry edge + retry-loop graphic) → mandatory review because of its failure history. Plain `retry` and `escalate` stay available options (18% / 6%) and are unit-tested, but not taken in the 30 s run. | One visible loop reads better than an immediate re-run; the options are still shown on the bars. |
| Implicit: Jev decides everything | Jev answers; a pure **policy** applies thresholds (`POLICY`) with deterministic fallbacks (low probability → fallback agent / escalate; provider error → rule-based action flagged `fallback`). The demo runs on the simulated provider and is a pure function of `(seed, t)`. Review is a gate fed by the `risk` score, not an assignee option. `tokenBudget` is state input only (no decision acts on it). | Makes the "typed decision layer" claim concrete and testable; keeps scope to one recordable story. |

## 4. Domain model & public contract
All paths are relative to `apps/jev-agent-atc/`. `@/…` = `src/…`. Tests import exactly these
modules and names. **All state types are `type` aliases with mutable arrays and no optional
properties** (use `| null`) so they are assignable to the SDK's `JsonValue` / `EntryType`
(interfaces and `readonly` arrays are not). Immutability is by convention: every function returns
new objects and never mutates its input.

### 4.1 `src/domain/types.ts` (WP-01; harness copies it verbatim)
```ts
import type { DecisionRecord, ProviderKind } from "@jib/jev";

export const AGENT_IDS = ["frontend", "backend", "tests", "research", "review"] as const;
export type AgentId = (typeof AGENT_IDS)[number];
/** Agents that execute build/investigate work (everything but review). */
export type WorkerKind = Exclude<AgentId, "review">;
export const WORKER_KINDS: WorkerKind[] = ["frontend", "backend", "tests", "research"];

export type TaskId = string;
export type TaskStatus =
  | "queued" | "running" | "blocked" | "review" | "failed" | "retrying" | "done" | "escalated";
export type Stage = "build" | "investigate" | "review";
export type Zone = "approach" | `gate:${AgentId}` | "holding" | "landed" | "human";

export type DependencyKind = "contract" | "hard";
/** `task` depends on `on`. */
export type Dependency = { task: TaskId; on: TaskId; kind: DependencyKind };

export type FailureKind = "logic" | "flaky";
/** Scripted fault: on `attempt`, the build stage fails when progress reaches `atUnit`. */
export type FaultSpec = { attempt: number; atUnit: number; kind: FailureKind; message: string };

export type TaskSpec = {
  id: TaskId; title: string; kind: WorkerKind;
  /** Build work in ticks. */
  work: number;
  files: string[];
  faults: FaultSpec[];
};
export type ScenarioSpec = {
  tasks: TaskSpec[];
  dependencies: Dependency[];
  tokenBudget: number;
};

export type Task = {
  id: TaskId; title: string; kind: WorkerKind; work: number; files: string[]; faults: FaultSpec[];
  status: TaskStatus;
  stage: Stage;
  /** Units done in the current stage. */
  progress: number;
  /** 1-based build attempt. */
  attempt: number;
  /** Agent the task is at / assigned to (kept while paused or failed for placement). */
  agent: AgentId | null;
  /** Derived placement, recomputed by every engine function (see zoneOf). */
  zone: Zone;
  blockedBy: TaskId[];
  /** Snapshot of dependency outputs when the task was held/paused (see holdKeyOf). */
  holdKey: string | null;
  /** Tick of the last status change. */
  since: number;
  /** Tick the task first started running, or null. */
  startedAt: number | null;
};

export type Failure = {
  taskId: TaskId; agent: AgentId; attempt: number; kind: FailureKind; message: string; tick: number;
};

export type AgentState = { id: AgentId; status: "idle" | "busy"; taskId: TaskId | null };

export type DecisionKind = "dispatch" | "failure" | "impact" | "completion";
export type DecisionNeed = { kind: DecisionKind; taskId: TaskId; retry: boolean };

export type RoutingActionType =
  | "assign" | "hold" | "pause" | "continue" | "resume"
  | "reroute" | "retry" | "escalate" | "review" | "land";

type ActionBase = {
  taskId: TaskId;
  kind: DecisionKind;
  /** Probability supporting this action (see §5). */
  p: number;
  decisionId: string | null;
  fallback: boolean;
};
export type RoutingAction =
  | (ActionBase & { type: "assign"; agent: WorkerKind; retry: boolean })
  | (ActionBase & { type: Exclude<RoutingActionType, "assign"> });

export type RoutingEdge = {
  /** `e1`, `e2`, … in creation order. */
  id: string;
  tick: number;
  decisionId: string | null;
  kind: DecisionKind;
  action: RoutingActionType;
  taskId: TaskId;
  from: Zone;
  to: Zone;
  /** e.g. "research 76%" — see §5.3. */
  label: string;
  p: number;
  retry: boolean;
  fallback: boolean;
};

export type TowerEvent =
  | { type: "failed"; taskId: TaskId; failure: Failure }
  | { type: "finished"; taskId: TaskId }
  | { type: "investigated"; taskId: TaskId }
  | { type: "landed"; taskId: TaskId };

export type TowerState = {
  tick: number;
  /** Always in ScenarioSpec order. */
  tasks: Task[];
  dependencies: Dependency[];
  /** Newest last, at most MAX_RECENT_FAILURES. */
  recentFailures: Failure[];
  /** Total number of failures so far (not truncated). */
  failureCount: number;
  tokenBudget: { total: number; used: number };
  /** p of the latest routing edge per task. */
  confidence: Record<TaskId, number>;
  /** Append-only routing history. */
  edges: RoutingEdge[];
};

/** What Jev sees: the Notion "shared state" keys + the focus of the question. */
export type JevTaskView = {
  id: TaskId; title: string; kind: WorkerKind; status: TaskStatus; stage: Stage;
  agent: AgentId | null; progress: number; attempt: number;
};
export type JevState = {
  focus: { taskId: TaskId; decision: DecisionKind; retry: boolean };
  tasks: JevTaskView[];
  dependencies: Dependency[];
  agentStatus: Record<AgentId, "idle" | "busy">;
  recentFailures: Failure[];
  tokenBudget: { total: number; used: number; remaining: number };
  changedFiles: Record<TaskId, string[]>;
  confidence: Record<TaskId, number>;
  blockedBy: Record<TaskId, TaskId[]>;
};

export type TowerFrame = {
  tick: number;
  /** tick * tickMs */
  t: number;
  state: TowerState;
  agents: Record<AgentId, AgentState>;
  /** visibleEdges(state) */
  edges: RoutingEdge[];
  caption: string;
  /** Ids of decision records made in this tick. */
  decisionIds: string[];
};

export type ScenarioRun = {
  seed: number;
  provider: ProviderKind;
  tickMs: number;
  duration: number;
  /** frames[k] is the state after tick k; frames[0] is the initial state. */
  frames: TowerFrame[];
  records: DecisionRecord[];
};
```

### 4.2 `src/domain/engine.ts` (WP-01) — pure, synchronous, no I/O
```ts
export const INVESTIGATE_TICKS = 8;   // research diagnosis length
export const REVIEW_TICKS = 10;       // review length
export const MAX_RECENT_FAILURES = 3;
export const EDGE_TTL_TICKS = 4;
export const AGENT_TOKENS_PER_TICK: Record<AgentId, number> =
  { frontend: 900, backend: 1100, tests: 600, research: 1400, review: 500 };

export function createInitialState(spec: ScenarioSpec): TowerState;
export function advanceWork(state: TowerState): { state: TowerState; events: TowerEvent[] };
export function decisionsNeeded(state: TowerState, events: readonly TowerEvent[]): DecisionNeed[];
export function applyActions(state: TowerState, actions: readonly RoutingAction[]): TowerState;
export function startAssigned(state: TowerState): TowerState;
export function agentsOf(state: TowerState): Record<AgentId, AgentState>;
export function zoneOf(task: Task): Zone;
export function holdKeyOf(state: TowerState, taskId: TaskId): string;
export function visibleEdges(state: TowerState, ttlTicks?: number): RoutingEdge[];
export function unfinishedDeps(state: TowerState, taskId: TaskId): TaskId[];
```
Rules (normative):
- **createInitialState**: tick 0; every task `queued`, stage `build`, progress 0, attempt 1,
  agent null, zone `approach`, blockedBy [], holdKey null, since 0, startedAt null;
  recentFailures [], failureCount 0, tokenBudget `{ total: spec.tokenBudget, used: 0 }`,
  confidence {}, edges [].
- **zoneOf**: done → `landed`; escalated → `human`; review & agent null → `holding`;
  review & agent `review` → `gate:review`; agent ≠ null → `gate:<agent>`; else `approach`.
- **agentsOf**: a worker agent A is busy iff some task has status `running` and agent A; review
  is busy iff some task has status `review` and agent `review`. `taskId` = that task or null.
- **unfinishedDeps**: ids of `on` for dependencies of the task whose `on` task is not `done`
  (dependency order).
- **holdKeyOf**: the task's dependencies whose `on` task is in `review` or `done`, formatted
  `"<on>:<status>"`, joined with `","` in dependency order ("" if none).
- **advanceWork**: `tick + 1`; then for each task (spec order):
  - `running` (build or investigate) or `review` with agent `review`: progress + 1,
    tokenBudget.used += AGENT_TOKENS_PER_TICK[agent].
  - build: if a fault matches `attempt === task.attempt && atUnit === progress` → status
    `failed` (agent kept), push a `Failure` (keep last MAX_RECENT_FAILURES), failureCount + 1,
    event `failed`. Else if progress ≥ work → event `finished` (status unchanged; the completion
    decision moves it this tick).
  - investigate: progress ≥ INVESTIGATE_TICKS → status `retrying`, stage `build`, progress 0,
    attempt + 1 (agent stays `research`), event `investigated`.
  - review stage: progress ≥ REVIEW_TICKS → status `done`, agent null, event `landed`.
  - every status change sets `since = tick`; zone recomputed.
- **decisionsNeeded** (computed once per tick, on the state *after* advanceWork, returned in this
  order; within a group, spec task order):
  1. `failure` for each task with status `failed` and `since < tick` (Jev reacts one tick after
     the failure, so the red card is visible for a frame).
  2. `impact` for each task **other than** those in group 1 with status `running`, or `queued`
     with agent ≠ null — only when group 1 is non-empty.
  3. `completion` for each `finished` event.
  4. `impact` (re-ask) for each `blocked` task with agent ≠ null whose `holdKeyOf` ≠ its `holdKey`.
  5. `dispatch` with `retry: true` for each `retrying` task with `since < tick`.
  6. `dispatch` (re-ask) for each `blocked` task with agent null whose `holdKeyOf` ≠ its `holdKey`.
  7. `dispatch` for the **first** task with status `queued` and agent null (at most one new
     dispatch per tick — this staggers the opening cascade).
  `retry` is false everywhere except group 5.
- **applyActions** — each action updates the task, sets `since = tick` if the status changed,
  recomputes zone, sets `confidence[taskId] = p`, and appends one `RoutingEdge`
  (`from` = zone before, `to` = zone after, fields copied from the action, label per §5.3):

| action | effect on task |
|---|---|
| assign | status `queued`, agent = action.agent, blockedBy [], holdKey null (starts in startAssigned) |
| hold | status `blocked`, agent null, blockedBy = unfinishedDeps (if empty: running tasks sharing a file; else []), holdKey = holdKeyOf |
| pause | status `blocked`, agent kept, progress kept, blockedBy = unfinishedDeps, holdKey = holdKeyOf |
| continue | no change (edge from = to) |
| resume | status `queued` (agent kept), blockedBy [], holdKey null |
| reroute | status `queued`, stage `investigate`, progress 0, agent `research` |
| retry | status `retrying`, stage `build`, progress 0, attempt + 1 (agent kept) |
| escalate | status `escalated`, agent null |
| review | status `review`, stage `review`, progress 0, agent null (→ holding) |
| land | status `done`, agent null |

- **startAssigned**: for each agent in `AGENT_IDS` order that is idle (agentsOf): worker → the
  first task (spec order) with status `queued` and that agent becomes `running` (startedAt set on
  first start, progress kept); review → the `review` task with agent null and the smallest
  `since` (tie: spec order) gets agent `review`, progress 0. Paused (`blocked`) tasks never occupy
  a gate. Capacity is one task per agent.
- **visibleEdges**: the latest edge per task (spec order), dropping edges of tasks that are
  `done` when `edge.tick < state.tick - ttlTicks` (default EDGE_TTL_TICKS).

### 4.3 Jev layer — `src/jev/*` (WP-02)
The Jev layer must **not** import `src/domain/engine.ts` (only types), so it builds in parallel.
```ts
// src/jev/questions.ts — built with choice/noul/score from @jib/jev
export const AGENT_CRITERIA: Record<WorkerKind, string>;
export const ASSIGNEE: ChoiceQuestion;      // choice over frontend|backend|tests|research
export const PARALLEL_SAFE: NoulQuestion;
export const ON_FAILURE: ChoiceQuestion;    // labels in this order: retry, research, escalate
export const BLOCKED: NoulQuestion;
export const RISK: ScoreQuestion;           // 4 levels: trivial, low, medium, high
export function questionsFor(kind: DecisionKind): Questions;
//   dispatch → { assignee: ASSIGNEE, parallelSafe: PARALLEL_SAFE }
//   failure  → { onFailure: ON_FAILURE }
//   impact   → { blocked: BLOCKED }
//   completion → { risk: RISK }

// src/jev/state.ts
export function toJevState(state: TowerState, need: DecisionNeed): JevState;
export function buildRequest(state: TowerState, need: DecisionNeed): SystemOneRequest;
//   → { state: toJevState(state, need), questions: questionsFor(need.kind) }

// src/jev/policy.ts
export const POLICY: {
  assignMinP: 0.5; parallelMinP: 0.6; blockedMinP: 0.5;
  reviewMinP: 0.5; failureMinP: 0.45; maxAttempts: 3;
};
export function interpret(
  state: TowerState, need: DecisionNeed,
  answers: SystemOneResult<Questions>["answers"], decisionId: string | null,
): RoutingAction[];
export function fallbackActions(state: TowerState, need: DecisionNeed): RoutingAction[];

// src/jev/resolvers.ts
export const DEFAULT_SEED = 7;
export const atcResolvers: Record<string, Resolver<JevState>>;
export function createAtcProvider(options?: { seed?: number }): JevProvider; // kind "simulated"

// src/jev/decide.ts
export function decideNeed(
  jev: Jev, state: TowerState, need: DecisionNeed,
): Promise<{ actions: RoutingAction[]; record: DecisionRecord | null }>;
```
- **toJevState**: `focus` from need; `tasks` = JevTaskView per task (progress = current-stage
  progress / stage length, rounded to 2 decimals; stage length = work, INVESTIGATE 8, REVIEW 10 —
  hard-code 8/10, do not import engine); `agentStatus` per §4.2 agentsOf rule (computed locally);
  `tokenBudget.remaining = total − used`; `changedFiles` = files of tasks with startedAt ≠ null;
  `blockedBy` only for tasks with a non-empty list; the other keys copied.
- **decideNeed**: `jev.decide(need.kind, buildRequest(...), { tags: { task: need.taskId, tick: String(state.tick) } })`
  → `interpret(..., record.id)`. If the provider throws: `fallbackActions` and `record: null`.
- **app/api/jev/route.ts** (WP-02):
  `export const POST = createJevRouteHandler(resolveServerProvider(createAtcProvider()));`
  (live TypeSafe Jev when `TYPESAFE_API_KEY` is set and `JEV_MODE` ≠ `simulated`).

### 4.4 Scenario — `src/scenario/*` (WP-04)
```ts
// src/scenario/config.ts
export const TICK_MS = 500;
export const TICKS = 60;
export const DURATION_MS = 30_000;
export const SCENARIO: ScenarioSpec;  // table below
export { DEFAULT_SEED } from "@/jev/resolvers";

// src/scenario/captions.ts
export const INTRO_CAPTION: string;
export function captionForAction(action: RoutingAction, state: TowerState, answers: SystemOneResult<Questions>["answers"] | null): { text: string; priority: number } | null;
export function captionForEvent(event: TowerEvent, state: TowerState): { text: string; priority: number } | null;
export function summaryCaption(state: TowerState): string;

// src/scenario/run.ts
export function runScenario(options?: {
  seed?: number; provider?: JevProvider; spec?: ScenarioSpec; ticks?: number; tickMs?: number;
}): Promise<ScenarioRun>;

// src/scenario/params.ts
export function parsePlayerParams(
  sp: Record<string, string | string[] | undefined>,
): { initialT: number; autoplay: boolean };  // t clamped to [0, DURATION_MS], NaN → 0; autoplay iff "1"
```
**SCENARIO** (spec order matters):

| id | title | kind | work | files | faults |
|---|---|---|---|---|---|
| `api-orders` | POST /orders endpoint | backend | 12 | api/orders.ts, db/schema.sql | attempt 1, atUnit 11, `logic`, "duplicate key on POST /orders" |
| `pricing-tests` | Pricing unit tests | tests | 22 | src/pricing/pricing.test.ts | — |
| `idempotency-research` | Idempotency key strategy | research | 8 | docs/idempotency.md | — |
| `checkout-ui` | Checkout form | frontend | 14 | app/checkout/page.tsx, components/CheckoutForm.tsx | — |
| `e2e-checkout` | Checkout e2e test | tests | 10 | e2e/checkout.spec.ts | — |

Dependencies: `checkout-ui` on `api-orders` (**contract**); `e2e-checkout` on `api-orders`
(**hard**); `e2e-checkout` on `checkout-ui` (**hard**). tokenBudget 150 000.

**runScenario** (seed default DEFAULT_SEED, provider default `createAtcProvider({ seed })`):
virtual clock (`createVirtualClock` from `@jib/demo-kit`), `createJev({ provider, now: clock.now })`.
Frame 0 = initial state with `INTRO_CAPTION`. For k = 1…ticks: `clock.advanceTo(k * tickMs)`;
(1) `advanceWork`; (2) `needs = decisionsNeeded(state, events)`; for each need in order:
`decideNeed` on the **current** state (earlier decisions of the same tick already applied),
`applyActions`; (3) `startAssigned`; frame k = `{ tick, t, state, agents: agentsOf, edges:
visibleEdges, caption, decisionIds }`. Caption of tick k = highest-priority item among that
tick's events and actions (ties: first processed); at tick `ticks − 2` it is
`summaryCaption(state)`; otherwise carried over from tick k−1. `records = jev.log.records`.
The whole run is a pure function of (seed, spec): same inputs ⇒ deep-equal output.

**Captions** (`pct(p)` = `Math.round(p*100) + "%"`), highest priority first:

| # | source | text |
|---|---|---|
| 1 | failure action (reroute / retry / escalate) | `Jev: retry {P(retry)} · research {P(research)} → reroute {task} to Research` / `Jev: retry {task} ({p})` / `Jev: escalate {task} to a human ({p})` |
| 2 | `failed` event | `✗ {task} failed on {agent} — {message}` |
| 3 | pause | `Jev: pause {task} — blocked by {blockedBy joined ", "} ({p})` |
| 4 | assign with retry | `↻ {task} loops back to {agent} · attempt {attempt} ({p})` |
| 5 | `investigated` event | `Research diagnosed {task} → retrying` |
| 6 | resume | `Jev: resume {task} ({p} not blocked)` |
| 7 | review | `Jev: {task} → review holding ({p} risky)` |
| 8 | `landed` event | `✓ {task} landed after review` |
| 9 | land | `✓ {task} landed · no review needed ({p})` |
| 10 | hold | `Jev: hold {task} — waits for {blockedBy joined ", "} ({p})` |
| 11 | assign | `Jev: {task} → {agent} ({p})` |
| — | continue, `finished` | no caption |

`INTRO_CAPTION` = `5 tasks on approach · agents do the work, Jev decides how it moves`.
`summaryCaption` = `{done} landed · {running} in flight · {failureCount} failure absorbed · {escalated} humans paged`.

### 4.5 UI — `src/components/*` (WP-03)
UI imports only **types** from `src/domain/types.ts` plus `@jib/ui` / `@jib/demo-kit` / `@jib/jev`
— never engine, jev-layer or scenario code — so it builds and unit-tests against fixtures.
```ts
// src/components/selectors.ts (pure)
export function frameAt(run: ScenarioRun, t: number): TowerFrame;  // frames[clamp(floor(t / tickMs))]
export function createTowerTimeline(run: ScenarioRun): Timeline<TowerFrame>;
//   createTimeline({ initial: () => frames[0], beats: frames.map((f, k) => ({ at: k * tickMs, label: f.caption, apply: () => f })), duration: run.duration })
export function recordsUpTo(run: ScenarioRun, t: number): DecisionRecord[];      // record.at <= t
export function spotlightRecord(run: ScenarioRun, t: number): DecisionRecord | undefined;
//   among records with the greatest `at` <= t: priority failure > completion > impact > dispatch; ties → last
export function summarizeRecord(record: DecisionRecord): string;
//   per answer, joined " · ": choice `name=label pct(P(label))`; noul `name=yes|no pct(max(p,1-p))`; score `name=score.toFixed(1)`
export function pct(p: number): string;

// src/components/layout.ts (pure)
export const CANVAS: { width: 960; height: 600 };
export const HOLD_PERIOD_MS = 4000;
export function zoneAnchor(zone: Zone): { x: number; y: number };
export function cardPosition(frame: TowerFrame, taskId: TaskId, t: number): { x: number; y: number };

// (ReactElement from "react")
// src/components/TowerCanvas.tsx
export function TowerCanvas(props: { frame: TowerFrame; t: number }): ReactElement;
// src/components/DecisionSpotlight.tsx
export function DecisionSpotlight(props: { record: DecisionRecord | undefined }): ReactElement;
export function SharedStatePanel(props: { record: DecisionRecord | undefined }): ReactElement;
// src/components/ControlTower.tsx ("use client")
export function ControlTower(props: { run: ScenarioRun; initialT?: number; autoplay?: boolean }): ReactElement;
```

### 4.6 Page — `app/page.tsx` (WP-04)
Async server component: `const sp = await searchParams; const run = await runScenario();`
`parsePlayerParams(sp)` → `<DemoShell title hook badge={`Jev · ${run.provider}`}><ControlTower run initialT autoplay /></DemoShell>`.
The page always uses the simulated provider (reproducible recording); the live swap is the route.

## 5. Jev decisions
| Decision (`record.name`) | Question (name · type) | Options / scale | Inputs (state) | Consumer |
|---|---|---|---|---|
| `dispatch` | `assignee` · choice | frontend, backend, tests, research (AGENT_CRITERIA descriptions) | focus task kind, agentStatus, tasks | assign / fallback |
| `dispatch` | `parallelSafe` · noul | yes = safe to start now | dependencies, blockedBy, changedFiles | assign vs hold |
| `failure` | `onFailure` · choice | retry, research, escalate | recentFailures, attempt | reroute / retry / escalate |
| `impact` | `blocked` · noul | yes = pause | dependencies, recentFailures, changedFiles | pause / continue / resume |
| `completion` | `risk` · score | 0 trivial · 1 low · 2 medium · 3 high | kind, attempt, recentFailures, dependencies | review vs land |

Suggested instructions (implementer may polish wording, not structure):
`assignee`: "Which agent should execute the focus task next?" ·
`parallelSafe`: "Can the focus task start now, in parallel with the work in flight, without waiting for its unfinished dependencies?" ·
`onFailure`: "The focus task just failed. What should happen next?" (retry: re-run the same agent as-is; research: send to Research to diagnose, then retry with its findings; escalate: stop and page a human) ·
`blocked`: "Is the focus task blocked by an unfinished or broken dependency?" ·
`risk`: "How risky is merging the focus task without review?" (trivial: docs/research only; low: isolated tests or leaf code; medium: shared code or API contract; high: data/payment path or previously failing code).

### 5.1 Policy (`interpret`, thresholds in `POLICY`)
- dispatch: agent = `assignee.choice` if `P(choice) ≥ 0.5`, else the task's `kind` (fallback true).
  If `parallelSafe.noul ≥ 0.6` → `assign` (p = P(agent), retry = need.retry), else `hold`
  (p = 1 − noul).
- failure: if `task.attempt ≥ maxAttempts` → `escalate` (fallback true, p = P(escalate)). Else if
  `P(choice) < 0.45` → `escalate` (fallback true). Else choice `research` → `reroute`, `retry` →
  `retry`, `escalate` → `escalate`; p = P(choice).
- impact: `blocked.noul ≥ 0.5` → `pause` (p = noul; on an already-paused task this just refreshes
  blockedBy/holdKey, so it is not re-asked every tick); else task `blocked` (paused) → `resume`,
  otherwise `continue`; p = 1 − noul. (A re-asked `hold` likewise refreshes holdKey.)
- completion: `pRisky = P(2) + P(3)`; ≥ 0.5 → `review` (p = pRisky) else `land` (p = 1 − pRisky).
- `fallbackActions` (provider error; all `fallback: true`, `decisionId: null`, p 0):
  dispatch → assign kind agent if no unfinished deps else hold; failure → escalate;
  impact → pause if a dependency is failed/retrying/investigating, else continue/resume;
  completion → review.

### 5.2 Simulated resolvers (`atcResolvers`, read `JevState`) — scripted, deterministic
- `assignee`: preferred = focus task `kind`; P(preferred) = `0.80 + 0.12 * noise()`; the other
  three share the rest equally. (The only noise; it makes the seed matter.)
- `parallelSafe`: unfinished = deps of focus not `done`. None → **0.94**; any unfinished dep
  broken (status failed / retrying / escalated or stage investigate) → **0.05**; all unfinished
  deps `contract` → **0.72**; else **0.12**.
- `blocked`: a dep of focus broken → **0.91**; else a dep in `review` → **0.22**; else focus
  shares a file with a task in `recentFailures` that is not done → **0.55**; else **0.04**.
- `risk` (weights for levels 0–3): focus attempt ≥ 2 or in recentFailures → **[.02,.08,.30,.60]**;
  kind research → **[.70,.22,.06,.02]**; kind tests → **[.45,.40,.12,.03]**; has any dependency →
  **[.05,.20,.45,.30]**; else **[.30,.40,.20,.10]**.
- `onFailure` [retry, research, escalate]: focus attempt ≥ 2 → **[.08,.22,.70]**; latest failure of
  focus is `flaky` → **[.78,.15,.07]**; else → **[.18,.76,.06]**.

### 5.3 Edge labels
assign `"{agent} {pct}"` (retry: `"retry → {agent} {pct}"`) · hold `"hold {pct}"` · pause
`"pause {pct}"` · continue `"continue {pct}"` · resume `"resume {pct}"` · reroute
`"research {pct}"` · retry `"retry {pct}"` · escalate `"human {pct}"` · review `"review {pct}"` ·
land `"land {pct}"`. `pct` as in §4.4.

## 6. UI
Viewport 1440×900, dark theme (`@jib/ui/styles.css` tokens). `DemoShell` header (title, hook,
badge `Jev · simulated`). Main grid: tower canvas (left, 960×600 logical, SVG lanes/edges +
absolutely-positioned HTML cards recommended) · sidebar 420 px (Latest decision → Shared state →
Decision log) · `ScenarioControls` below the canvas. Big caption overlay on the canvas.

Canvas layout: **Approach** strip on the left (queued/held cards stacked); **Jev tower** in the
center (radar sweep angle = f(t)); worker **gates** across the top (frontend, backend, tests,
research); **Review gate** bottom-right with an elliptical **holding pattern** next to it (cards
orbit, angle = 2π·t/HOLD_PERIOD_MS + i·2π/n — a function of t, so `?t=` frames are stable);
**Runway** (landed) along the bottom; small **Human** pad bottom-left. Cards move with a CSS
transform transition (~400 ms). Routing edges are curves from `from` to `to` anchors with a label
badge at the midpoint (from = to → badge on the card); retry edges curve back (retry-loop graphic).
Dependency lanes: dashed line dependent → prerequisite, red when blocked, green when done.
Card: id, title, progress bar (current stage), status chip, `↻2` when attempt ≥ 2, red flash when
failed. Colors: ok = done/continue, warn = hold/review, danger = failed/pause, info = running.

`data-testid` contract (tests use only these):

| testid | element | attributes |
|---|---|---|
| `tower` | canvas root | `data-tick` |
| `tower-caption` | caption overlay | text = frame.caption |
| `gate-{agentId}` ×5 | gate | `data-status` idle/busy, `data-task` (id or "") |
| `task-{taskId}` ×5 | card | `data-status`, `data-zone`, `data-agent` (id or ""), `data-stage`, `data-attempt` |
| `route-edge` | one per `frame.edges` | `data-task`, `data-kind`, `data-action`, `data-from`, `data-to`, `data-retry`, `data-fallback`, `data-p` (p.toFixed(2)); text = label |
| `dependency-lane-{task}-{on}` | lane | `data-state` done (on is done) / blocked (task blocked and on ∈ blockedBy) / active |
| `holding-pattern` | orbit | `data-count` = review tasks with agent null |
| `retry-loop` | graphic | rendered iff a frame edge has retry=true and its task is not done |
| `runway` | landed strip | `data-count` = done tasks |
| `pad-human` | human pad | `data-count` = escalated tasks |
| `latest-decision` | DecisionSpotlight root | `data-decision` = record.name, `data-task` = tags.task; one `ProbabilityBars` per answer (`aria-label` = question name; noul labels `yes`/`no`; score labels `trivial`/`low`/`medium`/`high`); "waiting for Jev" when undefined |
| `shared-state` | `<pre>` | pretty JSON of spotlight `record.request.state` |
| `decision-log` | `DecisionLogPanel` (items `li[data-decision]`) | uses `summarize={summarizeRecord}` (Harness request 1) |
| `scenario-toggle`, `scenario-restart`, `scenario-progress`, `scenario-caption`, `provider-badge` | from `@jib/ui` | — |

Query params: `?t=<ms>` seeks on load (paused), `?autoplay=1` plays from t (or 0).
`ControlTower` = `useScenarioPlayer(createTowerTimeline(run), { initialT, autoplay })` →
`TowerCanvas frame={player.state} t={player.t}`, `DecisionSpotlight`/`SharedStatePanel` with
`spotlightRecord(run, player.t)`, `DecisionLogPanel records={recordsUpTo(run, player.t)}`.

## 7. Demo scenario (deterministic, seed 7, tick = 500 ms, 60 ticks)
Normative for tests: statuses/zones at the listed times. Percentages marked ~ come from the
seeded `assignee` noise (always in [80%, 92%)).

| t (s) | Beat | Visible result |
|---|---|---|
| 0.0 | intro | 5 cards `queued` on approach, all gates idle; caption INTRO |
| 0.5 | d1 dispatch | `api-orders` → backend ~86%, running |
| 1.0 | d2 dispatch | `pricing-tests` → tests, running |
| 1.5 | d3 dispatch | `idempotency-research` → research, running |
| 2.0 | d4 dispatch | `checkout-ui` → frontend (parallelSafe 0.72: starts on the API contract) |
| 2.5 | d5 dispatch | `e2e-checkout` **hold 88%**, `blocked` by [api-orders, checkout-ui]; red lanes |
| 3.0 | parallel | 4 gates busy, 4 cards running |
| 5.5 | d6 completion | `idempotency-research` land 92% → runway |
| 6.0 | failure | `api-orders` `failed` at gate:backend (progress 11/12), caption `✗ api-orders failed on backend — …` |
| 6.5 | d7 failure · d8/d9 impact | bars `retry 18% · research 76% · escalate 6%`; `api-orders` → research (edge `research 76%`, investigating); `checkout-ui` **pause 91%** (blocked at gate:frontend, progress 9/14); `pricing-tests` **continue 96%** keeps running |
| 10.5 | investigated | `api-orders` `retrying` (attempt 2) at gate:research |
| 11.0 | d10 dispatch (retry) | edge `retry → backend ~%`, retry-loop visible, `api-orders` running attempt 2 |
| 12.0 | d11 completion | `pricing-tests` land 85% → runway, no review |
| 17.0 | d12 completion | `api-orders` review 90% → review gate (reviewing) |
| 17.5 | d13 impact · d14 dispatch | `checkout-ui` resume 78% → running; `e2e-checkout` re-asked: hold 88% |
| 20.0 | d15 completion | `checkout-ui` review 75% → **holding pattern** (review busy) |
| 20.5 | d16 dispatch | `e2e-checkout` hold 88% |
| 22.0 | landed · d17 dispatch | `api-orders` done; review gate takes `checkout-ui`; `e2e-checkout` hold 88% |
| 27.0 | landed · d18 dispatch | `checkout-ui` done; `e2e-checkout` → tests ~%, running |
| 29.0 | summary | caption `4 landed · 1 in flight · 1 failure absorbed · 0 humans paged` |
| 30.0 | end | 4 on runway, `e2e-checkout` running (6/10), human pad 0; 18 decision records |

## 8. Out of scope
Real LLM agents or real code changes · live Jev in the UI (route only) · auth, persistence,
multi-user · editing tasks / custom scenarios / seed picker in the UI · review rejection loop ·
token-budget-driven decisions · mobile layout · sound · more than one scripted failure.

## 9. Harness requests
1. `@jib/ui` `DecisionLogPanel`: add optional prop `summarize?: (record: DecisionRecord) => string`
   (default: current `summarize`). The default prints the entropy `confidence` for choices
   (`onFailure=research 38%`), which contradicts the `76%` edge; this app passes
   `summarizeRecord`. Non-breaking; add a unit test in `packages/ui`.
2. Contract stubs: `src/domain/types.ts` is copied **complete** from §4.1 (types, `AGENT_IDS`,
   `WORKER_KINDS`) so WP-02/WP-03 can build against it in wave 1. `src/components/tower.css`
   may start empty.

## 10. Content plan
- **Record:** `pnpm --filter @jib-app/jev-agent-atc build && pnpm --filter @jib-app/jev-agent-atc start`,
  open `http://localhost:3101/?autoplay=1` at 1440×900, record 30 s. Stills: `?t=2500`
  (hold + lanes), `?t=6500` (the re-route), `?t=11000` (retry loop), `?t=21000` (holding pattern).
- **Post:** "I stopped letting my AI agents decide what to do next. Jev does it for them. 5 agents,
  1 control tower: every routing move is a typed question with a probability on it. Backend fails →
  retry 18%, research 76% → the board re-routes itself."
- **Thread:** (1) the 5 question types table · (2) the JSON shared state Jev sees (screenshot of
  the Shared state panel) · (3) thresholds + fallbacks = no hidden prompt logic · (4) simulated
  first, live System One via one route.

## Changelog
- 2026-09-25 — initial spec (spec-writer).
