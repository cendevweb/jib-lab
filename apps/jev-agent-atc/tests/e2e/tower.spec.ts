import { expect, type Page, test } from "@playwright/test";

const AGENTS = ["frontend", "backend", "tests", "research", "review"] as const;
const TASKS = [
  "api-orders",
  "pricing-tests",
  "idempotency-research",
  "checkout-ui",
  "e2e-checkout",
] as const;

async function open(page: Page, query: string) {
  await page.goto(`/${query}`);
  await expect(page.getByTestId("tower")).toBeVisible();
}

/** Every observable attribute of the tower for a given URL (used for reproducibility). */
async function towerSnapshot(page: Page) {
  const tick = await page.getByTestId("tower").getAttribute("data-tick");
  const cards = await page
    .locator('[data-testid^="task-"]')
    .evaluateAll((els) =>
      els.map((e) =>
        ["data-testid", "data-status", "data-zone", "data-agent", "data-stage", "data-attempt"].map(
          (a) => e.getAttribute(a),
        ),
      ),
    );
  const gates = await page
    .locator('[data-testid^="gate-"]')
    .evaluateAll((els) =>
      els.map((e) => [
        e.getAttribute("data-testid"),
        e.getAttribute("data-status"),
        e.getAttribute("data-task"),
      ]),
    );
  const edges = await page
    .getByTestId("route-edge")
    .evaluateAll((els) =>
      els.map((e) => [
        e.getAttribute("data-task"),
        e.getAttribute("data-action"),
        e.getAttribute("data-p"),
        e.textContent?.trim(),
      ]),
    );
  const caption = await page.getByTestId("tower-caption").textContent();
  return { tick, cards, gates, edges, caption };
}

