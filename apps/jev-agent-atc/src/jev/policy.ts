/**
 * Policy: Jev answers → routing actions (SPEC §5.1).
 * CONTRACT STUB (harness): POLICY thresholds are final; functions implemented by WP-02.
 */
import type { Questions, SystemOneResult } from "@jib/jev";
import type { DecisionNeed, RoutingAction, TowerState } from "@/domain/types";

export const POLICY: {
  assignMinP: 0.5;
  parallelMinP: 0.6;
  blockedMinP: 0.5;
  reviewMinP: 0.5;
  failureMinP: 0.45;
  maxAttempts: 3;
} = {
  assignMinP: 0.5,
  parallelMinP: 0.6,
  blockedMinP: 0.5,
  reviewMinP: 0.5,
  failureMinP: 0.45,
  maxAttempts: 3,
};

export function interpret(
  _state: TowerState,
  _need: DecisionNeed,
  _answers: SystemOneResult<Questions>["answers"],
  _decisionId: string | null,
): RoutingAction[] {
  throw new Error("not implemented: interpret");
}

export function fallbackActions(_state: TowerState, _need: DecisionNeed): RoutingAction[] {
  throw new Error("not implemented: fallbackActions");
}
