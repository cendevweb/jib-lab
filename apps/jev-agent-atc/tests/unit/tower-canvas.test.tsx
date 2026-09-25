import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CANVAS, cardPosition, HOLD_PERIOD_MS } from "@/components/layout";
import { TowerCanvas } from "@/components/TowerCanvas";
import type { TowerFrame } from "@/domain/types";
import { ALL_AGENTS, makeEdge, makeFixtureRun, makeFrame, makeState, TASK_IDS } from "./fixtures";

afterEach(cleanup);

const run = makeFixtureRun();

function fixtureFrame(k: number): TowerFrame {
  const f = run.frames[k];
  if (!f) throw new Error(`no fixture frame ${k}`);
  return f;
}

/** SPEC §7 t = 21 s: api-orders reviewed at the gate, checkout-ui circling in holding. */
function holdingFrame(): TowerFrame {
  const state = makeState({
    tick: 42,
    tasks: {
      "api-orders": {
        status: "review",
        stage: "review",
        agent: "review",
        progress: 8,
        attempt: 2,
        startedAt: 1,
      },
      "pricing-tests": { status: "done", progress: 22, startedAt: 2 },
      "idempotency-research": { status: "done", progress: 8, startedAt: 3 },
      "checkout-ui": { status: "review", stage: "review", agent: null, startedAt: 4, since: 40 },
      "e2e-checkout": {
        status: "blocked",
        blockedBy: ["api-orders", "checkout-ui"],
        holdKey: "api-orders:review,checkout-ui:review",
      },
    },
    failureCount: 1,
  });
  const edges = [
    makeEdge({
      id: "e14",
      tick: 34,
      kind: "completion",
      action: "review",
      taskId: "api-orders",
      from: "gate:backend",
      to: "holding",
      label: "review 90%",
      p: 0.9,
    }),
    makeEdge({
      id: "e18",
      tick: 40,
      kind: "completion",
      action: "review",
      taskId: "checkout-ui",
      from: "gate:frontend",
      to: "holding",
      label: "review 75%",
      p: 0.75,
    }),
    makeEdge({
      id: "e19",
      tick: 41,
      action: "hold",
      taskId: "e2e-checkout",
      label: "hold 88%",
      p: 0.88,
    }),
  ];
  return makeFrame(state, { edges, caption: "Jev: hold e2e-checkout" });
}

const retryEdge = makeEdge({
  id: "e8",
  tick: 22,
  decisionId: "d10",
  action: "assign",
  taskId: "api-orders",
  from: "gate:research",
  to: "gate:backend",
  label: "retry → backend 89%",
  p: 0.89,
  retry: true,
});

