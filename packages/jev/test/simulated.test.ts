import { describe, expect, it } from "vitest";
import { choice, createSimulatedProvider, JevError, noul, score } from "../src";

const questions = {
  next: choice("Who executes next?", { frontend: null, backend: null, research: null }),
  severity: score("How severe?", ["low", "medium", "high"] as const),
  retry: noul("Should the agent retry?"),
};

describe("simulated provider", () => {
  it("returns SDK-shaped answers from resolvers", async () => {
    const jev = createSimulatedProvider<{ failures: number }>({
      resolvers: {
        next: ({ state }) => (state.failures > 1 ? { research: 8, backend: 1 } : { backend: 1 }),
        severity: () => [0, 1, 3],
        retry: ({ state }) => (state.failures > 1 ? 0.2 : 0.9),
      },
    });
    const { answers, model, usage } = await jev.ask({ state: { failures: 2 }, questions });
    expect(model).toBe("jev-simulated");
    expect(answers.next.type).toBe("choice");
    expect(answers.next.choice).toBe("research");
    expect(answers.next.probabilities.research).toBeCloseTo(8 / 9, 3);
    expect(answers.next.probabilities.frontend).toBe(0);
    expect(answers.next.confidence).toBeGreaterThan(0);
    expect(answers.severity.score).toBeCloseTo(1.75, 3);
    expect(answers.severity.legend["2"]).toBe("high");
    expect(answers.retry.noul).toBe(0.2);
    expect(usage.input_tokens).toBeGreaterThan(0);
  });

  it("is deterministic for the same seed and state, different across seeds", async () => {
    const a = createSimulatedProvider({ seed: 7 });
    const b = createSimulatedProvider({ seed: 7 });
    const c = createSimulatedProvider({ seed: 8 });
    const req = { state: { x: 1, y: [1, 2] }, questions };
    const [ra, rb, rc] = await Promise.all([a.ask(req), b.ask(req), c.ask(req)]);
    expect(ra).toEqual(rb);
    expect(ra).not.toEqual(rc);
  });

  it("probabilities of a choice sum to ~1", async () => {
    const { answers } = await createSimulatedProvider({ seed: 3 }).ask({ state: "s", questions });
    const sum = Object.values(answers.next.probabilities).reduce((x, y) => x + y, 0);
    expect(sum).toBeCloseTo(1, 3);
  });

  it("rejects invalid requests like the live API would", async () => {
    const p = createSimulatedProvider();
    await expect(p.ask({ state: null, questions: {} })).rejects.toBeInstanceOf(JevError);
    await expect(
      p.ask({ state: null, questions: { s: { type: "score", criteria: ["only-one"] } as never } }),
    ).rejects.toThrow(/criteria/);
  });

  it("honours latency through an injectable sleep", async () => {
    const waits: number[] = [];
    const p = createSimulatedProvider({
      latencyMs: 120,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    await p.ask({ state: "s", questions: { r: noul("?") } });
    expect(waits).toEqual([120]);
  });
});
