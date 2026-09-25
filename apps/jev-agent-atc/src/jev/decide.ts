/**
 * One decision need → Jev → routing actions (SPEC §4.3).
 * CONTRACT STUB (harness): implemented by WP-02.
 */
import type { DecisionRecord, Jev } from "@jib/jev";
import type { DecisionNeed, RoutingAction, TowerState } from "@/domain/types";

export function decideNeed(
  _jev: Jev,
  _state: TowerState,
  _need: DecisionNeed,
): Promise<{ actions: RoutingAction[]; record: DecisionRecord | null }> {
  return Promise.reject(new Error("not implemented: decideNeed"));
}
