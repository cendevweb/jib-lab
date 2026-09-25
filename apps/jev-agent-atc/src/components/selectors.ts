/**
 * Pure selectors over a ScenarioRun (SPEC §4.5).
 * CONTRACT STUB (harness): implemented by WP-03. Imports only domain *types*.
 */
import type { Timeline } from "@jib/demo-kit";
import type { DecisionRecord } from "@jib/jev";
import type { ScenarioRun, TowerFrame } from "@/domain/types";

/** frames[clamp(floor(t / tickMs))] */
export function frameAt(_run: ScenarioRun, _t: number): TowerFrame {
  throw new Error("not implemented: frameAt");
}

export function createTowerTimeline(_run: ScenarioRun): Timeline<TowerFrame> {
  throw new Error("not implemented: createTowerTimeline");
}

/** Records with `record.at <= t`. */
export function recordsUpTo(_run: ScenarioRun, _t: number): DecisionRecord[] {
  throw new Error("not implemented: recordsUpTo");
}

/** Among records with the greatest `at` <= t: failure > completion > impact > dispatch; ties → last. */
export function spotlightRecord(_run: ScenarioRun, _t: number): DecisionRecord | undefined {
  throw new Error("not implemented: spotlightRecord");
}

export function summarizeRecord(_record: DecisionRecord): string {
  throw new Error("not implemented: summarizeRecord");
}

/** `Math.round(p * 100) + "%"` */
export function pct(_p: number): string {
  throw new Error("not implemented: pct");
}
