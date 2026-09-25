import { describe, expect, it } from "vitest";
import type { RoutingAction } from "@/domain/types";
import { fallbackActions, interpret, POLICY } from "@/jev/policy";
import { API_FAILURE, choiceAnswer, makeState, need, noulAnswer, scoreAnswer } from "./fixtures";

const workers = (p: Partial<Record<"frontend" | "backend" | "tests" | "research", number>>) =>
  choiceAnswer({ frontend: 0, backend: 0, tests: 0, research: 0, ...p });

function only(actions: RoutingAction[]): RoutingAction {
  expect(actions).toHaveLength(1);
  const [a] = actions;
  if (!a) throw new Error("no action");
  return a;
}

/** Scenario-like board: api-orders failed, checkout-ui running on the contract, e2e held. */
const board = (overrides: Parameters<typeof makeState>[0] = {}) =>
  makeState({
    tick: 13,
    tasks: {
      "api-orders": { status: "failed", agent: "backend", progress: 11, since: 12 },
      "pricing-tests": { status: "running", agent: "tests", progress: 11 },
      "checkout-ui": { status: "running", agent: "frontend", progress: 9 },
      "e2e-checkout": { status: "blocked", blockedBy: ["api-orders", "checkout-ui"], holdKey: "" },
    },
    recentFailures: [API_FAILURE],
    ...overrides,
  });

describe("POLICY", () => {
  it("[AC-07] exposes the SPEC §4.3 thresholds", () => {
    expect(POLICY).toEqual({
      assignMinP: 0.5,
      parallelMinP: 0.6,
      blockedMinP: 0.5,
      reviewMinP: 0.5,
      failureMinP: 0.45,
      maxAttempts: 3,
    });
  });
});

describe("interpret — dispatch", () => {
  const s = makeState({ tick: 1 });

  it("[AC-07] assigns Jev's choice when P ≥ 0.5 and parallelSafe ≥ 0.6", () => {
    const a = only(
      interpret(
        s,
        need("dispatch", "api-orders"),
        { assignee: workers({ backend: 0.86, frontend: 0.14 }), parallelSafe: noulAnswer(0.94) },
        "d1",
      ),
    );
    expect(a).toEqual({
      type: "assign",
      agent: "backend",
      retry: false,
      taskId: "api-orders",
      kind: "dispatch",
      p: 0.86,
      decisionId: "d1",
      fallback: false,
    });
  });

  it("[AC-07] falls back to the task kind agent when P(choice) < 0.5", () => {
    const a = only(
      interpret(
        s,
        need("dispatch", "api-orders"),
        {
          assignee: workers({ research: 0.4, backend: 0.35, tests: 0.25 }),
          parallelSafe: noulAnswer(0.94),
        },
        "d2",
      ),
    );
    expect(a).toMatchObject({
      type: "assign",
      agent: "backend",
      fallback: true,
      p: 0.35,
      decisionId: "d2",
    });
  });

  it("[AC-07] P(choice) exactly 0.5 is enough to follow Jev", () => {
    const a = only(
      interpret(
        s,
        need("dispatch", "api-orders"),
        {
          assignee: workers({ tests: 0.5, backend: 0.3, research: 0.2 }),
          parallelSafe: noulAnswer(0.94),
        },
        "d3",
      ),
    );
    expect(a).toMatchObject({ type: "assign", agent: "tests", fallback: false, p: 0.5 });
  });

  it("[AC-07] holds when parallelSafe < 0.6 (p = 1 − noul), assigns at exactly 0.6", () => {
    const held = only(
      interpret(
        s,
        need("dispatch", "e2e-checkout"),
        { assignee: workers({ tests: 0.88, backend: 0.12 }), parallelSafe: noulAnswer(0.12) },
        "d5",
      ),
    );
    expect(held.type).toBe("hold");
    expect(held.p).toBeCloseTo(0.88, 10);
    expect(held).toMatchObject({ taskId: "e2e-checkout", kind: "dispatch", decisionId: "d5" });

    const edge = only(
      interpret(
        s,
        need("dispatch", "checkout-ui"),
        { assignee: workers({ frontend: 0.85, tests: 0.15 }), parallelSafe: noulAnswer(0.6) },
        "d4",
      ),
    );
    expect(edge).toMatchObject({ type: "assign", agent: "frontend" });

    const below = only(
      interpret(
        s,
        need("dispatch", "checkout-ui"),
        { assignee: workers({ frontend: 0.85, tests: 0.15 }), parallelSafe: noulAnswer(0.59) },
        "d4",
      ),
    );
    expect(below.type).toBe("hold");
    expect(below.p).toBeCloseTo(0.41, 10);
  });

  it("[AC-07] a retry dispatch produces an assign with retry: true", () => {
    const s2 = makeState({
      tick: 22,
      tasks: { "api-orders": { status: "retrying", agent: "research", attempt: 2, since: 21 } },
    });
    const a = only(
      interpret(
        s2,
        need("dispatch", "api-orders", true),
        { assignee: workers({ backend: 0.89, tests: 0.11 }), parallelSafe: noulAnswer(0.94) },
        "d10",
      ),
    );
    expect(a).toMatchObject({ type: "assign", agent: "backend", retry: true, p: 0.89 });
  });
});

