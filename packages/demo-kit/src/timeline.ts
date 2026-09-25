/**
 * Scripted demo timeline. A scenario is a list of beats at fixed offsets; `seek(t)` replays
 * every beat up to `t` against a fresh state, so scrubbing/replaying is always consistent.
 */
export interface Beat<S> {
  /** Offset from scenario start, ms. */
  readonly at: number;
  /** Short label for captions / chapter markers. */
  readonly label: string;
  /** Pure state transition. */
  readonly apply: (state: S) => S;
}

export interface Timeline<S> {
  readonly duration: number;
  readonly beats: readonly Beat<S>[];
  /** State after every beat with `at <= t`. */
  stateAt(t: number): S;
  /** Beats in the half-open window (from, to]. */
  beatsBetween(from: number, to: number): Beat<S>[];
  /** Label of the last beat reached at `t` (caption). */
  captionAt(t: number): string | undefined;
}

export function createTimeline<S>(options: {
  initial: () => S;
  beats: readonly Beat<S>[];
  /** Defaults to last beat + 1 s. */
  duration?: number;
}): Timeline<S> {
  const beats = [...options.beats].sort((a, b) => a.at - b.at);
  const last = beats.at(-1)?.at ?? 0;
  const duration = options.duration ?? last + 1000;
  if (duration < last) throw new Error("duration shorter than last beat");
  return {
    duration,
    beats,
    stateAt(t) {
      let s = options.initial();
      for (const b of beats) if (b.at <= t) s = b.apply(s);
      return s;
    },
    beatsBetween(from, to) {
      return beats.filter((b) => b.at > from && b.at <= to);
    },
    captionAt(t) {
      return beats.filter((b) => b.at <= t).at(-1)?.label;
    },
  };
}

/** Playback state machine independent of any renderer (React hook lives in @jib/ui). */
export interface Playback {
  readonly t: number;
  readonly playing: boolean;
  readonly speed: number;
  readonly ended: boolean;
}

export function tick(p: Playback, dtMs: number, duration: number): Playback {
  if (!p.playing) return p;
  const t = Math.min(duration, p.t + dtMs * p.speed);
  return { ...p, t, ended: t >= duration, playing: t < duration };
}

export const initialPlayback: Playback = { t: 0, playing: false, speed: 1, ended: false };
