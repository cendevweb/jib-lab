"use client";

import { initialPlayback, type Playback, type Timeline, tick } from "@jib/demo-kit";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface ScenarioPlayer<S> extends Playback {
  readonly state: S;
  readonly caption: string | undefined;
  readonly duration: number;
  play(): void;
  pause(): void;
  toggle(): void;
  restart(): void;
  seek(t: number): void;
  setSpeed(speed: number): void;
}

/**
 * Drive a demo-kit Timeline with requestAnimationFrame.
 * `?autoplay=1` / `autoplay` starts immediately (handy for screen recording).
 * `?t=12000` seeks on mount (handy for screenshots and e2e tests).
 */
export function useScenarioPlayer<S>(
  timeline: Timeline<S>,
  options: { autoplay?: boolean; initialT?: number; speed?: number } = {},
): ScenarioPlayer<S> {
  const [p, setP] = useState<Playback>(() => ({
    ...initialPlayback,
    t: Math.min(options.initialT ?? 0, timeline.duration),
    playing: Boolean(options.autoplay),
    speed: options.speed ?? 1,
  }));
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (!p.playing) {
      last.current = null;
      return;
    }
    let raf = 0;
    const loop = (now: number) => {
      const dt = last.current == null ? 0 : now - last.current;
      last.current = now;
      setP((prev) => tick(prev, dt, timeline.duration));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [p.playing, timeline.duration]);

  const state = useMemo(() => timeline.stateAt(p.t), [timeline, p.t]);
  const seek = useCallback(
    (t: number) =>
      setP((prev) => ({
        ...prev,
        t: Math.max(0, Math.min(t, timeline.duration)),
        ended: t >= timeline.duration,
      })),
    [timeline.duration],
  );

  return {
    ...p,
    state,
    caption: timeline.captionAt(p.t),
    duration: timeline.duration,
    play: () =>
      setP((prev) => ({ ...prev, playing: true, ended: false, t: prev.ended ? 0 : prev.t })),
    pause: () => setP((prev) => ({ ...prev, playing: false })),
    toggle: () =>
      setP((prev) =>
        prev.playing
          ? { ...prev, playing: false }
          : { ...prev, playing: true, ended: false, t: prev.ended ? 0 : prev.t },
      ),
    restart: () => setP((prev) => ({ ...prev, t: 0, ended: false, playing: true })),
    seek,
    setSpeed: (speed) => setP((prev) => ({ ...prev, speed })),
  };
}
