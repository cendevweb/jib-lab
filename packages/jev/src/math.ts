/** Pure helpers for probability distributions. No I/O, fully deterministic. */

/** Normalise non-negative weights so they sum to 1. All-zero input becomes uniform. */
export function normalize(weights: readonly number[]): number[] {
  if (weights.length === 0) return [];
  const clean = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const total = clean.reduce((a, b) => a + b, 0);
  if (total === 0) return clean.map(() => 1 / clean.length);
  return clean.map((w) => w / total);
}

/** Index of the largest value; ties resolve to the first index. */
export function argmax(values: readonly number[]): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) {
    if ((values[i] ?? -Infinity) > (values[best] ?? -Infinity)) best = i;
  }
  return best;
}

/**
 * Confidence in [0, 1] derived from the shape of a distribution:
 * `1 - H(p) / ln(n)` (normalised entropy). A one-hot distribution → 1, uniform → 0.
 */
export function confidenceOf(probabilities: readonly number[]): number {
  const n = probabilities.length;
  if (n <= 1) return 1;
  let h = 0;
  for (const p of probabilities) if (p > 0) h -= p * Math.log(p);
  const c = 1 - h / Math.log(n);
  return clamp01(c);
}

/** Expected value of a score distribution indexed from 0. */
export function expectedScore(probabilities: readonly number[]): number {
  return probabilities.reduce((acc, p, i) => acc + p * i, 0);
}

export function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

/** Round to `digits` decimals — keeps snapshots and UI labels stable. */
export function round(x: number, digits = 4): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

/** Stable 32-bit FNV-1a hash of a string. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** JSON serialisation with sorted object keys, so equal states hash equally. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}
