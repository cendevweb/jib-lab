import {
  argmax,
  clamp01,
  confidenceOf,
  expectedScore,
  hashString,
  normalize,
  round,
  stableStringify,
} from "./math";
import type {
  ChoiceResponse,
  JevProvider,
  NoulResponse,
  Question,
  Questions,
  ScoreResponse,
  SystemOneRequest,
  SystemOneResult,
} from "./types";
import { assertValidRequest } from "./validate";

/**
 * What a resolver returns for one question:
 * - choice → weights keyed by label (missing labels get weight 0)
 * - score  → weights per level, index 0..n-1
 * - noul   → probability of "yes" in [0, 1]
 */
export type SimulatedAnswer =
  | Readonly<Record<string, number | undefined>>
  | readonly number[]
  | number;

export interface ResolverContext<S = unknown> {
  /** Question name in the request (`questions` key). */
  readonly name: string;
  readonly question: Question;
  readonly state: S;
  /** Deterministic noise in [0, 1) derived from (seed, name, state). */
  readonly noise: () => number;
}

export type Resolver<S = unknown> = (ctx: ResolverContext<S>) => SimulatedAnswer | undefined;

export interface SimulatedProviderOptions<S = unknown> {
  /** Per-question resolvers, keyed by question name. */
  readonly resolvers?: Readonly<Record<string, Resolver<S>>>;
  /** Called when no named resolver matches (or it returns `undefined`). */
  readonly fallback?: Resolver<S>;
  /** Seed for deterministic noise. Same seed + same request ⇒ same answer. */
  readonly seed?: number;
  /** Optional artificial latency (ms). Uses `sleep` so tests can inject a fake. */
  readonly latencyMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
  /** Model name reported in results. */
  readonly model?: string;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Default fallback: deterministic pseudo-random weights, so unknown questions still answer. */
const seededFallback: Resolver = ({ question, noise }) => {
  switch (question.type) {
    case "noul":
      return noise();
    case "choice":
      return Object.fromEntries(Object.keys(question.criteria).map((k) => [k, noise() + 0.05]));
    case "score":
      return question.criteria.map(() => noise() + 0.05);
  }
};

function toChoice(question: Extract<Question, { type: "choice" }>, raw: SimulatedAnswer) {
  const labels = Object.keys(question.criteria);
  const weights =
    typeof raw === "number"
      ? labels.map(() => 1)
      : Array.isArray(raw)
        ? labels.map((_, i) => (raw as readonly number[])[i] ?? 0)
        : labels.map((l) => (raw as Record<string, number | undefined>)[l] ?? 0);
  const probs = normalize(weights).map((p) => round(p));
  const best = argmax(probs);
  const response: ChoiceResponse = {
    type: "choice",
    choice: labels[best] as string,
    confidence: round(confidenceOf(probs)),
    probabilities: Object.fromEntries(labels.map((l, i) => [l, probs[i] ?? 0])),
  };
  return response;
}

function toScore(question: Extract<Question, { type: "score" }>, raw: SimulatedAnswer) {
  const levels = question.criteria.length;
  const weights =
    typeof raw === "number"
      ? Array.from({ length: levels }, (_, i) => (i === Math.round(raw) ? 1 : 0))
      : Array.isArray(raw)
        ? Array.from({ length: levels }, (_, i) => (raw as readonly number[])[i] ?? 0)
        : Array.from(
            { length: levels },
            (_, i) => (raw as Record<string, number | undefined>)[String(i)] ?? 0,
          );
  const probs = normalize(weights).map((p) => round(p));
  const response: ScoreResponse = {
    type: "score",
    score: round(expectedScore(probs)),
    confidence: round(confidenceOf(probs)),
    legend: Object.fromEntries(question.criteria.map((c, i) => [String(i), c])) as never,
    probabilities: Object.fromEntries(probs.map((p, i) => [String(i), p])) as never,
  };
  return response;
}

function toNoul(raw: SimulatedAnswer): NoulResponse {
  const p =
    typeof raw === "number"
      ? raw
      : Array.isArray(raw)
        ? (raw[0] ?? 0.5)
        : ((raw as Record<string, number | undefined>).true ?? 0.5);
  return { type: "noul", noul: round(clamp01(p)) };
}

/**
 * Offline, deterministic Jev. Demos run on it by default so they are recordable,
 * testable and free; the live provider is a drop-in swap.
 */
export function createSimulatedProvider<S = unknown>(
  options: SimulatedProviderOptions<S> = {},
): JevProvider {
  const { resolvers = {}, seed = 1, latencyMs = 0, model = "jev-simulated" } = options;
  const fallback = (options.fallback ?? seededFallback) as Resolver<S>;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  return {
    kind: "simulated",
    async ask<const Q extends Questions>(
      request: SystemOneRequest<Q>,
    ): Promise<SystemOneResult<Q>> {
      assertValidRequest(request);
      if (latencyMs > 0) await sleep(latencyMs);
      const stateKey = stableStringify(request.state);
      const answers: Record<string, unknown> = {};
      let inputTokens = Math.ceil(stateKey.length / 4);
      for (const [name, question] of Object.entries(request.questions) as [string, Question][]) {
        const noise = mulberry32(hashString(`${seed}|${name}|${stateKey}`));
        const ctx: ResolverContext<S> = { name, question, state: request.state as S, noise };
        const raw = resolvers[name]?.(ctx) ?? fallback(ctx) ?? seededFallback(ctx as never);
        inputTokens += Math.ceil(stableStringify(question).length / 4);
        answers[name] =
          question.type === "choice"
            ? toChoice(question, raw as SimulatedAnswer)
            : question.type === "score"
              ? toScore(question, raw as SimulatedAnswer)
              : toNoul(raw as SimulatedAnswer);
      }
      return {
        model: request.model ?? model,
        answers: answers as SystemOneResult<Q>["answers"],
        usage: { input_tokens: inputTokens, output_tokens: Object.keys(answers).length },
      };
    },
  };
}
