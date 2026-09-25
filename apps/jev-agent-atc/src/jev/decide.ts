/**
 * One decision need → Jev → routing actions (SPEC §4.3).
 */
import type { DecisionRecord, Jev } from "@jib/jev";
import type { DecisionNeed, RoutingAction, TowerState } from "@/domain/types";
import { fallbackActions, interpret } from "./policy";
import { buildRequest } from "./state";

export async function decideNeed(
  jev: Jev,
  state: TowerState,
  need: DecisionNeed,
): Promise<{ actions: RoutingAction[]; record: DecisionRecord | null }> {
  let record: DecisionRecord;
  try {
    const out = await jev.decide(need.kind, buildRequest(state, need), {
      tags: { task: need.taskId, tick: String(state.tick) },
    });
    record = out.record as DecisionRecord;
  } catch {
    // Provider error: deterministic rule-based routing, flagged `fallback`, no record.
    return { actions: fallbackActions(state, need), record: null };
  }
  return { actions: interpret(state, need, record.result.answers, record.id), record };
}
