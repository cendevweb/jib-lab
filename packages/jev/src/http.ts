import type { JevProvider, Questions, SystemOneRequest, SystemOneResult } from "./types";
import { JevError } from "./validate";

/**
 * Browser-safe provider that calls a Next.js route created with `createJevRouteHandler`.
 * The TypeSafe API key never leaves the server.
 */
export function createHttpProvider(options: {
  endpoint: string;
  fetch?: typeof fetch;
}): JevProvider {
  const doFetch = options.fetch ?? fetch;
  return {
    kind: "http",
    async ask<const Q extends Questions>(
      request: SystemOneRequest<Q>,
      opts?: { signal?: AbortSignal },
    ): Promise<SystemOneResult<Q>> {
      const res = await doFetch(options.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
        ...(opts?.signal ? { signal: opts.signal } : {}),
      });
      const body = (await res.json().catch(() => null)) as
        | SystemOneResult<Q>
        | { error: { code: JevError["code"]; message: string } }
        | null;
      if (!res.ok || !body || "error" in body) {
        const err = body && "error" in body ? body.error : undefined;
        throw new JevError(err?.code ?? "provider_error", err?.message ?? `HTTP ${res.status}`);
      }
      return body;
    },
  };
}
