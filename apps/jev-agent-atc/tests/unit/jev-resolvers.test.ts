import { createJev, type JevProvider, type Question, type ResultFor } from "@jib/jev";
import { describe, expect, it } from "vitest";
import type { DecisionNeed, TowerState, WorkerKind } from "@/domain/types";
import { decideNeed } from "@/jev/decide";
import { fallbackActions, interpret } from "@/jev/policy";
import { atcResolvers, createAtcProvider, DEFAULT_SEED } from "@/jev/resolvers";
import { buildRequest } from "@/jev/state";
import { API_FAILURE, makeState, makeTask, need, SPEC_DEPENDENCIES, taskSpec } from "./fixtures";

type Answer = ResultFor<Question>;

async function answer(
  state: TowerState,
  n: DecisionNeed,
  question: string,
  seed = DEFAULT_SEED,
): Promise<Answer> {
  const result = await createAtcProvider({ seed }).ask(buildRequest(state, n));
  const a = result.answers[question];
  if (!a) throw new Error(`no answer for ${question}`);
  return a;
}

async function noulOf(state: TowerState, n: DecisionNeed, question: string) {
  const a = await answer(state, n, question);
  if (a.type !== "noul") throw new Error(`${question} is not noul`);
  return a.noul;
}

async function choiceOf(state: TowerState, n: DecisionNeed, question: string, seed?: number) {
  const a = await answer(state, n, question, seed);
  if (a.type !== "choice") throw new Error(`${question} is not a choice`);
  return a;
}

async function riskOf(state: TowerState, n: DecisionNeed) {
  const a = await answer(state, n, "risk");
  if (a.type !== "score") throw new Error("risk is not a score");
  const probs = a.probabilities as Readonly<Record<number, number>>;
  return { score: a.score, weights: [0, 1, 2, 3].map((i) => probs[i] ?? Number.NaN) };
}

function expectWeights(actual: number[], expected: number[]) {
  expect(actual).toHaveLength(expected.length);
  for (const [i, w] of expected.entries()) expect(actual[i]).toBeCloseTo(w, 4);
}

const failed = (attempt = 1, kind: "logic" | "flaky" = "logic") =>
  makeState({
    tick: 13,
    tasks: {
      "api-orders": {
        status: "failed",
        agent: "backend",
        progress: 11,
        attempt,
        since: 12,
        startedAt: 1,
      },
      "pricing-tests": { status: "running", agent: "tests", progress: 11, startedAt: 2 },
      "idempotency-research": { status: "done", progress: 8, startedAt: 3 },
      "checkout-ui": { status: "running", agent: "frontend", progress: 9, startedAt: 4 },
      "e2e-checkout": { status: "blocked", blockedBy: ["api-orders", "checkout-ui"], holdKey: "" },
    },
    recentFailures: [{ ...API_FAILURE, attempt, kind }],
  });

