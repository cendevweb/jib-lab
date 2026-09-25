import { describe, expect, it } from "vitest";
import { decisionsNeeded, holdKeyOf, unfinishedDeps } from "@/domain/engine";
import type { TowerEvent } from "@/domain/types";
import { API_FAILURE, makeState, makeTask, need, taskSpec } from "./fixtures";

const failedEvent: TowerEvent = { type: "failed", taskId: "api-orders", failure: API_FAILURE };

/** Scenario-like board around the failure (SPEC §7, t = 6.0 s / 6.5 s). */
function failureBoard(tick: number) {
  return makeState({
    tick,
    tasks: {
      "api-orders": { status: "failed", agent: "backend", progress: 11, since: 12, startedAt: 1 },
      "pricing-tests": { status: "running", agent: "tests", progress: 10, since: 2, startedAt: 2 },
      "idempotency-research": { status: "done", progress: 8, since: 11, startedAt: 3 },
      "checkout-ui": { status: "running", agent: "frontend", progress: 8, since: 4, startedAt: 4 },
      "e2e-checkout": {
        status: "blocked",
        blockedBy: ["api-orders", "checkout-ui"],
        holdKey: "",
        since: 5,
      },
    },
    recentFailures: [API_FAILURE],
  });
}

describe("decisionsNeeded", () => {
  it("[AC-05] asks about a failure one tick after the `failed` event, not the same tick", () => {
    expect(decisionsNeeded(failureBoard(12), [failedEvent])).toEqual([]);
    expect(decisionsNeeded(failureBoard(13), [])).toEqual([
      need("failure", "api-orders"),
      need("impact", "pricing-tests"),
      need("impact", "checkout-ui"),
    ]);
  });

  it("[AC-05] asks impact questions only while a failure is being decided", () => {
    const calm = makeState({
      tick: 8,
      tasks: {
        "api-orders": { status: "running", agent: "backend", since: 1 },
        "pricing-tests": { status: "running", agent: "tests", since: 2 },
        "idempotency-research": { status: "running", agent: "research", since: 3 },
        "checkout-ui": { status: "running", agent: "frontend", since: 4 },
        "e2e-checkout": { status: "blocked", blockedBy: ["api-orders"], holdKey: "", since: 5 },
      },
    });
    expect(decisionsNeeded(calm, [])).toEqual([]);
  });

  it("[AC-05] impact covers running tasks and queued tasks with an agent only", () => {
    const s = makeState({
      tick: 13,
      tasks: {
        "api-orders": { status: "failed", agent: "backend", since: 12 },
        "pricing-tests": { status: "queued", agent: "tests", since: 12 },
        "idempotency-research": { status: "review", stage: "review", agent: "review", since: 11 },
        "checkout-ui": { status: "running", agent: "frontend", since: 4 },
        "e2e-checkout": { status: "blocked", blockedBy: ["api-orders"], holdKey: "", since: 5 },
      },
    });
    expect(decisionsNeeded(s, [])).toEqual([
      need("failure", "api-orders"),
      need("impact", "pricing-tests"),
      need("impact", "checkout-ui"),
    ]);
  });

  it("[AC-05] asks a completion question for every `finished` event", () => {
    const s = makeState({
      tick: 11,
      tasks: {
        "api-orders": { status: "running", agent: "backend", since: 1 },
        "pricing-tests": { status: "running", agent: "tests", since: 2 },
        "idempotency-research": { status: "running", agent: "research", progress: 8, since: 3 },
        "checkout-ui": { status: "running", agent: "frontend", since: 4 },
        "e2e-checkout": { status: "blocked", blockedBy: ["api-orders"], holdKey: "", since: 5 },
      },
    });
    expect(decisionsNeeded(s, [{ type: "finished", taskId: "idempotency-research" }])).toEqual([
      need("completion", "idempotency-research"),
    ]);
    expect(
      decisionsNeeded(s, [
        { type: "investigated", taskId: "api-orders" },
        { type: "landed", taskId: "pricing-tests" },
      ]),
    ).toEqual([]);
  });

  it("[AC-05] re-asks impact for a paused task only when its holdKey changed", () => {
    const paused = {
      status: "blocked" as const,
      agent: "frontend" as const,
      progress: 9,
      blockedBy: ["api-orders"],
      holdKey: "",
      since: 13,
    };
    const unchanged = makeState({
      tick: 34,
      tasks: {
        "api-orders": { status: "running", agent: "backend", attempt: 2, since: 22 },
        "pricing-tests": { status: "done" },
        "idempotency-research": { status: "done" },
        "checkout-ui": paused,
        "e2e-checkout": { status: "blocked", holdKey: "", blockedBy: ["api-orders"] },
      },
    });
    expect(decisionsNeeded(unchanged, [])).toEqual([]);

    const changed = makeState({
      tick: 35,
      tasks: {
        "api-orders": { status: "review", stage: "review", agent: "review", since: 34 },
        "pricing-tests": { status: "done" },
        "idempotency-research": { status: "done" },
        "checkout-ui": paused,
        "e2e-checkout": { status: "blocked", holdKey: "api-orders:review", blockedBy: [] },
      },
    });
    expect(decisionsNeeded(changed, [])).toEqual([need("impact", "checkout-ui")]);
  });

  it("[AC-05] dispatches a retrying task (retry: true) one tick after `retrying`", () => {
    const board = (tick: number) =>
      makeState({
        tick,
        tasks: {
          "api-orders": { status: "retrying", agent: "research", attempt: 2, since: 21 },
          "pricing-tests": { status: "running", agent: "tests", since: 2 },
          "idempotency-research": { status: "done" },
          "checkout-ui": { status: "blocked", agent: "frontend", holdKey: "", blockedBy: [] },
          "e2e-checkout": { status: "blocked", holdKey: "", blockedBy: [] },
        },
      });
    expect(decisionsNeeded(board(21), [{ type: "investigated", taskId: "api-orders" }])).toEqual(
      [],
    );
    expect(decisionsNeeded(board(22), [])).toEqual([need("dispatch", "api-orders", true)]);
  });

  it("[AC-05] re-asks dispatch for a held task only when its holdKey changed", () => {
    const held = (holdKey: string) =>
      makeState({
        tick: 41,
        tasks: {
          "api-orders": { status: "review", stage: "review", agent: "review", since: 34 },
          "pricing-tests": { status: "done" },
          "idempotency-research": { status: "done" },
          "checkout-ui": { status: "review", stage: "review", agent: null, since: 40 },
          "e2e-checkout": { status: "blocked", holdKey, blockedBy: ["api-orders", "checkout-ui"] },
        },
      });
    expect(decisionsNeeded(held("api-orders:review"), [])).toEqual([
      need("dispatch", "e2e-checkout"),
    ]);
    expect(decisionsNeeded(held("api-orders:review,checkout-ui:review"), [])).toEqual([]);
  });

  it("[AC-05] dispatches at most one new (queued, unassigned) task per tick, first in spec order", () => {
    expect(decisionsNeeded(makeState({ tick: 1 }), [])).toEqual([need("dispatch", "api-orders")]);
    const s = makeState({
      tick: 2,
      tasks: { "api-orders": { status: "running", agent: "backend", since: 1 } },
    });
    expect(decisionsNeeded(s, [])).toEqual([need("dispatch", "pricing-tests")]);
  });

  it("[AC-05] returns the 7 groups in order (within a group: spec task order)", () => {
    const tasks = [
      makeTask(taskSpec("f1", "backend"), { status: "failed", agent: "backend", since: 9 }),
      makeTask(taskSpec("r1", "tests"), { status: "running", agent: "tests", since: 2 }),
      makeTask(taskSpec("q1", "research"), { status: "queued", agent: "research", since: 9 }),
      makeTask(taskSpec("b1", "frontend"), {
        status: "blocked",
        agent: "frontend",
        holdKey: "stale",
        since: 5,
      }),
      makeTask(taskSpec("rt1", "backend"), { status: "retrying", agent: "research", since: 9 }),
      makeTask(taskSpec("b2", "tests"), { status: "blocked", holdKey: "stale", since: 5 }),
      makeTask(taskSpec("b3", "tests"), { status: "blocked", holdKey: "", since: 5 }),
      makeTask(taskSpec("n1", "frontend")),
      makeTask(taskSpec("n2", "backend")),
    ];
    const s = makeState({ tick: 10, taskList: tasks, dependencies: [] });
    expect(decisionsNeeded(s, [{ type: "finished", taskId: "r1" }])).toEqual([
      need("failure", "f1"),
      need("impact", "r1"),
      need("impact", "q1"),
      need("completion", "r1"),
      need("impact", "b1"),
      need("dispatch", "rt1", true),
      need("dispatch", "b2"),
      need("dispatch", "n1"),
    ]);
  });

  it("[AC-05] holdKeyOf / unfinishedDeps follow dependency order", () => {
    const s = makeState({
      tick: 41,
      tasks: {
        "api-orders": { status: "done", stage: "review" },
        "checkout-ui": { status: "review", stage: "review" },
      },
    });
    expect(holdKeyOf(s, "e2e-checkout")).toBe("api-orders:done,checkout-ui:review");
    expect(holdKeyOf(s, "checkout-ui")).toBe("api-orders:done");
    expect(holdKeyOf(s, "pricing-tests")).toBe("");
    expect(unfinishedDeps(s, "e2e-checkout")).toEqual(["checkout-ui"]);
    expect(unfinishedDeps(s, "checkout-ui")).toEqual([]);
    const start = makeState({ tick: 5 });
    expect(unfinishedDeps(start, "e2e-checkout")).toEqual(["api-orders", "checkout-ui"]);
    expect(holdKeyOf(start, "e2e-checkout")).toBe("");
  });
});
