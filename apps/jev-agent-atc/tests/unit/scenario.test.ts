import type { DecisionRecord } from "@jib/jev";
import { beforeAll, describe, expect, it } from "vitest";
import type { ScenarioRun, Task, TaskId, TowerFrame } from "@/domain/types";
import { INTRO_CAPTION, summaryCaption } from "@/scenario/captions";
import { DEFAULT_SEED, DURATION_MS, SCENARIO, TICK_MS, TICKS } from "@/scenario/config";
import { parsePlayerParams } from "@/scenario/params";
import { runScenario } from "@/scenario/run";
import { makeState, SPEC_FIXTURE } from "./fixtures";

let run: ScenarioRun;

beforeAll(async () => {
  run = await runScenario();
});

/** `frameAt`-style lookup: frames[t / 500]. */
function frame(t: number): TowerFrame {
  const f = run.frames[t / 500];
  if (!f) throw new Error(`no frame at t=${t}`);
  return f;
}

function task(t: number, id: TaskId): Task {
  const x = frame(t).state.tasks.find((k) => k.id === id);
  if (!x) throw new Error(`no task ${id} at t=${t}`);
  return x;
}

function recordsNamed(name: string): DecisionRecord[] {
  return run.records.filter((r) => r.name === name);
}

function finalFrame(): TowerFrame {
  const f = run.frames.at(-1);
  if (!f) throw new Error("no frames");
  return f;
}

describe("scenario config", () => {
  it("[AC-01] SCENARIO is the SPEC §4.4 table (5 tasks, 3 dependencies, budget 150000)", () => {
    expect(SCENARIO).toEqual(SPEC_FIXTURE);
  });

  it("[AC-10] timing constants and the intro / summary captions", () => {
    expect(TICK_MS).toBe(500);
    expect(TICKS).toBe(60);
    expect(DURATION_MS).toBe(30_000);
    expect(DEFAULT_SEED).toBe(7);
    expect(INTRO_CAPTION).toBe(
      "5 tasks on approach · agents do the work, Jev decides how it moves",
    );
    const s = makeState({
      tick: 58,
      tasks: {
        "api-orders": { status: "done" },
        "pricing-tests": { status: "done" },
        "idempotency-research": { status: "done" },
        "checkout-ui": { status: "done" },
        "e2e-checkout": { status: "running", agent: "tests" },
      },
      failureCount: 1,
    });
    expect(summaryCaption(s)).toBe("4 landed · 1 in flight · 1 failure absorbed · 0 humans paged");
  });
});

