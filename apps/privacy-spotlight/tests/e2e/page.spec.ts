import { expect, test } from "@playwright/test";
import {
  boxesOf,
  boxOf,
  hover,
  masks,
  masksOf,
  open,
  openPresenting,
  overlaps,
  overlay,
} from "./helpers";

test.describe("page", () => {
  test("[AC-15] / renders the shell, readable dashboard and default toolbar", async ({ page }) => {
    await open(page, "/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacy Spotlight");
    await expect(page.getByTestId("provider-badge")).toContainText("offline");
    await expect(page.getByTestId("threat-note")).toContainText("DOM");
    await expect(overlay(page)).toHaveAttribute("data-presenting", "false");
    await expect(masks(page)).toHaveCount(0);
    const email = page.getByTestId("customer-email-0");
    await expect(email).toBeVisible();
    await expect(email).toHaveText("maya.chen@example.com");
    await expect(page.getByTestId("toggle-presenting")).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("mode-solid")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("mode-blur")).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("mode-partial")).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("toggle-spotlight")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("radius-input")).toHaveValue("110");
    await expect(page.getByTestId("hidden-count")).toHaveText("Not presenting");
    await expect(page.getByTestId("ghost-cursor")).toHaveCount(0);
    await expect(page.getByTestId("scenario-toggle")).toHaveCount(0);
  });

  test("[AC-15] the toolbar is outside the wrapper and the dashboard inside it", async ({
    page,
  }) => {
    await open(page, "/");
    const root = page.getByTestId("privacy-root");
    await expect(root.getByTestId("toolbar")).toHaveCount(0);
    await expect(root.getByTestId("billing-card")).toHaveCount(1);
    await expect(root.getByTestId("inbox-card")).toHaveCount(1);
    await expect(page.getByTestId("toolbar")).toBeVisible();
  });

  test("[AC-21] query params set the initial state (partial, spotlight off, radius 160)", async ({
    page,
  }) => {
    await openPresenting(page, "/?present=1&mode=partial&spotlight=0&radius=160");
    await expect(overlay(page)).toHaveAttribute("data-mode", "partial");
    await expect(page.getByTestId("mode-partial")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("toggle-presenting")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("toggle-spotlight")).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("radius-input")).toHaveValue("160");
    await expect(page.getByTestId("hidden-count")).toHaveText("35 values hidden");
    await hover(page, "api-key-live");
    await expect(overlay(page)).toHaveAttribute("data-reveal", "none");
    await expect(page.getByTestId("privacy-spotlight")).toHaveCount(0);
    await expect(page.locator('[data-testid="privacy-mask"][data-revealed="true"]')).toHaveCount(0);
  });

  test("[AC-21] radius param is clamped to 320", async ({ page }) => {
    await openPresenting(page, "/?present=1&radius=999");
    await expect(page.getByTestId("radius-input")).toHaveValue("320");
    await hover(page, "api-key-live");
    await expect(page.getByTestId("privacy-spotlight")).toHaveAttribute("data-radius", "320");
  });

  test("[AC-21] masks follow page scroll without a rescan", async ({ page }) => {
    await openPresenting(page);
    await page.evaluate(() => window.scrollTo(0, 300));
    // The dashboard is taller than the 900 px viewport; the exact max scroll depends on layout.
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    const el = await boxOf(page.getByTestId("inbox-body-0"));
    const boxes = await boxesOf(masksOf(page, "inbox-body-0"));
    expect(boxes.length).toBeGreaterThan(0);
    for (const b of boxes) expect(overlaps(b, el)).toBe(true);
  });

  test("[AC-21] turning presentation mode off removes every mask", async ({ page }) => {
    await openPresenting(page);
    await page.getByTestId("toggle-presenting").click();
    await expect(overlay(page)).toHaveAttribute("data-presenting", "false");
    await expect(masks(page)).toHaveCount(0);
    await expect(overlay(page)).toHaveAttribute("data-count", "0");
    await expect(page.getByTestId("hidden-count")).toHaveText("Not presenting");
    await expect(page.getByTestId("toggle-presenting")).toHaveAttribute("aria-pressed", "false");
  });
});
