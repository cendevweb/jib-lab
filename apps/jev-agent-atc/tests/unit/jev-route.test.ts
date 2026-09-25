// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest } from "@/jev/state";
import { API_FAILURE, makeState, need } from "./fixtures";

type RouteModule = { POST: (req: Request) => Promise<Response> };

async function loadRoute(): Promise<RouteModule> {
  vi.resetModules();
  return (await import("../../app/api/jev/route")) as RouteModule;
}

function post(body: string): Request {
  return new Request("http://localhost/api/jev", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const failureBoard = () =>
  makeState({
    tick: 13,
    tasks: {
      "api-orders": { status: "failed", agent: "backend", progress: 11, since: 12, startedAt: 1 },
      "pricing-tests": { status: "running", agent: "tests", progress: 11, startedAt: 2 },
      "idempotency-research": { status: "done", progress: 8, startedAt: 3 },
      "checkout-ui": { status: "running", agent: "frontend", progress: 9, startedAt: 4 },
      "e2e-checkout": { status: "blocked", blockedBy: ["api-orders", "checkout-ui"], holdKey: "" },
    },
    recentFailures: [API_FAILURE],
  });

describe("POST /api/jev", () => {
  beforeEach(() => {
    vi.stubEnv("TYPESAFE_API_KEY", "");
    vi.stubEnv("JEV_MODE", "simulated");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("[AC-09] answers a failure request with the scripted simulated answer (research 0.76)", async () => {
    const { POST } = await loadRoute();
    const body = buildRequest(failureBoard(), need("failure", "api-orders"));
    const res = await POST(post(JSON.stringify(body)));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      answers: {
        onFailure: { type: string; choice: string; probabilities: Record<string, number> };
      };
    };
    expect(json.answers.onFailure.type).toBe("choice");
    expect(json.answers.onFailure.choice).toBe("research");
    expect(json.answers.onFailure.probabilities.research).toBeCloseTo(0.76, 4);
    expect(json.answers.onFailure.probabilities.retry).toBeCloseTo(0.18, 4);
    expect(json.answers.onFailure.probabilities.escalate).toBeCloseTo(0.06, 4);
  });

  it("[AC-09] returns 400 for an invalid body", async () => {
    const { POST } = await loadRoute();
    const empty = await POST(post(JSON.stringify({ state: {}, questions: {} })));
    expect(empty.status).toBe(400);
    const notJson = await POST(post("not json"));
    expect(notJson.status).toBe(400);
    const badScore = await POST(
      post(
        JSON.stringify({ state: null, questions: { risk: { type: "score", criteria: ["one"] } } }),
      ),
    );
    expect(badScore.status).toBe(400);
  });
});
