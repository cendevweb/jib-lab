/**
 * Pure selectors over a ScenarioRun (SPEC §4.5).
 * Imports only domain *types*, so the UI builds and tests against fixture runs.
 */
import { createTimeline, type Timeline } from "@jib/demo-kit";
import type { DecisionRecord } from "@jib/jev";
import type { ScenarioRun, TowerFrame } from "@/domain/types";

/** `Math.round(p * 100) + "%"` */
export function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

/** frames[clamp(floor(t / tickMs))] */
export function frameAt(run: ScenarioRun, t: number): TowerFrame {
  const last = run.frames.length - 1;
  const raw = Math.floor((Number.isFinite(t) ? t : 0) / run.tickMs);
  const k = Math.max(0, Math.min(last, raw));
  const frame = run.frames[k];
  if (!frame) throw new Error("ScenarioRun has no frames");
  return frame;
}

export function createTowerTimeline(run: ScenarioRun): Timeline<TowerFrame> {
  const first = run.frames[0];
  if (!first) throw new Error("ScenarioRun has no frames");
  return createTimeline<TowerFrame>({
    initial: () => first,
    beats: run.frames.map((f, k) => ({ at: k * run.tickMs, label: f.caption, apply: () => f })),
    duration: run.duration,
  });
}

/** Records with `record.at <= t`. */
export function recordsUpTo(run: ScenarioRun, t: number): DecisionRecord[] {
  return run.records.filter((r) => r.at <= t);
}

const SPOTLIGHT_PRIORITY: Record<string, number> = {
  failure: 4,
  completion: 3,
  impact: 2,
  dispatch: 1,
};

/** Among records with the greatest `at` <= t: failure > completion > impact > dispatch; ties → last. */
export function spotlightRecord(run: ScenarioRun, t: number): DecisionRecord | undefined {
  const reached = recordsUpTo(run, t);
  if (reached.length === 0) return undefined;
  const latestAt = Math.max(...reached.map((r) => r.at));
  let best: DecisionRecord | undefined;
  let bestRank = -1;
  for (const r of reached) {
    if (r.at !== latestAt) continue;
    const rank = SPOTLIGHT_PRIORITY[r.name] ?? 0;
    if (rank >= bestRank) {
      best = r;
      bestRank = rank;
    }
  }
  return best;
}

/** Per answer, joined " · ": choice `name=label P`, noul `name=yes|no max(p, 1−p)`, score `name=x.x`. */
export function summarizeRecord(record: DecisionRecord): string {
  return Object.entries(record.result.answers)
    .map(([name, a]) => {
      if (a.type === "choice") {
        const p = (a.probabilities as Record<string, number>)[a.choice] ?? 0;
        return `${name}=${a.choice} ${pct(p)}`;
      }
      if (a.type === "score") return `${name}=${a.score.toFixed(1)}`;
      const yes = a.noul >= 0.5;
      return `${name}=${yes ? "yes" : "no"} ${pct(yes ? a.noul : 1 - a.noul)}`;
    })
    .join(" · ");
}
