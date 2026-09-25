import { describe, expect, it } from "vitest";
import {
  createTowerTimeline,
  frameAt,
  pct,
  recordsUpTo,
  spotlightRecord,
  summarizeRecord,
} from "@/components/selectors";
import {
  choiceAnswer,
  FAILURE_RECORD,
  makeFixtureRun,
  makeRecord,
  noulAnswer,
  scoreAnswer,
} from "./fixtures";

const run = makeFixtureRun();

describe("frameAt / createTowerTimeline", () => {
  it("[AC-16] frameAt floors t to the tick and clamps to the available frames", () => {
    expect(frameAt(run, 0)).toBe(run.frames[0]);
    expect(frameAt(run, 499)).toBe(run.frames[0]);
    expect(frameAt(run, 500)).toBe(run.frames[1]);
    expect(frameAt(run, 1499)).toBe(run.frames[2]);
    expect(frameAt(run, 1500)).toBe(run.frames[3]);
    expect(frameAt(run, -250)).toBe(run.frames[0]);
    expect(frameAt(run, 2000)).toBe(run.frames[4]);
    expect(frameAt(run, 99_999)).toBe(run.frames[4]);
  });

  it("[AC-16] the timeline's stateAt(t) is frameAt(run, t) and captionAt(t) its caption", () => {
    const timeline = createTowerTimeline(run);
    expect(timeline.duration).toBe(2000);
    for (const t of [0, 250, 500, 999, 1000, 1250, 1500, 1750, 2000]) {
      expect(timeline.stateAt(t)).toEqual(frameAt(run, t));
      expect(timeline.captionAt(t)).toBe(frameAt(run, t).caption);
    }
  });
});

describe("recordsUpTo / spotlightRecord", () => {
  it("[AC-16] recordsUpTo keeps records with at ≤ t", () => {
    expect(recordsUpTo(run, 0)).toEqual([]);
    expect(recordsUpTo(run, 499)).toEqual([]);
    expect(recordsUpTo(run, 500).map((r) => r.id)).toEqual(["d1"]);
    expect(recordsUpTo(run, 1499).map((r) => r.id)).toEqual(["d1", "d2", "d3"]);
    expect(recordsUpTo(run, 1500).map((r) => r.id)).toEqual(["d1", "d2", "d3", "d4", "d7", "d8"]);
    expect(recordsUpTo(run, 5000)).toHaveLength(run.records.length);
  });

  it("[AC-16] spotlightRecord prefers failure > completion > impact > dispatch in the latest tick", () => {
    expect(spotlightRecord(run, 400)).toBeUndefined();
    expect(spotlightRecord(run, 500)?.id).toBe("d1");
    expect(spotlightRecord(run, 999)?.id).toBe("d1");
    // t = 1000: completion d2 beats dispatch d3
    expect(spotlightRecord(run, 1000)?.id).toBe("d2");
    // t = 1500: failure d7 beats impacts d4 and d8
    expect(spotlightRecord(run, 1500)).toBe(FAILURE_RECORD);
    expect(spotlightRecord(run, 1999)?.id).toBe("d7");
    // t = 2000: two impacts → the last one
    expect(spotlightRecord(run, 2000)?.id).toBe("d10");
  });
});

describe("summarizeRecord / pct", () => {
  it("[AC-16] prints P(choice) for choices (not the entropy confidence)", () => {
    expect(summarizeRecord(FAILURE_RECORD)).toBe("onFailure=research 76%");
  });

  it("[AC-16] prints yes/no with max(p, 1 − p) for noul, score.toFixed(1) for score", () => {
    const rec = (answers: Parameters<typeof makeRecord>[0]["answers"]) =>
      makeRecord({ id: "dx", name: "impact", at: 0, task: "checkout-ui", answers });
    expect(summarizeRecord(rec({ blocked: noulAnswer(0.91) }))).toBe("blocked=yes 91%");
    expect(summarizeRecord(rec({ blocked: noulAnswer(0.04) }))).toBe("blocked=no 96%");
    const risk = { ...scoreAnswer([0.02, 0.08, 0.3, 0.6]), score: 2.5 };
    expect(summarizeRecord(rec({ risk }))).toBe("risk=2.5");
    expect(summarizeRecord(rec({ risk: scoreAnswer([0.45, 0.4, 0.12, 0.03]) }))).toBe("risk=0.7");
  });

  it("[AC-16] joins several answers with ` · ` in question order", () => {
    const rec = makeRecord({
      id: "d1",
      name: "dispatch",
      at: 500,
      task: "api-orders",
      answers: {
        assignee: choiceAnswer({ frontend: 0.05, backend: 0.86, tests: 0.05, research: 0.04 }, 0.6),
        parallelSafe: noulAnswer(0.94),
      },
    });
    expect(summarizeRecord(rec)).toBe("assignee=backend 86% · parallelSafe=yes 94%");
  });

  it("[AC-16] pct rounds to a whole percentage", () => {
    expect(pct(0.76)).toBe("76%");
    expect(pct(0.06)).toBe("6%");
    expect(pct(0.9)).toBe("90%");
    expect(pct(1)).toBe("100%");
  });
});