describe("TowerCanvas", () => {
  it("[AC-17] renders the tower root with data-tick and the caption overlay", () => {
    const f = fixtureFrame(3);
    render(<TowerCanvas frame={f} t={f.t} />);
    expect(screen.getByTestId("tower").getAttribute("data-tick")).toBe("3");
    expect(screen.getByTestId("tower-caption").textContent?.trim()).toBe(f.caption);
  });

  it("[AC-17] renders the 5 gates with data-status and data-task", () => {
    const f = fixtureFrame(3);
    render(<TowerCanvas frame={f} t={f.t} />);
    const gate = (id: string) => screen.getByTestId(`gate-${id}`);
    for (const id of ALL_AGENTS) expect(gate(id)).toBeTruthy();
    expect(gate("research").getAttribute("data-status")).toBe("busy");
    expect(gate("research").getAttribute("data-task")).toBe("api-orders");
    expect(gate("tests").getAttribute("data-status")).toBe("busy");
    expect(gate("tests").getAttribute("data-task")).toBe("pricing-tests");
    expect(gate("frontend").getAttribute("data-status")).toBe("idle");
    expect(gate("frontend").getAttribute("data-task")).toBe("");
    expect(gate("backend").getAttribute("data-status")).toBe("idle");
    expect(gate("review").getAttribute("data-status")).toBe("idle");
  });

  it("[AC-17] renders one task card per task with status/zone/agent/stage/attempt", () => {
    const f = fixtureFrame(3);
    const { container } = render(<TowerCanvas frame={f} t={f.t} />);
    const cards = container.querySelectorAll('[data-testid^="task-"]');
    expect(cards).toHaveLength(5);
    for (const t of f.state.tasks) {
      const card = screen.getByTestId(`task-${t.id}`);
      expect(card.getAttribute("data-status")).toBe(t.status);
      expect(card.getAttribute("data-zone")).toBe(t.zone);
      expect(card.getAttribute("data-agent")).toBe(t.agent ?? "");
      expect(card.getAttribute("data-stage")).toBe(t.stage);
      expect(card.getAttribute("data-attempt")).toBe(String(t.attempt));
    }
    const api = screen.getByTestId("task-api-orders");
    expect(api.getAttribute("data-zone")).toBe("gate:research");
    expect(api.getAttribute("data-stage")).toBe("investigate");
    expect(screen.getByTestId("task-e2e-checkout").getAttribute("data-agent")).toBe("");
    expect(TASK_IDS.every((id) => screen.getByTestId(`task-${id}`))).toBe(true);
  });

  it("[AC-17] renders one route-edge per frame edge, labelled, with its data attributes", () => {
    const f = fixtureFrame(3);
    render(<TowerCanvas frame={f} t={f.t} />);
    const edges = screen.getAllByTestId("route-edge");
    expect(edges).toHaveLength(f.edges.length);
    const reroute = edges.find((e) => e.getAttribute("data-task") === "api-orders");
    if (!reroute) throw new Error("no api-orders edge");
    expect(reroute.textContent?.trim()).toBe("research 76%");
    expect(reroute.getAttribute("data-kind")).toBe("failure");
    expect(reroute.getAttribute("data-action")).toBe("reroute");
    expect(reroute.getAttribute("data-from")).toBe("gate:backend");
    expect(reroute.getAttribute("data-to")).toBe("gate:research");
    expect(reroute.getAttribute("data-retry")).toBe("false");
    expect(reroute.getAttribute("data-fallback")).toBe("false");
    expect(reroute.getAttribute("data-p")).toBe("0.76");
    const pause = edges.find((e) => e.getAttribute("data-task") === "checkout-ui");
    expect(pause?.textContent?.trim()).toBe("pause 91%");
    expect(pause?.getAttribute("data-action")).toBe("pause");
    expect(pause?.getAttribute("data-p")).toBe("0.91");
  });

  it("[AC-17] renders no route-edge for a frame without edges", () => {
    const f = fixtureFrame(0);
    render(<TowerCanvas frame={f} t={0} />);
    expect(screen.queryAllByTestId("route-edge")).toHaveLength(0);
  });

  it("[AC-17] dependency lanes are blocked / active / done", () => {
    const f = fixtureFrame(3);
    render(<TowerCanvas frame={f} t={f.t} />);
    const lane = (id: string) =>
      screen.getByTestId(`dependency-lane-${id}`).getAttribute("data-state");
    expect(lane("checkout-ui-api-orders")).toBe("blocked");
    expect(lane("e2e-checkout-api-orders")).toBe("blocked");
    expect(lane("e2e-checkout-checkout-ui")).toBe("blocked");
    cleanup();

    const h = holdingFrame();
    render(<TowerCanvas frame={h} t={h.t} />);
    expect(lane("checkout-ui-api-orders")).toBe("active");
    expect(lane("e2e-checkout-api-orders")).toBe("blocked");
    cleanup();

    const landed = makeFrame(
      makeState({
        tick: 44,
        tasks: {
          "api-orders": { status: "done", stage: "review", attempt: 2 },
          "checkout-ui": { status: "review", stage: "review", agent: "review" },
          "e2e-checkout": { status: "blocked", blockedBy: ["checkout-ui"] },
        },
      }),
    );
    render(<TowerCanvas frame={landed} t={landed.t} />);
    expect(lane("checkout-ui-api-orders")).toBe("done");
    expect(lane("e2e-checkout-api-orders")).toBe("done");
    expect(lane("e2e-checkout-checkout-ui")).toBe("blocked");
  });

  it("[AC-17] holding-pattern / runway / pad-human expose their counts", () => {
    const h = holdingFrame();
    render(<TowerCanvas frame={h} t={h.t} />);
    expect(screen.getByTestId("holding-pattern").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("runway").getAttribute("data-count")).toBe("2");
    expect(screen.getByTestId("pad-human").getAttribute("data-count")).toBe("0");
    expect(screen.getByTestId("gate-review").getAttribute("data-task")).toBe("api-orders");
    expect(screen.getByTestId("task-checkout-ui").getAttribute("data-zone")).toBe("holding");
    cleanup();

    const escalated = makeFrame(
      makeState({
        tick: 20,
        tasks: { "api-orders": { status: "escalated", attempt: 3 } },
        failureCount: 3,
      }),
    );
    render(<TowerCanvas frame={escalated} t={escalated.t} />);
    expect(screen.getByTestId("pad-human").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("holding-pattern").getAttribute("data-count")).toBe("0");
    expect(screen.getByTestId("runway").getAttribute("data-count")).toBe("0");
  });

  it("[AC-17] retry-loop renders only for a retry edge of an unfinished task", () => {
    const retrying = makeFrame(
      makeState({
        tick: 22,
        tasks: { "api-orders": { status: "running", agent: "backend", attempt: 2, startedAt: 1 } },
      }),
      { edges: [retryEdge] },
    );
    render(<TowerCanvas frame={retrying} t={retrying.t} />);
    expect(screen.getByTestId("retry-loop")).toBeTruthy();
    const edge = screen.getByTestId("route-edge");
    expect(edge.getAttribute("data-retry")).toBe("true");
    expect(edge.textContent?.trim()).toBe("retry → backend 89%");
    expect(screen.getByTestId("task-api-orders").getAttribute("data-attempt")).toBe("2");
    cleanup();

    const finished = makeFrame(
      makeState({
        tick: 45,
        tasks: { "api-orders": { status: "done", stage: "review", attempt: 2 } },
      }),
      { edges: [retryEdge] },
    );
    render(<TowerCanvas frame={finished} t={finished.t} />);
    expect(screen.queryByTestId("retry-loop")).toBeNull();
    cleanup();

    const f = fixtureFrame(3);
    render(<TowerCanvas frame={f} t={f.t} />);
    expect(screen.queryByTestId("retry-loop")).toBeNull();
  });
});

