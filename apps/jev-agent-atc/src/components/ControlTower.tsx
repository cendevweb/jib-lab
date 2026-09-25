"use client";
/**
 * Client player wiring (SPEC §6): useScenarioPlayer over the precomputed run →
 * TowerCanvas + ScenarioControls, and a sidebar with the latest decision, the shared state
 * Jev saw, and the decision log.
 */
import { DecisionLogPanel, Panel, ScenarioControls, useScenarioPlayer } from "@jib/ui";
import { type ReactElement, useMemo } from "react";
import type { ScenarioRun } from "@/domain/types";
import { DecisionSpotlight, SharedStatePanel } from "./DecisionSpotlight";
import { createTowerTimeline, recordsUpTo, spotlightRecord, summarizeRecord } from "./selectors";
import { TowerCanvas } from "./TowerCanvas";
import "./tower.css";

export function ControlTower({
  run,
  initialT = 0,
  autoplay = false,
}: {
  run: ScenarioRun;
  initialT?: number;
  autoplay?: boolean;
}): ReactElement {
  const timeline = useMemo(() => createTowerTimeline(run), [run]);
  const player = useScenarioPlayer(timeline, { initialT, autoplay });
  // Records are stamped on tick boundaries (virtual clock), so `at <= t` ⇔ `at <= tickT`;
  // snapping keeps the sidebar stable between animation frames.
  const tickT = Math.floor(player.t / run.tickMs) * run.tickMs;
  const record = useMemo(() => spotlightRecord(run, tickT), [run, tickT]);
  const records = useMemo(() => recordsUpTo(run, tickT), [run, tickT]);

  return (
    <div className="atc-layout">
      <div className="atc-main">
        <TowerCanvas frame={player.state} t={player.t} />
        <ScenarioControls player={player} />
      </div>
      <aside className="atc-side" aria-label="Jev decisions">
        <Panel title="Latest decision" className="atc-panel atc-panel--spotlight">
          <DecisionSpotlight record={record} />
        </Panel>
        <Panel title="Shared state · what Jev sees" className="atc-panel atc-panel--state">
          <SharedStatePanel record={record} />
        </Panel>
        <Panel title="Decision log" className="atc-panel atc-panel--log">
          <DecisionLogPanel records={records} summarize={summarizeRecord} />
        </Panel>
      </aside>
    </div>
  );
}