describe("runScenario — shape and determinism", () => {
  it("[AC-10] returns seed 7, simulated provider, tickMs 500, duration 30000 and 61 frames", () => {
    expect(run.seed).toBe(7);
    expect(run.provider).toBe("simulated");
    expect(run.tickMs).toBe(500);
    expect(run.duration).toBe(30_000);
    expect(run.frames).toHaveLength(61);
    run.frames.forEach((f, k) => {
      expect(f.t).toBe(k * 500);
      expect(f.tick).toBe(k);
      expect(f.state.tick).toBe(k);
    });
    expect(frame(0).caption).toBe(INTRO_CAPTION);
    expect(frame(0).decisionIds).toEqual([]);
  });

  it("[AC-10] is a pure function of the seed: two runs are deep-equal", async () => {
    const again = await runScenario();
    expect(again).toEqual(run);
    const explicit = await runScenario({ seed: 7 });
    expect(explicit).toEqual(run);
  });

  it("[AC-10] a different seed changes only assignee probabilities, not statuses", async () => {
    const other = await runScenario({ seed: 42 });
    expect(other.seed).toBe(42);
    expect(other.frames).toHaveLength(run.frames.length);
    other.frames.forEach((f, k) => {
      const base = run.frames[k];
      const view = (fr: TowerFrame | undefined) =>
        fr?.state.tasks.map((t) => [
          t.id,
          t.status,
          t.stage,
          t.agent,
          t.zone,
          t.progress,
          t.attempt,
        ]);
      expect(view(f)).toEqual(view(base));
      expect(f.edges.map((e) => [e.taskId, e.action, e.from, e.to])).toEqual(
        base?.edges.map((e) => [e.taskId, e.action, e.from, e.to]),
      );
    });
    expect(other.records.map((r) => [r.name, r.tags])).toEqual(
      run.records.map((r) => [r.name, r.tags]),
    );
    let assigneeDiffers = false;
    other.records.forEach((r, i) => {
      const base = run.records[i];
      for (const [name, a] of Object.entries(r.result.answers)) {
        const b = base?.result.answers[name];
        if (name === "assignee") {
          if (a.type === "choice" && b?.type === "choice") {
            expect(a.choice).toBe(b.choice);
            if (JSON.stringify(a.probabilities) !== JSON.stringify(b.probabilities)) {
              assigneeDiffers = true;
            }
          }
        } else {
          expect(a).toEqual(b);
        }
      }
    });
    expect(assigneeDiffers).toBe(true);
  });

  it("[AC-10] parsePlayerParams reads ?t= and ?autoplay=1, clamping t to [0, 30000]", () => {
    expect(parsePlayerParams({ t: "12000", autoplay: "1" })).toEqual({
      initialT: 12000,
      autoplay: true,
    });
    expect(parsePlayerParams({})).toEqual({ initialT: 0, autoplay: false });
    expect(parsePlayerParams({ t: "abc" })).toEqual({ initialT: 0, autoplay: false });
    expect(parsePlayerParams({ t: "-500" }).initialT).toBe(0);
    expect(parsePlayerParams({ t: "99999" }).initialT).toBe(30_000);
    expect(parsePlayerParams({ t: "6500", autoplay: "0" })).toEqual({
      initialT: 6500,
      autoplay: false,
    });
  });
});