test.describe("control tower — seeded frames", () => {
  test("[AC-19] t=0: title, simulated badge, idle gates, 5 queued cards on approach, intro caption", async ({
    page,
  }) => {
    await open(page, "?t=0");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Jev Agent Air-Traffic Controller",
    );
    await expect(page.getByTestId("provider-badge")).toContainText("simulated");
    await expect(page.getByTestId("tower")).toHaveAttribute("data-tick", "0");
    for (const id of AGENTS) {
      await expect(page.getByTestId(`gate-${id}`)).toHaveAttribute("data-status", "idle");
    }
    await expect(page.locator('[data-testid^="task-"]')).toHaveCount(5);
    for (const id of TASKS) {
      const card = page.getByTestId(`task-${id}`);
      await expect(card).toHaveAttribute("data-status", "queued");
      await expect(card).toHaveAttribute("data-zone", "approach");
    }
    await expect(page.getByTestId("scenario-caption")).toContainText(
      "5 tasks on approach · agents do the work, Jev decides how it moves",
    );
  });

  test("[AC-19] t=3000: four gates busy, e2e-checkout held with two red dependency lanes", async ({
    page,
  }) => {
    await open(page, "?t=3000");
    await expect(page.getByTestId("tower")).toHaveAttribute("data-tick", "6");
    for (const id of ["frontend", "backend", "tests", "research"]) {
      await expect(page.getByTestId(`gate-${id}`)).toHaveAttribute("data-status", "busy");
    }
    await expect(page.getByTestId("gate-review")).toHaveAttribute("data-status", "idle");
    await expect(page.getByTestId("task-e2e-checkout")).toHaveAttribute("data-status", "blocked");
    const lanes = page.locator('[data-testid^="dependency-lane-e2e-checkout-"]');
    await expect(lanes).toHaveCount(2);
    await expect(page.getByTestId("dependency-lane-e2e-checkout-api-orders")).toHaveAttribute(
      "data-state",
      "blocked",
    );
    await expect(page.getByTestId("dependency-lane-e2e-checkout-checkout-ui")).toHaveAttribute(
      "data-state",
      "blocked",
    );
  });

  test("[AC-20] t=6500: the re-route — research 76% edge, failure spotlight, paused UI, tests keep running", async ({
    page,
  }) => {
    await open(page, "?t=6500");
    const reroute = page.locator(
      '[data-testid="route-edge"][data-task="api-orders"][data-action="reroute"]',
    );
    await expect(reroute).toHaveCount(1);
    await expect(reroute).toHaveText("research 76%");

    const spotlight = page.getByTestId("latest-decision");
    await expect(spotlight).toHaveAttribute("data-decision", "failure");
    await expect(spotlight).toHaveAttribute("data-task", "api-orders");
    const bars = spotlight.getByRole("list", { name: "onFailure" });
    const research = bars.locator('[data-label="research"]');
    await expect(research).toHaveAttribute("data-selected", "true");
    await expect(research).toContainText("76%");
    const retry = bars.locator('[data-label="retry"]');
    await expect(retry).toContainText("18%");
    await expect(retry).not.toHaveAttribute("data-selected", "true");

    await expect(page.getByTestId("task-checkout-ui")).toHaveAttribute("data-status", "blocked");
    await expect(page.getByTestId("task-pricing-tests")).toHaveAttribute("data-status", "running");
    await expect(page.getByTestId("task-api-orders")).toHaveAttribute("data-agent", "research");

    const logItem = page.getByTestId("decision-log").locator('li[data-decision="failure"]');
    await expect(logItem).toHaveCount(1);
    await expect(logItem).toContainText("research 76%");
  });

  test("[AC-21] t=11000: the retry loop — attempt 2 back on backend", async ({ page }) => {
    await open(page, "?t=11000");
    await expect(page.getByTestId("retry-loop")).toBeVisible();
    const api = page.getByTestId("task-api-orders");
    await expect(api).toHaveAttribute("data-attempt", "2");
    await expect(api).toHaveAttribute("data-agent", "backend");
    await expect(page.locator('[data-testid="route-edge"][data-retry="true"]')).toHaveCount(1);
  });

  test("[AC-21] t=21000: checkout-ui in the holding pattern while api-orders is reviewed", async ({
    page,
  }) => {
    await open(page, "?t=21000");
    await expect(page.getByTestId("holding-pattern")).toHaveAttribute("data-count", "1");
    await expect(page.getByTestId("task-checkout-ui")).toHaveAttribute("data-zone", "holding");
    await expect(page.getByTestId("gate-review")).toHaveAttribute("data-task", "api-orders");
  });

  test("[AC-21] t=30000: 4 landed on the runway, no human paged, e2e-checkout running", async ({
    page,
  }) => {
    await open(page, "?t=30000");
    await expect(page.getByTestId("runway")).toHaveAttribute("data-count", "4");
    await expect(page.getByTestId("pad-human")).toHaveAttribute("data-count", "0");
    await expect(page.getByTestId("task-e2e-checkout")).toHaveAttribute("data-status", "running");
    await expect(page.getByTestId("tower-caption")).toContainText("4 landed");
    await expect(page.getByTestId("scenario-caption")).toContainText("4 landed");
  });
});

test.describe("control tower — playback", () => {
  test("[AC-22] ?autoplay=1 plays (progress increases) and the toggle pauses it", async ({
    page,
  }) => {
    await page.goto("/?autoplay=1");
    const toggle = page.getByTestId("scenario-toggle");
    const progress = page.getByTestId("scenario-progress");
    await expect(toggle).toHaveText("Pause");
    const start = Number((await progress.getAttribute("aria-valuenow")) ?? "0");
    await expect
      .poll(async () => Number((await progress.getAttribute("aria-valuenow")) ?? "0"), {
        timeout: 10_000,
      })
      .toBeGreaterThan(start);

    await toggle.click();
    await expect(toggle).toHaveText("Play");
    const paused = (await progress.getAttribute("aria-valuenow")) ?? "";
    // Let a few animation frames pass (no wall-clock sleep): a paused player must not advance.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          let n = 0;
          const step = () => (++n >= 5 ? resolve() : requestAnimationFrame(step));
          requestAnimationFrame(step);
        }),
    );
    await expect(progress).toHaveAttribute("aria-valuenow", paused);
    await expect(toggle).toHaveText("Play");
  });

  test("[AC-22] the same ?t= URL renders identical frames", async ({ context }) => {
    const first = await context.newPage();
    await open(first, "?t=12000");
    await expect(first.getByTestId("tower")).toHaveAttribute("data-tick", "24");
    const a = await towerSnapshot(first);

    const second = await context.newPage();
    await open(second, "?t=12000");
    const b = await towerSnapshot(second);

    expect(b).toEqual(a);
    expect(a.cards).toHaveLength(5);
    expect(a.gates).toHaveLength(5);
  });
});
