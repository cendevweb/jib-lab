/**
 * `?t=<ms>&autoplay=1` → player options (SPEC §4.4, §6).
 */
import { DURATION_MS } from "./config";

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** t clamped to [0, DURATION_MS], NaN → 0; autoplay iff "1". */
export function parsePlayerParams(sp: Record<string, string | string[] | undefined>): {
  initialT: number;
  autoplay: boolean;
} {
  const raw = first(sp.t);
  const n = raw === undefined || raw.trim() === "" ? 0 : Number(raw);
  const initialT = Number.isNaN(n) ? 0 : Math.max(0, Math.min(DURATION_MS, n));
  return { initialT, autoplay: first(sp.autoplay) === "1" };
}