describe("createAtcProvider", () => {
  it("[AC-08] is a simulated provider seeded with DEFAULT_SEED 7 and scripts the 5 questions", () => {
    expect(DEFAULT_SEED).toBe(7);
    expect(createAtcProvider().kind).toBe("simulated");
    for (const q of ["assignee", "parallelSafe", "onFailure", "blocked", "risk"]) {
      expect(typeof atcResolvers[q]).toBe("function");
    }
  });

  it("[AC-08] onFailure for a first logic failure: retry 0.18 / research 0.76 / escalate 0.06", async () => {
    const a = await choiceOf(failed(), need("failure", "api-orders"), "onFailure");
    expect(a.choice).toBe("research");
    expect(a.probabilities.retry).toBeCloseTo(0.18, 4);
    expect(a.probabilities.research).toBeCloseTo(0.76, 4);
    expect(a.probabilities.escalate).toBeCloseTo(0.06, 4);
  });

  it("[AC-08] onFailure for a flaky failure: 0.78 / 0.15 / 0.07", async () => {
    const a = await choiceOf(failed(1, "flaky"), need("failure", "api-orders"), "onFailure");
    expect(a.choice).toBe("retry");
    expect(a.probabilities.retry).toBeCloseTo(0.78, 4);
    expect(a.probabilities.research).toBeCloseTo(0.15, 4);
    expect(a.probabilities.escalate).toBeCloseTo(0.07, 4);
  });

  it("[AC-08] onFailure at attempt ≥ 2: 0.08 / 0.22 / 0.70", async () => {
    const a = await choiceOf(failed(2), need("failure", "api-orders"), "onFailure");
    expect(a.choice).toBe("escalate");
    expect(a.probabilities.retry).toBeCloseTo(0.08, 4);
    expect(a.probabilities.research).toBeCloseTo(0.22, 4);
    expect(a.probabilities.escalate).toBeCloseTo(0.7, 4);
  });

  it("[AC-08] blocked: broken dep 0.91 · dep in review 0.22 · shared file 0.55 · else 0.04", async () => {
    // Broken dependency: api-orders failed, or investigating after the re-route.
    expect(await noulOf(failed(), need("impact", "checkout-ui"), "blocked")).toBeCloseTo(0.91, 4);
    const investigating = makeState({
      tick: 13,
      tasks: {
        "api-orders": { status: "queued", stage: "investigate", agent: "research", startedAt: 1 },
        "checkout-ui": { status: "running", agent: "frontend", progress: 9, startedAt: 4 },
      },
      recentFailures: [API_FAILURE],
    });
    expect(await noulOf(investigating, need("impact", "checkout-ui"), "blocked")).toBeCloseTo(
      0.91,
      4,
    );

    const reviewing = makeState({
      tick: 35,
      tasks: {
        "api-orders": {
          status: "review",
          stage: "review",
          agent: "review",
          attempt: 2,
          startedAt: 1,
        },
        "checkout-ui": {
          status: "blocked",
          agent: "frontend",
          progress: 9,
          startedAt: 4,
          blockedBy: ["api-orders"],
          holdKey: "",
        },
      },
      recentFailures: [API_FAILURE],
    });
    expect(await noulOf(reviewing, need("impact", "checkout-ui"), "blocked")).toBeCloseTo(0.22, 4);

    const sharing = makeState({
      tick: 13,
      taskList: [
        makeTask("api-orders", { status: "failed", agent: "backend", progress: 11, startedAt: 1 }),
        makeTask(taskSpec("migration", "backend", { files: ["db/schema.sql"] }), {
          status: "running",
          agent: "backend",
          progress: 2,
          startedAt: 2,
        }),
        makeTask("pricing-tests", { status: "running", agent: "tests", startedAt: 3 }),
      ],
      dependencies: [],
      recentFailures: [API_FAILURE],
    });
    expect(await noulOf(sharing, need("impact", "migration"), "blocked")).toBeCloseTo(0.55, 4);
    expect(await noulOf(sharing, need("impact", "pricing-tests"), "blocked")).toBeCloseTo(0.04, 4);
    expect(await noulOf(failed(), need("impact", "pricing-tests"), "blocked")).toBeCloseTo(0.04, 4);
  });

  it("[AC-08] parallelSafe: no unfinished deps 0.94 · broken 0.05 · contract only 0.72 · else 0.12", async () => {
    expect(
      await noulOf(makeState({ tick: 1 }), need("dispatch", "api-orders"), "parallelSafe"),
    ).toBeCloseTo(0.94, 4);
    const opening = makeState({
      tick: 4,
      tasks: { "api-orders": { status: "running", agent: "backend", progress: 3, startedAt: 1 } },
    });
    expect(await noulOf(opening, need("dispatch", "checkout-ui"), "parallelSafe")).toBeCloseTo(
      0.72,
      4,
    );
    expect(await noulOf(opening, need("dispatch", "e2e-checkout"), "parallelSafe")).toBeCloseTo(
      0.12,
      4,
    );
    expect(await noulOf(failed(), need("dispatch", "checkout-ui"), "parallelSafe")).toBeCloseTo(
      0.05,
      4,
    );
    const retrying = makeState({
      tick: 21,
      tasks: {
        "api-orders": { status: "retrying", agent: "research", attempt: 2, startedAt: 1 },
        "checkout-ui": { status: "running", agent: "frontend", startedAt: 4 },
      },
    });
    expect(await noulOf(retrying, need("dispatch", "e2e-checkout"), "parallelSafe")).toBeCloseTo(
      0.05,
      4,
    );
    const upstreamDone = makeState({
      tick: 54,
      tasks: {
        "api-orders": { status: "done", stage: "review", attempt: 2, startedAt: 1 },
        "checkout-ui": { status: "done", stage: "review", startedAt: 4 },
        "e2e-checkout": { status: "blocked", holdKey: "api-orders:done,checkout-ui:review" },
      },
    });
    expect(
      await noulOf(upstreamDone, need("dispatch", "e2e-checkout"), "parallelSafe"),
    ).toBeCloseTo(0.94, 4);
  });

  it("[AC-08] risk tables by case (failure history > research > tests > has deps > else)", async () => {
    const retried = makeState({
      tick: 34,
      tasks: { "api-orders": { status: "running", agent: "backend", progress: 12, attempt: 2 } },
      recentFailures: [API_FAILURE],
    });
    const r1 = await riskOf(retried, need("completion", "api-orders"));
    expectWeights(r1.weights, [0.02, 0.08, 0.3, 0.6]);
    expect(r1.score).toBeCloseTo(2.48, 4);

    const flakyTests = makeState({
      tick: 24,
      tasks: { "pricing-tests": { status: "running", agent: "tests", progress: 22 } },
      recentFailures: [{ ...API_FAILURE, taskId: "pricing-tests", agent: "tests", kind: "flaky" }],
    });
    expectWeights(
      (await riskOf(flakyTests, need("completion", "pricing-tests"))).weights,
      [0.02, 0.08, 0.3, 0.6],
    );

    const s = makeState({
      tick: 40,
      tasks: {
        "api-orders": { status: "done", stage: "review", attempt: 2 },
        "pricing-tests": { status: "running", agent: "tests", progress: 22 },
        "idempotency-research": { status: "running", agent: "research", progress: 8 },
        "checkout-ui": { status: "running", agent: "frontend", progress: 14 },
      },
      recentFailures: [API_FAILURE],
    });
    expectWeights(
      (await riskOf(s, need("completion", "idempotency-research"))).weights,
      [0.7, 0.22, 0.06, 0.02],
    );
    expectWeights(
      (await riskOf(s, need("completion", "pricing-tests"))).weights,
      [0.45, 0.4, 0.12, 0.03],
    );
    const ui = await riskOf(s, need("completion", "checkout-ui"));
    expectWeights(ui.weights, [0.05, 0.2, 0.45, 0.3]);
    expect(ui.score).toBeCloseTo(2, 4);

    const isolated = makeState({
      tick: 12,
      tasks: { "api-orders": { status: "running", agent: "backend", progress: 12 } },
      dependencies: [],
    });
    expectWeights(
      (await riskOf(isolated, need("completion", "api-orders"))).weights,
      [0.3, 0.4, 0.2, 0.1],
    );
  });

  it("[AC-08] assignee picks the task kind with P in [0.80, 0.92), the rest shared equally", async () => {
    const cases: [string, WorkerKind][] = [
      ["api-orders", "backend"],
      ["pricing-tests", "tests"],
      ["idempotency-research", "research"],
      ["checkout-ui", "frontend"],
    ];
    const seen = new Set<number>();
    for (const [taskId, kind] of cases) {
      for (let seed = 1; seed <= 12; seed++) {
        const a = await choiceOf(
          makeState({ tick: 1 }),
          need("dispatch", taskId),
          "assignee",
          seed,
        );
        expect(a.choice).toBe(kind);
        const p = a.probabilities[kind] ?? Number.NaN;
        seen.add(p);
        expect(p).toBeGreaterThanOrEqual(0.8);
        expect(p).toBeLessThan(0.92);
        const others = Object.entries(a.probabilities).filter(([k]) => k !== kind);
        expect(others).toHaveLength(3);
        for (const [, q] of others) expect(q).toBeCloseTo((1 - p) / 3, 3);
      }
    }
    // The seeded noise is what makes the seed matter.
    expect(seen.size).toBeGreaterThan(1);
  });

  it("[AC-08] identical request + seed ⇒ identical answer", async () => {
    const req = buildRequest(failed(), need("dispatch", "checkout-ui"));
    const a = await createAtcProvider({ seed: 7 }).ask(req);
    const b = await createAtcProvider({ seed: 7 }).ask(req);
    const c = await createAtcProvider().ask(req);
    expect(a).toEqual(b);
    expect(a).toEqual(c);
  });
});

