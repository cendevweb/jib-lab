import { z } from "zod";
import type { SystemOneRequest } from "./types";

/** Limits documented by TypeSafe for System One. */
export const LIMITS = { maxChoiceOptions: 255, minScoreLevels: 2, maxScoreLevels: 10 } as const;

export class JevError extends Error {
  constructor(
    readonly code: "invalid_request" | "provider_error" | "not_configured",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "JevError";
  }
}

const entry: z.ZodType = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(entry),
    z.record(z.string(), entry),
  ]),
);

const noulQ = z.object({
  type: z.literal("noul"),
  instructions: entry.optional(),
  criteria: z.object({ true: entry.optional(), false: entry.optional() }).nullable().optional(),
});
const choiceQ = z.object({
  type: z.literal("choice"),
  instructions: entry.optional(),
  criteria: z
    .record(z.string(), entry)
    .refine((c) => Object.keys(c).length >= 2, "a choice needs at least 2 options")
    .refine(
      (c) => Object.keys(c).length <= LIMITS.maxChoiceOptions,
      `a choice has at most ${LIMITS.maxChoiceOptions} options`,
    ),
});
const scoreQ = z.object({
  type: z.literal("score"),
  instructions: entry.optional(),
  criteria: z.array(entry).min(LIMITS.minScoreLevels).max(LIMITS.maxScoreLevels),
});

export const systemOneRequestSchema = z.object({
  state: entry,
  questions: z
    .record(z.string().min(1), z.discriminatedUnion("type", [noulQ, choiceQ, scoreQ]))
    .refine((q) => Object.keys(q).length > 0, "questions must not be empty"),
  model: z.string().optional(),
});

/** Throws `JevError("invalid_request")` when the request would be rejected by System One. */
export function assertValidRequest(request: unknown): asserts request is SystemOneRequest {
  const parsed = systemOneRequestSchema.safeParse(request);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".") || "request"}: ${i.message}`);
    throw new JevError("invalid_request", msg.join("; "));
  }
}
