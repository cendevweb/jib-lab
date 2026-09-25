import { assertValidRequest, type Question } from "@jib/jev";
import { describe, expect, it } from "vitest";
import type { DecisionKind, JevState } from "@/domain/types";
import {
  AGENT_CRITERIA,
  ASSIGNEE,
  BLOCKED,
  ON_FAILURE,
  PARALLEL_SAFE,
  questionsFor,
  RISK,
} from "@/jev/questions";
import { buildRequest, toJevState } from "@/jev/state";
import { API_FAILURE, makeState, need, SPEC_DEPENDENCIES } from "./fixtures";

const KINDS: DecisionKind[] = ["dispatch", "failure", "impact", "completion"];

/** Board right after the re-route (SPEC §7, t = 6.5 s) with a few extra numbers. */
function rerouteBoard() {
  return makeState({
    tick: 14,
    tasks: {
      "api-orders": {
        status: "running",
        stage: "investigate",
        agent: "research",
        progress: 2,
        startedAt: 1,
        since: 13,
      },
      "pricing-tests": { status: "running", agent: "tests", progress: 11, startedAt: 2, since: 2 },
      "idempotency-research": { status: "done", progress: 8, startedAt: 3, since: 11 },
      "checkout-ui": {
        status: "blocked",
        agent: "frontend",
        progress: 9,
        startedAt: 4,
        blockedBy: ["api-orders"],
        holdKey: "",
        since: 13,
      },
      "e2e-checkout": {
        status: "blocked",
        blockedBy: ["api-orders", "checkout-ui"],
        holdKey: "",
        since: 5,
      },
    },
    recentFailures: [API_FAILURE],
    tokenBudget: { total: 150_000, used: 40_000 },
    confidence: { "api-orders": 0.76, "checkout-ui": 0.91, "pricing-tests": 0.96 },
  });
}

function typeOf(q: Question | undefined) {
  return q?.type;
}

describe("System One questions", () => {
  it("[AC-06] dispatch asks { assignee: choice over the 4 workers, parallelSafe: noul }", () => {
    const q = questionsFor("dispatch");
    expect(Object.keys(q)).toEqual(["assignee", "parallelSafe"]);
    expect(q.assignee).toEqual(ASSIGNEE);
    expect(q.parallelSafe).toEqual(PARALLEL_SAFE);
    expect(ASSIGNEE.type).toBe("choice");
    expect(Object.keys(ASSIGNEE.criteria).sort()).toEqual(
      ["backend", "frontend", "research", "tests"].sort(),
    );
    expect(Object.keys(AGENT_CRITERIA).sort()).toEqual(
      ["backend", "frontend", "research", "tests"].sort(),
    );
    expect(PARALLEL_SAFE.type).toBe("noul");
  });

  it("[AC-06] failure asks { onFailure: choice with labels retry, research, escalate }", () => {
    const q = questionsFor("failure");
    expect(Object.keys(q)).toEqual(["onFailure"]);
    expect(q.onFailure).toEqual(ON_FAILURE);
    expect(ON_FAILURE.type).toBe("choice");
    expect(Object.keys(ON_FAILURE.criteria)).toEqual(["retry", "research", "escalate"]);
  });

  it("[AC-06] impact asks { blocked: noul }; completion asks { risk: score with 4 levels }", () => {
    const impact = questionsFor("impact");
    expect(Object.keys(impact)).toEqual(["blocked"]);
    expect(impact.blocked).toEqual(BLOCKED);
    expect(BLOCKED.type).toBe("noul");

    const completion = questionsFor("completion");
    expect(Object.keys(completion)).toEqual(["risk"]);
    expect(completion.risk).toEqual(RISK);
    expect(RISK.type).toBe("score");
    expect(RISK.criteria).toHaveLength(4);
    const levels = ["trivial", "low", "medium", "high"];
    RISK.criteria.forEach((c, i) => {
      expect(JSON.stringify(c).toLowerCase()).toContain(levels[i]);
    });
  });

  it("[AC-06] the 5 questions use all 3 System One types and carry instructions", () => {
    const all = KINDS.flatMap((k) => Object.values(questionsFor(k)));
    expect(all).toHaveLength(5);
    expect(new Set(all.map(typeOf))).toEqual(new Set(["choice", "noul", "score"]));
    for (const q of all) expect(q.instructions).toBeTruthy();
  });
});