describe("interpret — failure", () => {
  const onFailure = (retry: number, research: number, escalate: number) => ({
    onFailure: choiceAnswer({ retry, research, escalate }),
  });

  it("[AC-07] research → reroute (p = P(research))", () => {
    const a = only(
      interpret(board(), need("failure", "api-orders"), onFailure(0.18, 0.76, 0.06), "d7"),
    );
    expect(a).toEqual({
      type: "reroute",
      taskId: "api-orders",
      kind: "failure",
      p: 0.76,
      decisionId: "d7",
      fallback: false,
    });
  });

  it("[AC-07] retry → retry and escalate → escalate (p = P(choice))", () => {
    const r = only(
      interpret(board(), need("failure", "api-orders"), onFailure(0.78, 0.15, 0.07), "d7"),
    );
    expect(r).toMatchObject({ type: "retry", p: 0.78, fallback: false });
    const e = only(
      interpret(board(), need("failure", "api-orders"), onFailure(0.08, 0.22, 0.7), "d7"),
    );
    expect(e).toMatchObject({ type: "escalate", p: 0.7, fallback: false });
  });

  it("[AC-07] top P < 0.45 → escalate with fallback", () => {
    const a = only(
      interpret(board(), need("failure", "api-orders"), onFailure(0.4, 0.35, 0.25), "d7"),
    );
    expect(a).toMatchObject({ type: "escalate", fallback: true, decisionId: "d7" });
  });

  it("[AC-07] attempt ≥ 3 → escalate with fallback (p = P(escalate)) whatever Jev prefers", () => {
    const s = board({
      tasks: { "api-orders": { status: "failed", agent: "backend", attempt: 3, since: 12 } },
    });
    const a = only(interpret(s, need("failure", "api-orders"), onFailure(0.18, 0.76, 0.06), "d7"));
    expect(a).toMatchObject({ type: "escalate", fallback: true, p: 0.06 });
  });
});

describe("interpret — impact", () => {
  it("[AC-07] blocked ≥ 0.5 → pause (p = noul)", () => {
    const a = only(
      interpret(board(), need("impact", "checkout-ui"), { blocked: noulAnswer(0.91) }, "d9"),
    );
    expect(a).toEqual({
      type: "pause",
      taskId: "checkout-ui",
      kind: "impact",
      p: 0.91,
      decisionId: "d9",
      fallback: false,
    });
    const edge = only(
      interpret(board(), need("impact", "checkout-ui"), { blocked: noulAnswer(0.5) }, "d9"),
    );
    expect(edge.type).toBe("pause");
  });

  it("[AC-07] blocked < 0.5 → continue for a running task (p = 1 − noul)", () => {
    const a = only(
      interpret(board(), need("impact", "pricing-tests"), { blocked: noulAnswer(0.04) }, "d8"),
    );
    expect(a.type).toBe("continue");
    expect(a.p).toBeCloseTo(0.96, 10);
    expect(a.fallback).toBe(false);
  });

  it("[AC-07] blocked < 0.5 → resume for a paused task; ≥ 0.5 on a paused task → pause", () => {
    const s = makeState({
      tick: 35,
      tasks: {
        "api-orders": { status: "review", stage: "review", agent: "review" },
        "checkout-ui": {
          status: "blocked",
          agent: "frontend",
          blockedBy: ["api-orders"],
          holdKey: "",
        },
      },
    });
    const a = only(
      interpret(s, need("impact", "checkout-ui"), { blocked: noulAnswer(0.22) }, "d13"),
    );
    expect(a.type).toBe("resume");
    expect(a.p).toBeCloseTo(0.78, 10);
    expect(a.decisionId).toBe("d13");
    const again = only(
      interpret(s, need("impact", "checkout-ui"), { blocked: noulAnswer(0.55) }, "d13"),
    );
    expect(again).toMatchObject({ type: "pause", p: 0.55 });
  });
});