describe("decideNeed", () => {
  it("[AC-08] logs one record named after the decision kind with task/tick tags", async () => {
    const jev = createJev({ provider: createAtcProvider(), now: () => 6500 });
    const state = failed();
    const n = need("failure", "api-orders");
    const { actions, record } = await decideNeed(jev, state, n);
    expect(jev.log.records).toHaveLength(1);
    if (!record) throw new Error("expected a record");
    expect(record.name).toBe("failure");
    expect(record.tags).toEqual({ task: "api-orders", tick: "13" });
    expect(record.at).toBe(6500);
    expect(record.provider).toBe("simulated");
    expect(record.request).toEqual(buildRequest(state, n));
    expect(actions).toEqual(interpret(state, n, record.result.answers, record.id));
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ type: "reroute", decisionId: record.id, fallback: false });
  });

  it("[AC-08] falls back to fallbackActions with record null when the provider throws", async () => {
    const broken: JevProvider = {
      kind: "simulated",
      ask: async () => {
        throw new Error("provider down");
      },
    };
    const jev = createJev({ provider: broken, now: () => 0 });
    const state = makeState({ tick: 5, dependencies: SPEC_DEPENDENCIES });
    for (const n of [
      need("dispatch", "e2e-checkout"),
      need("dispatch", "api-orders"),
      need("failure", "api-orders"),
      need("completion", "pricing-tests"),
    ]) {
      const out = await decideNeed(jev, state, n);
      expect(out.record).toBeNull();
      expect(out.actions).toEqual(fallbackActions(state, n));
      for (const a of out.actions) expect(a).toMatchObject({ fallback: true, decisionId: null });
    }
    expect(jev.log.records).toHaveLength(0);
  });
});
