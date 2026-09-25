/**
 * Demo scenario configuration (SPEC §4.4). Contract data — final (harness).
 */
import type { ScenarioSpec } from "@/domain/types";

export const TICK_MS = 500;
export const TICKS = 60;
export const DURATION_MS = 30_000;

/** SPEC §4.4 SCENARIO table (spec order matters). */
export const SCENARIO: ScenarioSpec = {
  tasks: [
    {
      id: "api-orders",
      title: "POST /orders endpoint",
      kind: "backend",
      work: 12,
      files: ["api/orders.ts", "db/schema.sql"],
      faults: [{ attempt: 1, atUnit: 11, kind: "logic", message: "duplicate key on POST /orders" }],
    },
    {
      id: "pricing-tests",
      title: "Pricing unit tests",
      kind: "tests",
      work: 22,
      files: ["src/pricing/pricing.test.ts"],
      faults: [],
    },
    {
      id: "idempotency-research",
      title: "Idempotency key strategy",
      kind: "research",
      work: 8,
      files: ["docs/idempotency.md"],
      faults: [],
    },
    {
      id: "checkout-ui",
      title: "Checkout form",
      kind: "frontend",
      work: 14,
      files: ["app/checkout/page.tsx", "components/CheckoutForm.tsx"],
      faults: [],
    },
    {
      id: "e2e-checkout",
      title: "Checkout e2e test",
      kind: "tests",
      work: 10,
      files: ["e2e/checkout.spec.ts"],
      faults: [],
    },
  ],
  dependencies: [
    { task: "checkout-ui", on: "api-orders", kind: "contract" },
    { task: "e2e-checkout", on: "api-orders", kind: "hard" },
    { task: "e2e-checkout", on: "checkout-ui", kind: "hard" },
  ],
  tokenBudget: 150_000,
};

export { DEFAULT_SEED } from "@/jev/resolvers";
