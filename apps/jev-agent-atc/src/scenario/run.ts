/**
 * Deterministic 30 s run: virtual clock + createJev + engine loop (SPEC §4.4).
 * CONTRACT STUB (harness): implemented by WP-04.
 */
import type { JevProvider } from "@jib/jev";
import type { ScenarioRun, ScenarioSpec } from "@/domain/types";

export function runScenario(_options?: {
  seed?: number;
  provider?: JevProvider;
  spec?: ScenarioSpec;
  ticks?: number;
  tickMs?: number;
}): Promise<ScenarioRun> {
  return Promise.reject(new Error("not implemented: runScenario"));
}
