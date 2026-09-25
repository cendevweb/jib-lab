/**
 * Tower state → what Jev sees (SPEC §4.3).
 * Must not import src/domain/engine.ts (types only), so the Jev layer builds on its own.
 */
import type { SystemOneRequest } from "@jib/jev";
import {
  AGENT_IDS,
  type AgentId,
  type DecisionNeed,
  type JevState,
  type JevTaskView,
  type Task,
  type TaskId,
  type TowerState,
} from "@/domain/types";
import { questionsFor } from "./questions";

/** Stage lengths mirrored from the engine (INVESTIGATE_TICKS / REVIEW_TICKS), hard-coded on purpose. */
const INVESTIGATE_LENGTH = 8;
const REVIEW_LENGTH = 10;

function stageLength(task: Task): number {
  if (task.stage === "investigate") return INVESTIGATE_LENGTH;
  if (task.stage === "review") return REVIEW_LENGTH;
  return task.work;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

function taskView(task: Task): JevTaskView {
  const len = stageLength(task);
  return {
    id: task.id,
    title: task.title,
    kind: task.kind,
    status: task.status,
    stage: task.stage,
    agent: task.agent,
    progress: len > 0 ? round2(task.progress / len) : 0,
    attempt: task.attempt,
  };
}

/** SPEC §4.2 agentsOf rule, computed locally (no engine import). */
function agentStatusOf(tasks: readonly Task[]): Record<AgentId, "idle" | "busy"> {
  const out = {} as Record<AgentId, "idle" | "busy">;
  for (const id of AGENT_IDS) {
    const busy = tasks.some((t) =>
      id === "review"
        ? t.status === "review" && t.agent === "review"
        : t.status === "running" && t.agent === id,
    );
    out[id] = busy ? "busy" : "idle";
  }
  return out;
}

export function toJevState(state: TowerState, need: DecisionNeed): JevState {
  const changedFiles: Record<TaskId, string[]> = {};
  const blockedBy: Record<TaskId, TaskId[]> = {};
  for (const t of state.tasks) {
    if (t.startedAt !== null) changedFiles[t.id] = [...t.files];
    if (t.blockedBy.length > 0) blockedBy[t.id] = [...t.blockedBy];
  }
  return {
    focus: { taskId: need.taskId, decision: need.kind, retry: need.retry },
    tasks: state.tasks.map(taskView),
    dependencies: state.dependencies.map((d) => ({ ...d })),
    agentStatus: agentStatusOf(state.tasks),
    recentFailures: state.recentFailures.map((f) => ({ ...f })),
    tokenBudget: {
      total: state.tokenBudget.total,
      used: state.tokenBudget.used,
      remaining: state.tokenBudget.total - state.tokenBudget.used,
    },
    changedFiles,
    confidence: { ...state.confidence },
    blockedBy,
  };
}

/** `{ state: toJevState(state, need), questions: questionsFor(need.kind) }` */
export function buildRequest(state: TowerState, need: DecisionNeed): SystemOneRequest {
  return { state: toJevState(state, need), questions: questionsFor(need.kind) };
}
