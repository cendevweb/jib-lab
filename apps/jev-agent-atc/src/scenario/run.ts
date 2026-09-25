/**
 * Deterministic 30 s run: virtual clock + createJev + engine loop (SPEC §4.4).
 */
import { createVirtualClock } from "@jib/demo-kit";
import { createJev, type JevProvider } from "@jib/jev";
import {
  advanceWork,
  agentsOf,
  applyActions,
  createInitialState,
  decisionsNeeded,
  startAssigned,
  visibleEdges,
} from "@/domain/engine";
import type { ScenarioRun, ScenarioSpec, TowerFrame, TowerState } from "@/domain/types";
import { decideNeed } from "@/jev/decide";
import { createAtcProvider } from "@/jev/resolvers";
import { captionForAction, captionForEvent, INTRO_CAPTION, summaryCaption } from "./captions";
import { DEFAULT_SEED, SCENARIO, TICK_MS, TICKS } from "./config";

function frameOf(state: TowerState, t: number, caption: string, decisionIds: string[]): TowerFrame {
  return {
    tick: state.tick,
    t,
    state,
    agents: agentsOf(state),
    edges: visibleEdges(state),
    caption,
    decisionIds,
  };
}

export async function runScenario(
  options: {
    seed?: number;
    provider?: JevProvider;
    spec?: ScenarioSpec;
    ticks?: number;
    tickMs?: number;
  } = {},
): Promise<ScenarioRun> {
  const seed = options.seed ?? DEFAULT_SEED;
  const provider = options.provider ?? createAtcProvider({ seed });
  const spec = options.spec ?? SCENARIO;
  const ticks = options.ticks ?? TICKS;
  const tickMs = options.tickMs ?? TICK_MS;

  const clock = createVirtualClock(0);
  const jev = createJev({ provider, now: clock.now });

  let state = createInitialState(spec);
  let caption = INTRO_CAPTION;
  const frames: TowerFrame[] = [frameOf(state, 0, caption, [])];

  for (let k = 1; k <= ticks; k += 1) {
    const t = k * tickMs;
    clock.advanceTo(t);

    // Highest priority wins; ties → first processed (strict `>`).
    const pick: { best: { text: string; priority: number } | null } = { best: null };
    const consider = (c: { text: string; priority: number } | null) => {
      if (c && (!pick.best || c.priority > pick.best.priority)) pick.best = c;
    };

    // (1) work
    const advanced = advanceWork(state);
    state = advanced.state;
    for (const event of advanced.events) consider(captionForEvent(event, state));

    // (2) decisions, each on the current state (earlier ones of this tick already applied)
    const decisionIds: string[] = [];
    for (const need of decisionsNeeded(state, advanced.events)) {
      const { actions, record } = await decideNeed(jev, state, need);
      if (record) decisionIds.push(record.id);
      state = applyActions(state, actions);
      const answers = record ? record.result.answers : null;
      for (const action of actions) consider(captionForAction(action, state, answers));
    }

    // (3) free gates pick up queued work
    state = startAssigned(state);

    if (k === ticks - 2) caption = summaryCaption(state);
    else if (pick.best) caption = pick.best.text;

    frames.push(frameOf(state, t, caption, decisionIds));
  }

  return {
    seed,
    provider: provider.kind,
    tickMs,
    duration: ticks * tickMs,
    frames,
    records: [...jev.log.records],
  };
}
