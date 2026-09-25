import type { DecisionRecord, ProviderKind } from "@jib/jev";

export const AGENT_IDS = ["frontend", "backend", "tests", "research", "review"] as const;
export type AgentId = (typeof AGENT_IDS)[number];
/** Agents that execute build/investigate work (everything but review). */
export type WorkerKind = Exclude<AgentId, "review">;
export const WORKER_KINDS: WorkerKind[] = ["frontend", "backend", "tests", "research"];

export type TaskId = string;
export type TaskStatus =
  | "queued"
  | "running"
  | "blocked"
  | "review"
  | "failed"
  | "retrying"
  | "done"
  | "escalated";
export type Stage = "build" | "investigate" | "review";
export type Zone = "approach" | `gate:${AgentId}` | "holding" | "landed" | "human";

export type DependencyKind = "contract" | "hard";
/** `task` depends on `on`. */
export type Dependency = { task: TaskId; on: TaskId; kind: DependencyKind };

export type FailureKind = "logic" | "flaky";
/** Scripted fault: on `attempt`, the build stage fails when progress reaches `atUnit`. */
export type FaultSpec = { attempt: number; atUnit: number; kind: FailureKind; message: string };

export type TaskSpec = {
  id: TaskId;
  title: string;
  kind: WorkerKind;
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
  id: TaskId;
  title: string;
  kind: WorkerKind;
  work: number;
  files: string[];
  faults: FaultSpec[];
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
  taskId: TaskId;
  agent: AgentId;
  attempt: number;
  kind: FailureKind;
  message: string;
  tick: number;
};

export type AgentState = { id: AgentId; status: "idle" | "busy"; taskId: TaskId | null };

export type DecisionKind = "dispatch" | "failure" | "impact" | "completion";
export type DecisionNeed = { kind: DecisionKind; taskId: TaskId; retry: boolean };

export type RoutingActionType =
  | "assign"
  | "hold"
  | "pause"
  | "continue"
  | "resume"
  | "reroute"
  | "retry"
  | "escalate"
  | "review"
  | "land";

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
  id: TaskId;
  title: string;
  kind: WorkerKind;
  status: TaskStatus;
  stage: Stage;
  agent: AgentId | null;
  progress: number;
  attempt: number;
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
