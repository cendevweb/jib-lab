import { TypeSafeClient, type TypeSafeClientConfig } from "@typesafe-ai/sdk";
import type { JevProvider, Questions, SystemOneRequest, SystemOneResult } from "./types";
import { assertValidRequest, JevError } from "./validate";

/** Live provider backed by the official TypeSafe SDK. Server-side only. */
export function createLiveProvider(config: TypeSafeClientConfig = {}): JevProvider {
  const client = new TypeSafeClient(config);
  return {
    kind: "live",
    async ask<const Q extends Questions>(
      request: SystemOneRequest<Q>,
      opts?: { signal?: AbortSignal },
    ): Promise<SystemOneResult<Q>> {
      assertValidRequest(request);
      try {
        return await client.systemOne(request, opts?.signal ? { signal: opts.signal } : undefined);
      } catch (cause) {
        throw new JevError("provider_error", (cause as Error).message, { cause });
      }
    },
  };
}

/** True when a TypeSafe key is configured and simulation is not forced (`JEV_MODE=simulated`). */
export function isLiveConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.TYPESAFE_API_KEY?.trim()) && env.JEV_MODE !== "simulated";
}

/**
 * Pick the live provider when configured, otherwise the given simulated one.
 * Demos must always run without a key.
 */
export function resolveServerProvider(
  simulated: JevProvider,
  env: Record<string, string | undefined> = process.env,
): JevProvider {
  return isLiveConfigured(env) ? createLiveProvider() : simulated;
}

/**
 * Next.js App Router handler: `export const POST = createJevRouteHandler(provider)`.
 * Validates the body, forwards it to the provider, maps errors to JSON.
 */
export function createJevRouteHandler(provider: JevProvider) {
  return async function POST(req: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: { code: "invalid_request", message: "body must be JSON" } });
    }
    try {
      assertValidRequest(body);
      const result = await provider.ask(body as SystemOneRequest);
      return json(200, result);
    } catch (e) {
      const err = e instanceof JevError ? e : new JevError("provider_error", String(e));
      return json(err.code === "invalid_request" ? 400 : 502, {
        error: { code: err.code, message: err.message },
      });
    }
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
