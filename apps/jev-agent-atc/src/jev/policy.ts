/**
 * Policy: Jev answers → routing actions (SPEC §5.1).
 * Pure and deterministic; thresholds live in `POLICY`, so no routing logic hides in prompts.
 */
import {
  type Question,
  type Questions,
  type ResultFor,
  round,
  type SystemOneResult,
} from "@jib/jev";
import {
  type DecisionNeed,
  type RoutingAction,
  type RoutingActionType,
  type Task,
  type TowerState,
  WORKER_KINDS,
  type WorkerKind,
} from "@/domain/types";

export const POLICY: {
  assignMinP: 0.5;
  parallelMinP: 0.6;
  blockedMinP: 0.5;
  reviewMinP: 0.5;
  failureMinP: 0.45;
  maxAttempts: 3;
} = {
  assignMinP: 0.5,
  parallelMinP: 0.6,
  blockedMinP: 0.5,
  reviewMinP: 0.5,
  failureMinP: 0.45,
  maxAttempts: 3,
};

type Answers = SystemOneResult<Questions>["answers"];
type Answer = ResultFor<Question>;
type ChoiceAnswer = Extract<Answer, { type: "choice" }>;
type NoulAnswer = Extract<Answer, { type: "noul" }>;
type ScoreAnswer = Extract<Answer, { type: "score" }>;

type Base = { taskId: string; kind: DecisionNeed["kind"]; decisionId: string | null };

function action(
  base: Base,
  type: Exclude<RoutingActionType, "assign">,
  p: number,
  fallback: boolean,
): RoutingAction {
  return {
    type,
    taskId: base.taskId,
    kind: base.kind,
    p: round(p),
    decisionId: base.decisionId,
    fallback,
  };
}

function assign(
  base: Base,
  agent: WorkerKind,
  retry: boolean,
  p: number,
  fallback: boolean,
): RoutingAction {
  return {
    type: "assign",
    agent,
    retry,
    taskId: base.taskId,
    kind: base.kind,
    p: round(p),
    decisionId: base.decisionId,
    fallback,
  };
}

function taskOf(state: TowerState, taskId: string): Task | undefined {
  return state.tasks.find((t) => t.id === taskId);
}

/** Dependencies of `taskId` whose prerequisite is not done (dependency order). */
function unfinishedDeps(state: TowerState, taskId: string): Task[] {
  const out: Task[] = [];
  for (const d of state.dependencies) {
    if (d.task !== taskId) continue;
    const on = taskOf(state, d.on);
    if (on && on.status !== "done") out.push(on);
  }
  return out;
}

function isWorker(x: string): x is WorkerKind {
  return (WORKER_KINDS as string[]).includes(x);
}

function choiceP(answer: ChoiceAnswer, label: string): number {
  return (answer.probabilities as Readonly<Record<string, number>>)[label] ?? 0;
}

function asChoice(a: Answer | undefined): ChoiceAnswer | null {
  return a?.type === "choice" ? a : null;
}
function asNoul(a: Answer | undefined): NoulAnswer | null {
  return a?.type === "noul" ? a : null;
}
function asScore(a: Answer | undefined): ScoreAnswer | null {
  return a?.type === "score" ? a : null;
}

export function interpret(
  state: TowerState,
  need: DecisionNeed,
  answers: SystemOneResult<Questions>["answers"],
  decisionId: string | null,
): RoutingAction[] {
  const base: Base = { taskId: need.taskId, kind: need.kind, decisionId };
  const task = taskOf(state, need.taskId);
  const a = answers as Answers;
  // Malformed/missing answers (e.g. an unexpected live response): rule-based action, still linked
  // to the decision record.
  const degraded = () => fallbackActions(state, need).map((x) => ({ ...x, decisionId }));
  if (!task) return [];

  switch (need.kind) {
    case "dispatch": {
      const assignee = asChoice(a.assignee);
      const parallel = asNoul(a.parallelSafe);
      if (!assignee || !parallel) return degraded();
      const pChoice = choiceP(assignee, assignee.choice);
      const follow = pChoice >= POLICY.assignMinP && isWorker(assignee.choice);
      const agent: WorkerKind = follow ? (assignee.choice as WorkerKind) : task.kind;
      if (parallel.noul >= POLICY.parallelMinP) {
        return [assign(base, agent, need.retry, choiceP(assignee, agent), !follow)];
      }
      return [action(base, "hold", 1 - parallel.noul, false)];
    }
    case "failure": {
      const onFailure = asChoice(a.onFailure);
      if (!onFailure) return degraded();
      const pEscalate = choiceP(onFailure, "escalate");
      if (task.attempt >= POLICY.maxAttempts) return [action(base, "escalate", pEscalate, true)];
      const pChoice = choiceP(onFailure, onFailure.choice);
      if (pChoice < POLICY.failureMinP) return [action(base, "escalate", pEscalate, true)];
      if (onFailure.choice === "research") return [action(base, "reroute", pChoice, false)];
      if (onFailure.choice === "retry") return [action(base, "retry", pChoice, false)];
      if (onFailure.choice === "escalate") return [action(base, "escalate", pChoice, false)];
      return [action(base, "escalate", pEscalate, true)];
    }
    case "impact": {
      const blocked = asNoul(a.blocked);
      if (!blocked) return degraded();
      if (blocked.noul >= POLICY.blockedMinP) return [action(base, "pause", blocked.noul, false)];
      const type = task.status === "blocked" ? "resume" : "continue";
      return [action(base, type, 1 - blocked.noul, false)];
    }
    case "completion": {
      const risk = asScore(a.risk);
      if (!risk) return degraded();
      const probs = risk.probabilities as Readonly<Record<string, number>>;
      const pRisky = (probs["2"] ?? 0) + (probs["3"] ?? 0);
      if (pRisky >= POLICY.reviewMinP) return [action(base, "review", pRisky, false)];
      return [action(base, "land", 1 - pRisky, false)];
    }
  }
}

/** A dependency is "broken" for the impact fallback when it failed, is retrying or investigating. */
function isBrokenForFallback(t: Task): boolean {
  return t.status === "failed" || t.status === "retrying" || t.stage === "investigate";
}

export function fallbackActions(state: TowerState, need: DecisionNeed): RoutingAction[] {
  const base: Base = { taskId: need.taskId, kind: need.kind, decisionId: null };
  const task = taskOf(state, need.taskId);
  if (!task) return [];
  switch (need.kind) {
    case "dispatch":
      return unfinishedDeps(state, task.id).length === 0
        ? [assign(base, task.kind, need.retry, 0, true)]
        : [action(base, "hold", 0, true)];
    case "failure":
      return [action(base, "escalate", 0, true)];
    case "impact": {
      const broken = unfinishedDeps(state, task.id).some(isBrokenForFallback);
      if (broken) return [action(base, "pause", 0, true)];
      return [action(base, task.status === "blocked" ? "resume" : "continue", 0, true)];
    }
    case "completion":
      return [action(base, "review", 0, true)];
  }
}
