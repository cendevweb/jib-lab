/**
 * Tower state → what Jev sees (SPEC §4.3).
 * CONTRACT STUB (harness): implemented by WP-02. Must not import src/domain/engine.ts.
 */
import type { SystemOneRequest } from "@jib/jev";
import type { DecisionNeed, JevState, TowerState } from "@/domain/types";

export function toJevState(_state: TowerState, _need: DecisionNeed): JevState {
  throw new Error("not implemented: toJevState");
}

/** `{ state: toJevState(state, need), questions: questionsFor(need.kind) }` */
export function buildRequest(_state: TowerState, _need: DecisionNeed): SystemOneRequest {
  throw new Error("not implemented: buildRequest");
}
