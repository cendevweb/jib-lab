"use client";

import type { ScenarioPlayer } from "./useScenarioPlayer";

const SPEEDS = [0.5, 1, 2, 4] as const;

/** Play/pause, restart, speed and progress for a scenario. Stable test ids for e2e. */
export function ScenarioControls({ player }: { player: ScenarioPlayer<unknown> }) {
  const pct = player.duration ? (player.t / player.duration) * 100 : 0;
  return (
    <div className="jib-controls">
      <button
        type="button"
        className="jib-btn"
        data-testid="scenario-toggle"
        onClick={player.toggle}
      >
        {player.playing ? "Pause" : player.ended ? "Replay" : "Play"}
      </button>
      <button
        type="button"
        className="jib-btn"
        data-testid="scenario-restart"
        onClick={player.restart}
      >
        Restart
      </button>
      {SPEEDS.map((s) => (
        <button
          key={s}
          type="button"
          className="jib-btn"
          aria-pressed={player.speed === s}
          onClick={() => player.setSpeed(s)}
        >
          {s}×
        </button>
      ))}
      <div
        className="jib-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={Math.round(player.duration)}
        aria-valuenow={Math.round(player.t)}
        data-testid="scenario-progress"
      >
        <span style={{ width: `${pct}%` }} />
      </div>
      <span className="jib-caption" data-testid="scenario-caption">
        {(player.t / 1000).toFixed(1)}s · {player.caption ?? "ready"}
      </span>
    </div>
  );
}
