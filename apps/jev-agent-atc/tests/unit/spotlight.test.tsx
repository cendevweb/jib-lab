import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DecisionSpotlight, SharedStatePanel } from "@/components/DecisionSpotlight";
import { choiceAnswer, FAILURE_RECORD, makeRecord, noulAnswer, scoreAnswer } from "./fixtures";

afterEach(cleanup);

/** The probability list rendered for one answer (ProbabilityBars, aria-label = question name). */
function bars(root: HTMLElement, question: string) {
  const list = within(root).getByRole("list", { name: question });
  const items = [...list.querySelectorAll("[data-label]")];
  return {
    labels: items.map((i) => i.getAttribute("data-label")).sort(),
    selected: items
      .filter((i) => i.getAttribute("data-selected") === "true")
      .map((i) => i.getAttribute("data-label")),
    text: (label: string) =>
      items.find((i) => i.getAttribute("data-label") === label)?.textContent ?? "",
  };
}

const dispatchRecord = makeRecord({
  id: "d4",
  name: "dispatch",
  at: 2000,
  task: "checkout-ui",
  answers: {
    assignee: choiceAnswer({ frontend: 0.85, backend: 0.05, tests: 0.05, research: 0.05 }, 0.58),
    parallelSafe: noulAnswer(0.72),
  },
});

const completionRecord = makeRecord({
  id: "d15",
  name: "completion",
  at: 20_000,
  task: "checkout-ui",
  answers: { risk: scoreAnswer([0.05, 0.2, 0.45, 0.3]) },
});

describe("DecisionSpotlight", () => {
  it("[AC-18] marks the root with data-decision / data-task", () => {
    render(<DecisionSpotlight record={FAILURE_RECORD} />);
    const root = screen.getByTestId("latest-decision");
    expect(root.getAttribute("data-decision")).toBe("failure");
    expect(root.getAttribute("data-task")).toBe("api-orders");
  });

  it("[AC-18] a choice answer shows every label with Jev's pick selected", () => {
    render(<DecisionSpotlight record={FAILURE_RECORD} />);
    const b = bars(screen.getByTestId("latest-decision"), "onFailure");
    expect(b.labels).toEqual(["escalate", "research", "retry"]);
    expect(b.selected).toEqual(["research"]);
    expect(b.text("research")).toContain("76%");
    expect(b.text("retry")).toContain("18%");
    expect(b.text("escalate")).toContain("6%");
  });

  it("[AC-18] one probability list per answer; noul answers use yes / no", () => {
    render(<DecisionSpotlight record={dispatchRecord} />);
    const root = screen.getByTestId("latest-decision");
    expect(within(root).getAllByRole("list", { name: "assignee" })).toHaveLength(1);
    expect(within(root).getAllByRole("list", { name: "parallelSafe" })).toHaveLength(1);
    const assignee = bars(root, "assignee");
    expect(assignee.labels).toEqual(["backend", "frontend", "research", "tests"]);
    expect(assignee.selected).toEqual(["frontend"]);
    expect(assignee.text("frontend")).toContain("85%");
    const ps = bars(root, "parallelSafe");
    expect(ps.labels).toEqual(["no", "yes"]);
    expect(ps.selected).toEqual(["yes"]);
    expect(ps.text("yes")).toContain("72%");
    expect(ps.text("no")).toContain("28%");
  });

  it("[AC-18] a noul below 0.5 selects `no`", () => {
    const rec = makeRecord({
      id: "d8",
      name: "impact",
      at: 6500,
      task: "pricing-tests",
      answers: { blocked: noulAnswer(0.04) },
    });
    render(<DecisionSpotlight record={rec} />);
    const b = bars(screen.getByTestId("latest-decision"), "blocked");
    expect(b.selected).toEqual(["no"]);
    expect(b.text("no")).toContain("96%");
    expect(b.text("yes")).toContain("4%");
  });

  it("[AC-18] a score answer uses the 4 risk levels trivial / low / medium / high", () => {
    render(<DecisionSpotlight record={completionRecord} />);
    const root = screen.getByTestId("latest-decision");
    expect(root.getAttribute("data-decision")).toBe("completion");
    const b = bars(root, "risk");
    expect(b.labels).toEqual(["high", "low", "medium", "trivial"]);
    expect(b.selected).toEqual(["medium"]);
    expect(b.text("medium")).toContain("45%");
    expect(b.text("high")).toContain("30%");
    expect(b.text("low")).toContain("20%");
    expect(b.text("trivial")).toContain("5%");
  });

  it("[AC-18] renders a waiting state when there is no record yet", () => {
    render(<DecisionSpotlight record={undefined} />);
    expect(screen.getByText(/waiting for Jev/i)).toBeTruthy();
    expect(document.querySelectorAll('[data-selected="true"]')).toHaveLength(0);
  });
});

describe("SharedStatePanel", () => {
  it("[AC-18] shows the request state as pretty JSON with all 8 shared-state keys", () => {
    render(<SharedStatePanel record={FAILURE_RECORD} />);
    const pre = screen.getByTestId("shared-state");
    expect(pre.tagName).toBe("PRE");
    const text = pre.textContent ?? "";
    expect(JSON.parse(text)).toEqual(FAILURE_RECORD.request.state);
    expect(text).toContain("\n");
    for (const key of [
      "tasks",
      "dependencies",
      "agentStatus",
      "recentFailures",
      "tokenBudget",
      "changedFiles",
      "confidence",
      "blockedBy",
    ]) {
      expect(text).toContain(`"${key}"`);
    }
  });
});
