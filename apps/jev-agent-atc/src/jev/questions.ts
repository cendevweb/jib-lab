/**
 * The five System One questions Jev answers (SPEC §4.3, §5).
 * Labels, levels and order are contract data (SPEC §5).
 */
import {
  type ChoiceQuestion,
  choice,
  type NoulQuestion,
  noul,
  type Questions,
  type ScoreQuestion,
  score,
} from "@jib/jev";
import type { DecisionKind, WorkerKind } from "@/domain/types";

export const AGENT_CRITERIA: Record<WorkerKind, string> = {
  frontend: "Frontend agent: UI pages, components and client-side code.",
  backend: "Backend agent: API endpoints, database schema and server-side code.",
  tests: "Tests agent: unit, integration and end-to-end tests.",
  research: "Research agent: investigates, diagnoses failures and writes design notes.",
};

/** choice over frontend | backend | tests | research */
export const ASSIGNEE: ChoiceQuestion = choice(
  "Which agent should execute the focus task next?",
  AGENT_CRITERIA,
);

export const PARALLEL_SAFE: NoulQuestion = noul(
  "Can the focus task start now, in parallel with the work in flight, without waiting for its unfinished dependencies?",
);

/** labels in this order: retry, research, escalate */
export const ON_FAILURE: ChoiceQuestion = choice(
  "The focus task just failed. What should happen next?",
  {
    retry: "Re-run the same agent as-is.",
    research: "Send to Research to diagnose, then retry with its findings.",
    escalate: "Stop and page a human.",
  },
);

export const BLOCKED: NoulQuestion = noul(
  "Is the focus task blocked by an unfinished or broken dependency?",
);

/** 4 levels: trivial, low, medium, high */
export const RISK: ScoreQuestion = score("How risky is merging the focus task without review?", [
  "trivial: docs/research only",
  "low: isolated tests or leaf code",
  "medium: shared code or API contract",
  "high: data/payment path or previously failing code",
]);

/** The questions asked for each decision kind (`dispatch` carries two in one request). */
export function questionsFor(kind: DecisionKind): Questions {
  switch (kind) {
    case "dispatch":
      return { assignee: ASSIGNEE, parallelSafe: PARALLEL_SAFE };
    case "failure":
      return { onFailure: ON_FAILURE };
    case "impact":
      return { blocked: BLOCKED };
    case "completion":
      return { risk: RISK };
  }
}
