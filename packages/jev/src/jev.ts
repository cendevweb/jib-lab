import { createDecisionLog, type DecisionLog } from "./log";
import type {
  DecisionRecord,
  JevProvider,
  Questions,
  SystemOneRequest,
  SystemOneResult,
} from "./types";

export interface JevOptions {
  readonly provider: JevProvider;
  readonly log?: DecisionLog;
  /** Clock used for timestamps/latency. Inject a virtual clock in demos and tests. */
  readonly now?: () => number;
}

export interface Jev {
  readonly provider: JevProvider;
  readonly log: DecisionLog;
  /** Ask Jev, log the decision, return the typed result plus its audit record. */
  decide<const Q extends Questions>(
    name: string,
    request: SystemOneRequest<Q>,
    options?: { tags?: Record<string, string>; signal?: AbortSignal },
  ): Promise<{ result: SystemOneResult<Q>; record: DecisionRecord<Q> }>;
}

export function createJev(options: JevOptions): Jev {
  const log = options.log ?? createDecisionLog();
  const now = options.now ?? (() => Date.now());
  return {
    provider: options.provider,
    log,
    async decide(name, request, opts = {}) {
      const start = now();
      const askOptions = opts.signal ? { signal: opts.signal } : undefined;
      const result = await options.provider.ask(request, askOptions);
      const record = log.append({
        name,
        at: start,
        provider: options.provider.kind,
        request: request as SystemOneRequest,
        result: result as SystemOneResult<Questions>,
        latencyMs: Math.max(0, now() - start),
        tags: opts.tags ?? {},
      }) as DecisionRecord<typeof request.questions>;
      return { result, record };
    },
  };
}