describe("buildRequest / toJevState", () => {
  it("[AC-06] buildRequest passes assertValidRequest for every decision kind", () => {
    const s = rerouteBoard();
    for (const kind of KINDS) {
      const req = buildRequest(s, need(kind, "checkout-ui"));
      expect(() => assertValidRequest(req)).not.toThrow();
      expect(req.questions).toEqual(questionsFor(kind));
      expect(req.state).toEqual(toJevState(s, need(kind, "checkout-ui")));
    }
    const initial = makeState({ tick: 1 });
    expect(() =>
      assertValidRequest(buildRequest(initial, need("dispatch", "api-orders"))),
    ).not.toThrow();
  });

  it("[AC-06] toJevState has `focus` plus exactly the 8 Notion shared-state keys", () => {
    const js = toJevState(rerouteBoard(), need("impact", "checkout-ui"));
    expect(Object.keys(js).sort()).toEqual(
      [
        "focus",
        "tasks",
        "dependencies",
        "agentStatus",
        "recentFailures",
        "tokenBudget",
        "changedFiles",
        "confidence",
        "blockedBy",
      ].sort(),
    );
  });

  it("[AC-06] toJevState derives task views, agent status, budget, files and blockers (§4.3)", () => {
    const expected: JevState = {
      focus: { taskId: "checkout-ui", decision: "impact", retry: false },
      tasks: [
        {
          id: "api-orders",
          title: "POST /orders endpoint",
          kind: "backend",
          status: "running",
          stage: "investigate",
          agent: "research",
          progress: 0.25,
          attempt: 1,
        },
        {
          id: "pricing-tests",
          title: "Pricing unit tests",
          kind: "tests",
          status: "running",
          stage: "build",
          agent: "tests",
          progress: 0.5,
          attempt: 1,
        },
        {
          id: "idempotency-research",
          title: "Idempotency key strategy",
          kind: "research",
          status: "done",
          stage: "build",
          agent: null,
          progress: 1,
          attempt: 1,
        },
        {
          id: "checkout-ui",
          title: "Checkout form",
          kind: "frontend",
          status: "blocked",
          stage: "build",
          agent: "frontend",
          progress: 0.64,
          attempt: 1,
        },
        {
          id: "e2e-checkout",
          title: "Checkout e2e test",
          kind: "tests",
          status: "blocked",
          stage: "build",
          agent: null,
          progress: 0,
          attempt: 1,
        },
      ],
      dependencies: SPEC_DEPENDENCIES,
      agentStatus: {
        frontend: "idle",
        backend: "idle",
        tests: "busy",
        research: "busy",
        review: "idle",
      },
      recentFailures: [API_FAILURE],
      tokenBudget: { total: 150_000, used: 40_000, remaining: 110_000 },
      changedFiles: {
        "api-orders": ["api/orders.ts", "db/schema.sql"],
        "pricing-tests": ["src/pricing/pricing.test.ts"],
        "idempotency-research": ["docs/idempotency.md"],
        "checkout-ui": ["app/checkout/page.tsx", "components/CheckoutForm.tsx"],
      },
      confidence: { "api-orders": 0.76, "checkout-ui": 0.91, "pricing-tests": 0.96 },
      blockedBy: {
        "checkout-ui": ["api-orders"],
        "e2e-checkout": ["api-orders", "checkout-ui"],
      },
    };
    expect(toJevState(rerouteBoard(), need("impact", "checkout-ui"))).toEqual(expected);
  });

  it("[AC-06] review progress uses a stage length of 10 and focus carries retry", () => {
    const s = makeState({
      tick: 37,
      tasks: {
        "api-orders": { status: "review", stage: "review", agent: "review", progress: 3 },
        "pricing-tests": { status: "retrying", agent: "research", attempt: 2, progress: 0 },
      },
    });
    const js = toJevState(s, need("dispatch", "pricing-tests", true));
    expect(js.focus).toEqual({ taskId: "pricing-tests", decision: "dispatch", retry: true });
    expect(js.tasks[0]?.progress).toBe(0.3);
    expect(js.agentStatus.review).toBe("busy");
    expect(js.agentStatus.research).toBe("idle");
    expect(js.changedFiles).toEqual({});
    expect(js.blockedBy).toEqual({});
    expect(js.tokenBudget).toEqual({ total: 150_000, used: 0, remaining: 150_000 });
  });

  it("[AC-06] toJevState does not mutate the tower state", () => {
    const s = rerouteBoard();
    const before = structuredClone(s);
    toJevState(s, need("failure", "api-orders"));
    buildRequest(s, need("dispatch", "e2e-checkout"));
    expect(s).toEqual(before);
  });
});