describe("runScenario — the SPEC §7 story", () => {
  it("[AC-11] t=6000: api-orders failed at gate:backend, caption says `failed`", () => {
    const api = task(6000, "api-orders");
    expect(api.status).toBe("failed");
    expect(api.zone).toBe("gate:backend");
    expect(api.progress).toBe(11);
    expect(frame(6000).agents.backend.status).toBe("idle");
    expect(frame(6000).caption).toContain("failed");
    expect(frame(6000).caption).toContain("api-orders");
    expect(frame(6000).state.failureCount).toBe(1);
  });

  it("[AC-11] t=6500: Jev answers retry 18% / research 76% / escalate 6% and the board re-routes", () => {
    const failures = recordsNamed("failure");
    expect(failures).toHaveLength(1);
    const rec = failures[0];
    if (!rec) throw new Error("no failure record");
    expect(rec.at).toBe(6500);
    expect(rec.tags.task).toBe("api-orders");
    const onFailure = rec.result.answers.onFailure;
    if (onFailure?.type !== "choice") throw new Error("onFailure must be a choice");
    expect(onFailure.choice).toBe("research");
    expect(onFailure.probabilities.retry).toBeCloseTo(0.18, 4);
    expect(onFailure.probabilities.research).toBeCloseTo(0.76, 4);
    expect(onFailure.probabilities.escalate).toBeCloseTo(0.06, 4);
    expect(frame(6500).decisionIds).toContain(rec.id);
    expect(frame(6500).decisionIds).toHaveLength(3);

    const api = task(6500, "api-orders");
    expect(api.zone).toBe("gate:research");
    expect(api.stage).toBe("investigate");
    expect(api.agent).toBe("research");

    const ui = task(6500, "checkout-ui");
    expect(ui.status).toBe("blocked");
    expect(ui.zone).toBe("gate:frontend");
    expect(ui.blockedBy).toEqual(["api-orders"]);
    expect(ui.progress).toBe(9);

    expect(task(6500, "pricing-tests").status).toBe("running");
    expect(frame(6500).caption).toContain("research 76%");

    const labels = Object.fromEntries(frame(6500).edges.map((e) => [e.taskId, e]));
    expect(labels["api-orders"]).toMatchObject({
      action: "reroute",
      label: "research 76%",
      from: "gate:backend",
      to: "gate:research",
    });
    expect(labels["checkout-ui"]).toMatchObject({ action: "pause", label: "pause 91%" });
    expect(labels["pricing-tests"]).toMatchObject({ action: "continue", label: "continue 96%" });
  });

  it("[AC-12] retry loop: retrying at 10.5 s, back on backend as attempt 2 at 11 s", () => {
    const retrying = task(10500, "api-orders");
    expect(retrying.status).toBe("retrying");
    expect(retrying.attempt).toBe(2);
    expect(retrying.zone).toBe("gate:research");

    const running = task(11000, "api-orders");
    expect(running.status).toBe("running");
    expect(running.agent).toBe("backend");
    expect(running.attempt).toBe(2);

    const edge = frame(11000).edges.find((e) => e.taskId === "api-orders");
    expect(edge).toMatchObject({
      retry: true,
      action: "assign",
      from: "gate:research",
      to: "gate:backend",
    });
    expect(edge?.label.startsWith("retry → backend ")).toBe(true);
    expect(frame(11000).caption).toContain("attempt 2");
  });

  it("[AC-12] api-orders is done at 22 s and never escalated", () => {
    expect(task(22000, "api-orders").status).toBe("done");
    expect(task(21500, "api-orders").status).toBe("review");
    for (const f of run.frames) {
      const api = f.state.tasks.find((t) => t.id === "api-orders");
      expect(api?.status).not.toBe("escalated");
    }
    expect(finalFrame().state.edges.some((e) => e.action === "escalate")).toBe(false);
  });

  it("[AC-13] pricing-tests and idempotency-research land without review", () => {
    const edges = finalFrame().state.edges;
    const research = edges.filter(
      (e) => e.taskId === "idempotency-research" && e.action === "land",
    );
    expect(research).toHaveLength(1);
    expect(research[0]).toMatchObject({ tick: 11, label: "land 92%", to: "landed" });
    const tests = edges.filter((e) => e.taskId === "pricing-tests" && e.action === "land");
    expect(tests).toHaveLength(1);
    expect(tests[0]).toMatchObject({ tick: 24, label: "land 85%", to: "landed" });
    for (const f of run.frames) {
      for (const t of f.state.tasks) {
        if (t.id === "pricing-tests" || t.id === "idempotency-research") {
          expect(t.status).not.toBe("review");
        }
      }
    }
    expect(task(5500, "idempotency-research").status).toBe("done");
    expect(task(12000, "pricing-tests").status).toBe("done");
  });

  it("[AC-13] api-orders gets a review edge (p 0.90) at 17 s and is reviewed at the review gate", () => {
    const review = finalFrame().state.edges.filter(
      (e) => e.taskId === "api-orders" && e.action === "review",
    );
    expect(review).toHaveLength(1);
    expect(review[0]?.tick).toBe(34);
    expect(review[0]?.p).toBeCloseTo(0.9, 4);
    expect(review[0]?.label).toBe("review 90%");
    expect(task(17000, "api-orders").status).toBe("review");
    expect(task(17000, "api-orders").zone).toBe("gate:review");
  });

  it("[AC-13] t=21000: checkout-ui circles in holding while api-orders is at gate:review", () => {
    const ui = task(21000, "checkout-ui");
    expect(ui.status).toBe("review");
    expect(ui.zone).toBe("holding");
    const api = task(21000, "api-orders");
    expect(api.status).toBe("review");
    expect(api.zone).toBe("gate:review");
    expect(frame(21000).agents.review).toEqual({
      id: "review",
      status: "busy",
      taskId: "api-orders",
    });
    const uiReview = finalFrame().state.edges.find(
      (e) => e.taskId === "checkout-ui" && e.action === "review",
    );
    expect(uiReview).toMatchObject({ tick: 40, label: "review 75%" });
    expect(task(22000, "checkout-ui").zone).toBe("gate:review");
    expect(task(27000, "checkout-ui").status).toBe("done");
  });

  it("[AC-14] t=3000: four tasks run in parallel on four different agents", () => {
    const running = frame(3000).state.tasks.filter((t) => t.status === "running");
    expect(running.map((t) => t.id)).toEqual([
      "api-orders",
      "pricing-tests",
      "idempotency-research",
      "checkout-ui",
    ]);
    expect(new Set(running.map((t) => t.agent)).size).toBe(4);
    const busy = Object.values(frame(3000).agents).filter((a) => a.status === "busy");
    expect(busy).toHaveLength(4);
  });

  it("[AC-14] checkout-ui starts on the API contract before api-orders is done", () => {
    const d = recordsNamed("dispatch").find((r) => r.tags.task === "checkout-ui");
    const ps = d?.result.answers.parallelSafe;
    if (ps?.type !== "noul") throw new Error("parallelSafe must be a noul");
    expect(ps.noul).toBeGreaterThanOrEqual(0.6);
    expect(ps.noul).toBeCloseTo(0.72, 4);
    const ui = task(2000, "checkout-ui");
    expect(ui.status).toBe("running");
    expect(ui.startedAt).toBe(4);
    expect(task(2000, "api-orders").status).not.toBe("done");
  });

  it("[AC-14] e2e-checkout is held (blockedBy ⊇ checkout-ui) from 2.5 s to 26.5 s, then runs on tests", () => {
    for (let t = 2500; t <= 26500; t += 500) {
      const e2e = task(t, "e2e-checkout");
      expect(e2e.status, `t=${t}`).toBe("blocked");
      expect(e2e.blockedBy, `t=${t}`).toContain("checkout-ui");
    }
    expect(task(2500, "e2e-checkout").blockedBy).toEqual(["api-orders", "checkout-ui"]);
    const hold = frame(2500).edges.find((e) => e.taskId === "e2e-checkout");
    expect(hold).toMatchObject({ action: "hold", label: "hold 88%" });
    const end = task(30000, "e2e-checkout");
    expect(end.status).toBe("running");
    expect(end.agent).toBe("tests");
    expect(end.progress).toBe(6);
  });

  it("[AC-14] Jev resumes the paused checkout-ui at 17.5 s (p 0.78) while api-orders is still in review", () => {
    expect(task(17000, "checkout-ui").status).toBe("blocked");
    const resume = finalFrame().state.edges.filter(
      (e) => e.taskId === "checkout-ui" && e.action === "resume",
    );
    expect(resume).toHaveLength(1);
    expect(resume[0]?.tick).toBe(35);
    expect(resume[0]?.p).toBeCloseTo(0.78, 4);
    expect(resume[0]?.label).toBe("resume 78%");
    expect(task(17500, "checkout-ui").status).toBe("running");
    expect(task(17500, "api-orders").status).toBe("review");
  });

  it("[AC-15] 18 decision records covering all kinds and all 3 answer types", () => {
    expect(run.records).toHaveLength(18);
    for (const r of run.records) expect(r.at).toBeLessThanOrEqual(30_000);
    expect(new Set(run.records.map((r) => r.name))).toEqual(
      new Set(["dispatch", "failure", "impact", "completion"]),
    );
    const types = new Set(
      run.records.flatMap((r) => Object.values(r.result.answers).map((a) => a.type)),
    );
    expect(types).toEqual(new Set(["choice", "noul", "score"]));
    expect(run.records.map((r) => r.at)).toEqual([
      500, 1000, 1500, 2000, 2500, 5500, 6500, 6500, 6500, 11000, 12000, 17000, 17500, 17500, 20000,
      20500, 22000, 27000,
    ]);
    const idsInFrames = run.frames.flatMap((f) => f.decisionIds);
    expect(idsInFrames).toEqual(run.records.map((r) => r.id));
  });

  it("[AC-15] the final frame: 4 landed, 0 escalated, 1 failure, summary caption", () => {
    const f = finalFrame();
    expect(f.t).toBe(30_000);
    expect(f.state.tasks.filter((t) => t.status === "done")).toHaveLength(4);
    expect(f.state.tasks.filter((t) => t.status === "escalated")).toHaveLength(0);
    expect(f.state.failureCount).toBe(1);
    expect(f.caption).toContain("4 landed");
    expect(f.caption).toContain("0 humans paged");
    expect(frame(29000).caption).toBe(
      "4 landed · 1 in flight · 1 failure absorbed · 0 humans paged",
    );
  });
});
