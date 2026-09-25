/**
 * Caption overlay texts (SPEC §4.4 Captions).
 * `priority`: larger wins (rank 1 in the SPEC table → 11, rank 11 → 1).
 */
import type { Questions, SystemOneResult } from "@jib/jev";
import type { RoutingAction, Task, TaskId, TowerEvent, TowerState } from "@/domain/types";

export const INTRO_CAPTION = "5 tasks on approach · agents do the work, Jev decides how it moves";

type Caption = { text: string; priority: number };
type Answers = SystemOneResult<Questions>["answers"];

/** SPEC §4.4 table rank (1 = highest) → numeric priority (larger wins). */
function rank(r: number, text: string): Caption {
  return { text, priority: 12 - r };
}

function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

function findTask(state: TowerState, taskId: TaskId): Task | undefined {
  return state.tasks.find((t) => t.id === taskId);
}

function choiceP(answers: Answers | null, question: string, label: string): number | null {
  const a = answers?.[question];
  if (a?.type !== "choice") return null;
  return a.probabilities[label] ?? 0;
}

/** Caption for one routing action; `state` is the state after the action was applied. */
export function captionForAction(
  action: RoutingAction,
  state: TowerState,
  answers: Answers | null,
): Caption | null {
  const id = action.taskId;
  const p = pct(action.p);
  const task = findTask(state, id);
  const blockedBy = (task?.blockedBy ?? []).join(", ");
  switch (action.type) {
    case "reroute": {
      const retry = choiceP(answers, "onFailure", "retry");
      const research = choiceP(answers, "onFailure", "research") ?? action.p;
      const head =
        retry === null
          ? `research ${pct(research)}`
          : `retry ${pct(retry)} · research ${pct(research)}`;
      return rank(1, `Jev: ${head} → reroute ${id} to Research`);
    }
    case "retry":
      return rank(1, `Jev: retry ${id} (${p})`);
    case "escalate":
      return rank(1, `Jev: escalate ${id} to a human (${p})`);
    case "pause":
      return rank(3, `Jev: pause ${id} — blocked by ${blockedBy} (${p})`);
    case "assign":
      if (action.retry) {
        return rank(
          4,
          `↻ ${id} loops back to ${action.agent} · attempt ${task?.attempt ?? 1} (${p})`,
        );
      }
      return rank(11, `Jev: ${id} → ${action.agent} (${p})`);
    case "resume":
      return rank(6, `Jev: resume ${id} (${p} not blocked)`);
    case "review":
      return rank(7, `Jev: ${id} → review holding (${p} risky)`);
    case "land":
      return rank(9, `✓ ${id} landed · no review needed (${p})`);
    case "hold":
      return rank(10, `Jev: hold ${id} — waits for ${blockedBy} (${p})`);
    case "continue":
      return null;
  }
}

/** Caption for one engine event (`state` = state after advanceWork). */
export function captionForEvent(event: TowerEvent, _state: TowerState): Caption | null {
  switch (event.type) {
    case "failed":
      return rank(
        2,
        `✗ ${event.taskId} failed on ${event.failure.agent} — ${event.failure.message}`,
      );
    case "investigated":
      return rank(5, `Research diagnosed ${event.taskId} → retrying`);
    case "landed":
      return rank(8, `✓ ${event.taskId} landed after review`);
    case "finished":
      return null;
  }
}

/** `{done} landed · {running} in flight · {failureCount} failure absorbed · {escalated} humans paged` */
export function summaryCaption(state: TowerState): string {
  const count = (status: Task["status"]) => state.tasks.filter((t) => t.status === status).length;
  return `${count("done")} landed · ${count("running")} in flight · ${state.failureCount} failure absorbed · ${count("escalated")} humans paged`;
}
