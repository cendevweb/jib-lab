/**
 * Virtual clock: time only moves when `advance` / `advanceTo` is called.
 * Timers fire in (time, insertion) order, and timers scheduled by a firing timer
 * within the advanced window also fire — like a real event loop, but deterministic.
 */
export interface VirtualClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(id: number): void;
  advance(ms: number): void;
  advanceTo(t: number): void;
  /** Number of pending timers. */
  pending(): number;
  reset(t?: number): void;
}

export function createVirtualClock(start = 0): VirtualClock {
  let t = start;
  let seq = 0;
  let timers: { id: number; at: number; fn: () => void }[] = [];
  const clock: VirtualClock = {
    now: () => t,
    setTimeout(fn, ms) {
      seq += 1;
      timers.push({ id: seq, at: t + Math.max(0, ms), fn });
      return seq;
    },
    clearTimeout(id) {
      timers = timers.filter((x) => x.id !== id);
    },
    advance(ms) {
      clock.advanceTo(t + ms);
    },
    advanceTo(target) {
      if (target < t) throw new Error(`cannot go back in time (${t} → ${target})`);
      for (;;) {
        const due = timers
          .filter((x) => x.at <= target)
          .sort((a, b) => a.at - b.at || a.id - b.id)[0];
        if (!due) break;
        timers = timers.filter((x) => x !== due);
        t = due.at;
        due.fn();
      }
      t = target;
    },
    pending: () => timers.length,
    reset(to = start) {
      t = to;
      timers = [];
    },
  };
  return clock;
}
