import { createTimeline } from "@jib/demo-kit";
import type { DecisionRecord } from "@jib/jev";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DecisionLogPanel, DemoShell, ProbabilityBars, summarize, useScenarioPlayer } from "../src";

afterEach(cleanup);

describe("DemoShell", () => {
  it("renders title, hook and badge", () => {
    render(
      <DemoShell title="T" hook="H" badge="Jev · simulated">
        body
      </DemoShell>,
    );
    expect(screen.getByRole("heading", { name: "T" })).toBeTruthy();
    expect(screen.getByTestId("provider-badge").textContent).toBe("Jev · simulated");
  });
});

describe("ProbabilityBars", () => {
  it("sorts descending and marks the selected label", () => {
    const { container } = render(
      <ProbabilityBars probabilities={{ a: 0.2, b: 0.7, c: 0.1 }} selected="b" confidence={0.5} />,
    );
    const labels = [...container.querySelectorAll("[data-label]")].map((n) =>
      n.getAttribute("data-label"),
    );
    expect(labels).toEqual(["b", "a", "c"]);
    expect(container.querySelector('[data-selected="true"]')?.getAttribute("data-label")).toBe("b");
    expect(screen.getByText("confidence 50%")).toBeTruthy();
  });
});

describe("DecisionLogPanel", () => {
  const rec = {
    id: "d1",
    name: "route",
    at: 2500,
    provider: "simulated",
    latencyMs: 0,
    tags: { task: "T1" },
    request: { state: null, questions: {} },
    result: {
      model: "m",
      usage: { input_tokens: 1, output_tokens: 1 },
      answers: {
        next: {
          type: "choice",
          choice: "research",
          confidence: 0.82,
          probabilities: { research: 0.9 },
        },
        retry: { type: "noul", noul: 0.23 },
        sev: { type: "score", score: 1.5, confidence: 0.4, legend: {}, probabilities: {} },
      },
    },
  } as unknown as DecisionRecord;
  it("summarizes answers", () => {
    expect(summarize(rec)).toBe("next=research 82% · retry=no 23% · sev=1.5");
  });
  it("renders newest first", () => {
    render(<DecisionLogPanel records={[rec, { ...rec, id: "d2", name: "second" }]} />);
    const items = screen.getByTestId("decision-log").querySelectorAll("li");
    expect(items[0]?.getAttribute("data-decision")).toBe("second");
  });
});

describe("useScenarioPlayer", () => {
  const tl = createTimeline<number>({
    initial: () => 0,
    beats: [{ at: 1000, label: "inc", apply: (s) => s + 1 }],
  });
  it("seeks, toggles and exposes state/caption", () => {
    const { result } = renderHook(() => useScenarioPlayer(tl, { initialT: 1500 }));
    expect(result.current.state).toBe(1);
    expect(result.current.caption).toBe("inc");
    act(() => result.current.seek(0));
    expect(result.current.state).toBe(0);
    act(() => result.current.toggle());
    expect(result.current.playing).toBe(true);
    act(() => result.current.setSpeed(2));
    expect(result.current.speed).toBe(2);
  });
  it("controls render with test ids", async () => {
    const { ScenarioControls } = await import("../src");
    function Harness() {
      const p = useScenarioPlayer(tl);
      return <ScenarioControls player={p as never} />;
    }
    render(<Harness />);
    fireEvent.click(screen.getByTestId("scenario-toggle"));
    expect(screen.getByTestId("scenario-toggle").textContent).toBe("Pause");
  });
});