describe("interpret — completion", () => {
  it("[AC-07] P(risk ≥ 2) ≥ 0.5 → review (p = P(2) + P(3))", () => {
    const s = makeState({ tick: 34 });
    const a = only(
      interpret(
        s,
        need("completion", "api-orders"),
        { risk: scoreAnswer([0.02, 0.08, 0.3, 0.6]) },
        "d12",
      ),
    );
    expect(a.type).toBe("review");
    expect(a.p).toBeCloseTo(0.9, 10);
    expect(a).toMatchObject({ kind: "completion", decisionId: "d12", fallback: false });
    const edge = only(
      interpret(
        s,
        need("completion", "api-orders"),
        { risk: scoreAnswer([0.25, 0.25, 0.25, 0.25]) },
        "d12",
      ),
    );
    expect(edge.type).toBe("review");
  });

  it("[AC-07] P(risk ≥ 2) < 0.5 → land (p = 1 − pRisky)", () => {
    const s = makeState({ tick: 24 });
    const a = only(
      interpret(
        s,
        need("completion", "pricing-tests"),
        { risk: scoreAnswer([0.45, 0.4, 0.12, 0.03]) },
        "d11",
      ),
    );
    expect(a.type).toBe("land");
    expect(a.p).toBeCloseTo(0.85, 10);
    const research = only(
      interpret(
        s,
        need("completion", "idempotency-research"),
        { risk: scoreAnswer([0.7, 0.22, 0.06, 0.02]) },
        "d6",
      ),
    );
    expect(research.type).toBe("land");
    expect(research.p).toBeCloseTo(0.92, 10);
  });
});

describe("fallbackActions", () => {
  const flags = { fallback: true, decisionId: null, p: 0 };

  it("[AC-07] dispatch: assign the task kind agent without unfinished deps, else hold", () => {
    expect(only(fallbackActions(makeState({ tick: 1 }), need("dispatch", "api-orders")))).toEqual({
      type: "assign",
      agent: "backend",
      retry: false,
      taskId: "api-orders",
      kind: "dispatch",
      ...flags,
    });
    expect(only(fallbackActions(makeState({ tick: 5 }), need("dispatch", "e2e-checkout")))).toEqual(
      {
        type: "hold",
        taskId: "e2e-checkout",
        kind: "dispatch",
        ...flags,
      },
    );
  });

  it("[AC-07] failure → escalate; completion → review", () => {
    expect(only(fallbackActions(board(), need("failure", "api-orders")))).toEqual({
      type: "escalate",
      taskId: "api-orders",
      kind: "failure",
      ...flags,
    });
    expect(
      only(fallbackActions(makeState({ tick: 24 }), need("completion", "pricing-tests"))),
    ).toEqual({
      type: "review",
      taskId: "pricing-tests",
      kind: "completion",
      ...flags,
    });
  });

  it("[AC-07] impact: pause when a dependency is failed/retrying/investigating, else continue/resume", () => {
    expect(only(fallbackActions(board(), need("impact", "checkout-ui")))).toMatchObject({
      type: "pause",
      ...flags,
    });
    const investigating = board({
      tasks: {
        "api-orders": { status: "running", stage: "investigate", agent: "research" },
        "checkout-ui": { status: "running", agent: "frontend" },
      },
    });
    expect(only(fallbackActions(investigating, need("impact", "checkout-ui"))).type).toBe("pause");
    const retrying = board({
      tasks: {
        "api-orders": { status: "retrying", agent: "research", attempt: 2 },
        "checkout-ui": { status: "running", agent: "frontend" },
      },
    });
    expect(only(fallbackActions(retrying, need("impact", "checkout-ui"))).type).toBe("pause");
    expect(only(fallbackActions(board(), need("impact", "pricing-tests")))).toMatchObject({
      type: "continue",
      ...flags,
    });
    const reviewing = makeState({
      tick: 35,
      tasks: {
        "api-orders": { status: "review", stage: "review", agent: "review" },
        "checkout-ui": {
          status: "blocked",
          agent: "frontend",
          blockedBy: ["api-orders"],
          holdKey: "",
        },
      },
    });
    expect(only(fallbackActions(reviewing, need("impact", "checkout-ui")))).toMatchObject({
      type: "resume",
      ...flags,
    });
  });
});
