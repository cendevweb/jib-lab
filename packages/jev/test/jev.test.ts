import { describe, expect, it } from "vitest";
import {
  choice,
  createDecisionLog,
  createHttpProvider,
  createJev,
  createSimulatedProvider,
} from "../src";
import { createJevRouteHandler, isLiveConfigured, resolveServerProvider } from "../src/server";

describe("createJev", () => {
  it("logs every decision with tags, provider and latency from the injected clock", async () => {
    let t = 1000;
    const provider = createSimulatedProvider({
      resolvers: { pick: () => ({ a: 3, b: 1 }) },
    });
    const slow = {
      ...provider,
      ask: async (r: never) => {
        t += 40;
        return provider.ask(r);
      },
    };
    const jev = createJev({ provider: slow as typeof provider, now: () => t });
    const seen: string[] = [];
    jev.log.subscribe((r) => seen.push(r.id));
    const { result, record } = await jev.decide(
      "route",
      { state: { task: "T1" }, questions: { pick: choice("?", { a: null, b: null }) } },
      { tags: { task: "T1" } },
    );
    expect(result.answers.pick.choice).toBe("a");
    expect(record).toMatchObject({
      id: "d1",
      name: "route",
      at: 1000,
      latencyMs: 40,
      provider: "simulated",
    });
    expect(jev.log.filter({ task: "T1" })).toHaveLength(1);
    expect(seen).toEqual(["d1"]);
  });

  it("log keeps newest N records", () => {
    const log = createDecisionLog({ limit: 2 });
    for (let i = 0; i < 3; i++) log.append({ name: `n${i}` } as never);
    expect(log.records.map((r) => r.id)).toEqual(["d2", "d3"]);
  });
});

describe("route handler + http provider", () => {
  const sim = createSimulatedProvider({ resolvers: { pick: () => ({ b: 1 }) } });
  const handler = createJevRouteHandler(sim);
  const fakeFetch = (async (_url: string, init?: RequestInit) =>
    handler(new Request("http://x/api/jev", init))) as typeof fetch;

  it("round-trips a request through the server route", async () => {
    const http = createHttpProvider({ endpoint: "/api/jev", fetch: fakeFetch });
    const res = await http.ask({
      state: "s",
      questions: { pick: choice("?", { a: null, b: null }) },
    });
    expect(res.answers.pick.choice).toBe("b");
  });

  it("maps invalid requests to 400 and JevError on the client", async () => {
    const res = await handler(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({ state: "s", questions: {} }),
      }),
    );
    expect(res.status).toBe(400);
    const http = createHttpProvider({ endpoint: "/api/jev", fetch: fakeFetch });
    await expect(http.ask({ state: "s", questions: {} })).rejects.toMatchObject({
      code: "invalid_request",
    });
  });

  it("uses simulation unless a key is set and JEV_MODE is not simulated", () => {
    expect(isLiveConfigured({})).toBe(false);
    expect(isLiveConfigured({ TYPESAFE_API_KEY: "k", JEV_MODE: "simulated" })).toBe(false);
    expect(isLiveConfigured({ TYPESAFE_API_KEY: "k" })).toBe(true);
    expect(resolveServerProvider(sim, {}).kind).toBe("simulated");
  });
});