describe("layout", () => {
  it("[AC-17] exposes the 960×600 canvas and a 4 s holding period", () => {
    expect(CANVAS).toEqual({ width: 960, height: 600 });
    expect(HOLD_PERIOD_MS).toBe(4000);
  });

  it("[AC-17] cardPosition is deterministic for equal (frame, t)", () => {
    const f = fixtureFrame(3);
    const copy = structuredClone(f);
    for (const id of TASK_IDS) {
      const a = cardPosition(f, id, 6500);
      expect(Number.isFinite(a.x)).toBe(true);
      expect(Number.isFinite(a.y)).toBe(true);
      expect(cardPosition(copy, id, 6500)).toEqual(a);
    }
    const h = holdingFrame();
    expect(cardPosition(h, "checkout-ui", 21_000)).toEqual(
      cardPosition(structuredClone(h), "checkout-ui", 21_000),
    );
  });

  it("[AC-17] holding cards orbit as a function of t with period HOLD_PERIOD_MS", () => {
    const h = holdingFrame();
    const p0 = cardPosition(h, "checkout-ui", 21_000);
    const quarter = cardPosition(h, "checkout-ui", 21_000 + HOLD_PERIOD_MS / 4);
    const full = cardPosition(h, "checkout-ui", 21_000 + HOLD_PERIOD_MS);
    expect(quarter).not.toEqual(p0);
    expect(full.x).toBeCloseTo(p0.x, 6);
    expect(full.y).toBeCloseTo(p0.y, 6);
  });
});
