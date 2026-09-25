/**
 * Jev request/answer types.
 *
 * These mirror the TypeSafe System One wire format (`POST /v1/systemone`) exactly, so a
 * request built here can be sent to the live API unchanged and a simulated answer is
 * indistinguishable from a live one for the calling code.
 */
export type {
  ChoiceCriteria,
  ChoiceQuestion,
  ChoiceResponse,
  EntryType,
  JsonValue,
  NoulQuestion,
  NoulResponse,
  Question,
  Questions,
  ResultFor,
  ScoreCriteria,
  ScoreQuestion,
  ScoreResponse,
  SystemOneRequest,
  SystemOneResult,
  Usage,
} from "@typesafe-ai/sdk";

import type { Questions, SystemOneRequest, SystemOneResult } from "@typesafe-ai/sdk";

/** Where an answer came from. `simulated` answers are deterministic and offline. */
export type ProviderKind = "live" | "simulated" | "http";

/** Anything that can answer a System One request. */
export interface JevProvider {
  readonly kind: ProviderKind;
  ask<const Q extends Questions>(
    request: SystemOneRequest<Q>,
    options?: { signal?: AbortSignal },
  ): Promise<SystemOneResult<Q>>;
}

/** One logged Jev decision — the unit of the audit trail every Jev demo shows. */
export interface DecisionRecord<Q extends Questions = Questions> {
  /** Monotonic id within a log (`d1`, `d2`, …). */
  readonly id: string;
  /** Caller-chosen decision name, e.g. `"route-task"`. */
  readonly name: string;
  /** Timestamp from the injected clock (ms). */
  readonly at: number;
  readonly provider: ProviderKind;
  readonly request: SystemOneRequest<Q>;
  readonly result: SystemOneResult<Q>;
  /** Wall time spent in the provider, measured with the injected clock. */
  readonly latencyMs: number;
  /** Free-form tags (task id, agent id…) to filter the log. */
  readonly tags: Readonly<Record<string, string>>;
}
