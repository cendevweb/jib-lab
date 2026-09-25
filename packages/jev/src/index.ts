/**
 * @jib/jev — the shared Jev decision layer for every "Jev …" project in jib-lab.
 *
 * Jev is TypeSafe AI's System One model: it answers typed questions (choice / score / noul)
 * with calibrated probabilities instead of text. Projects build requests with the question
 * helpers, send them through a `JevProvider`, and render the logged `DecisionRecord`s.
 *
 * Browser-safe entry point. Server-only helpers (live SDK client, route handler) live in
 * `@jib/jev/server`.
 */
export { choice, noul, score } from "@typesafe-ai/sdk";
export { createHttpProvider } from "./http";
export { createJev, type Jev, type JevOptions } from "./jev";
export { createDecisionLog, type DecisionLog } from "./log";
export * from "./math";
export {
  createSimulatedProvider,
  type Resolver,
  type ResolverContext,
  type SimulatedAnswer,
  type SimulatedProviderOptions,
} from "./simulated";
export * from "./types";
export { assertValidRequest, JevError, LIMITS, systemOneRequestSchema } from "./validate";
