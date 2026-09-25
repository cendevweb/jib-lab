/**
 * `?t=<ms>&autoplay=1` → player options (SPEC §4.4, §6).
 * CONTRACT STUB (harness): implemented by WP-04.
 */

/** t clamped to [0, DURATION_MS], NaN → 0; autoplay iff "1". */
export function parsePlayerParams(_sp: Record<string, string | string[] | undefined>): {
  initialT: number;
  autoplay: boolean;
} {
  throw new Error("not implemented: parsePlayerParams");
}
