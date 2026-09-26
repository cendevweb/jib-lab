import { expect, type Page, test } from "@playwright/test";
import { masksOf, overlay, settle } from "./helpers";

async function openTour(page: Page, t: number) {
  await page.goto(`/?tour=1&t=${t}`);
  await expect(page.getByTestId("ghost-cursor")).toBeVisible();
}

/** Every observable overlay attribute (used to prove frame reproducibility). */
async function overlaySnapshot(page: Page) {
  const o = overlay(page);
  const attrs = await o.evaluate((el) =>
    ["data-presenting", "data-mode", "data-reveal", "data-count"].map((a) => el.getAttribute(a)),
  );
  const maskAttrs = await page.getByTestId("privacy-mask").evaluateAll((els) =>
    els.map((e) => {
      const s = (e as HTMLElement).style;
      return [
        e.getAttribute("data-target"),
        e.getAttribute("data-kind"),
        e.getAttribute("data-owner"),
        e.getAttribute("data-revealed"),
        s.left,
        s.top,
        s.width,
        s.height,
      ];
    }),
  );
  const spot = await page
    .getByTestId("privacy-spotlight")
    .evaluateAll((els) =>
      els.map((e) => ["data-x", "data-y", "data-radius"].map((a) => e.getAttribute(a))),
    );
  const cursor = await page.getByTestId("ghost-cursor").getAttribute("data-target");
  return { attrs, maskAttrs, spot, cursor };
}

test.describe("scripted tour", () => {
  test("[AC-22] t=0: ghost cursor on the MRR KPI, not presenting, intro caption", async ({
    page,
  }) => {
    await openTour(page, 0);
    await expect(page.getByTestId("ghost-cursor")).toHaveAttribute("data-target", "kpi-mrr");
    await expect(overlay(page)).toHaveAttribute("data-presenting", "false");
    await expect(page.getByTestId("privacy-mask")).toHaveCount(0);
    await expect(page.getByTestId("scenario-caption")).toContainText("full of customer data");
    await expect(page.getByTestId("scenario-toggle")).toHaveText("Play");
  });

  test("[AC-22] t=4500: spotlight on Tomás's email, the API key stays masked", async ({ page }) => {
    await openTour(page, 4500);
    await expect(page.getByTestId("ghost-cursor")).toHaveAttribute(
      "data-target",
      "customer-email-1",
    );
    await expect(overlay(page)).toHaveAttribute("data-presenting", "true");
    await expect(overlay(page)).toHaveAttribute("data-reveal", "spotlight");
    await expect(overlay(page)).toHaveAttribute("data-count", "35");
    const email = masksOf(page, "customer-email-1");
    await expect(email.first()).toHaveAttribute("data-revealed", "true");
    await expect(
      page.locator(
        '[data-testid="privacy-mask"][data-owner="customer-email-1"][data-revealed="false"]',
      ),
    ).toHaveCount(0);
    const key = masksOf(page, "api-key-live");
    expect(await key.count()).toBeGreaterThan(0);
    await expect(
      page.locator('[data-testid="privacy-mask"][data-owner="api-key-live"][data-revealed="true"]'),
    ).toHaveCount(0);
    await expect(page.getByTestId("scenario-caption")).toContainText("Spotlight");
  });

  test("[AC-22] t=6000: spotlight on the production key, the email masked again", async ({
    page,
  }) => {
    await openTour(page, 6000);
    await expect(page.getByTestId("ghost-cursor")).toHaveAttribute("data-target", "api-key-live");
    await expect(overlay(page)).toHaveAttribute("data-count", "35");
    await expect(masksOf(page, "api-key-live").first()).toHaveAttribute("data-revealed", "true");
    await expect(
      page.locator(
        '[data-testid="privacy-mask"][data-owner="api-key-live"][data-revealed="false"]',
      ),
    ).toHaveCount(0);
    expect(await masksOf(page, "customer-email-1").count()).toBeGreaterThan(0);
    await expect(
      page.locator(
        '[data-testid="privacy-mask"][data-owner="customer-email-1"][data-revealed="true"]',
      ),
    ).toHaveCount(0);
  });

  test("[AC-22] t=10500: partial mode, the new ticket is already masked (38)", async ({ page }) => {
    await openTour(page, 10500);
    await expect(overlay(page)).toHaveAttribute("data-mode", "partial");
    await expect(overlay(page)).toHaveAttribute("data-count", "38");
    await expect(page.getByTestId("inbox-message-3")).toBeVisible();
    await expect(masksOf(page, "inbox-body-3")).toHaveCount(2);
    await expect(page.getByTestId("hidden-count")).toHaveText("38 values hidden");
  });

  test("[AC-22] t=12000: holding Alt reveals everything", async ({ page }) => {
    await openTour(page, 12000);
    await expect(overlay(page)).toHaveAttribute("data-presenting", "true");
    await expect(overlay(page)).toHaveAttribute("data-reveal", "all");
    await expect(page.getByTestId("reveal-hint")).toHaveAttribute("data-active", "true");
  });

  test("[AC-22] t=14500: presentation mode is off again", async ({ page }) => {
    await openTour(page, 14500);
    await expect(overlay(page)).toHaveAttribute("data-presenting", "false");
    await expect(page.getByTestId("privacy-mask")).toHaveCount(0);
    await expect(page.getByTestId("hidden-count")).toHaveText("Not presenting");
  });

  test("[AC-22] autoplay plays the tour", async ({ page }) => {
    await page.goto("/?tour=1&autoplay=1");
    const toggle = page.getByTestId("scenario-toggle");
    await expect(toggle).toHaveText("Pause");
    const progress = page.getByTestId("scenario-progress");
    await expect(progress).toHaveAttribute("aria-valuemax", "15000");
    const start = Number(await progress.getAttribute("aria-valuenow"));
    await expect
      .poll(async () => Number(await progress.getAttribute("aria-valuenow")))
      .toBeGreaterThan(start);
  });

  test("[AC-22] seeking the same frame twice gives identical overlay attributes", async ({
    page,
  }) => {
    const snap = async () => {
      await openTour(page, 4500);
      await expect(masksOf(page, "customer-email-1").first()).toHaveAttribute(
        "data-revealed",
        "true",
      );
      await settle(page);
      return overlaySnapshot(page);
    };
    const a = await snap();
    const b = await snap();
    expect(a.attrs).toEqual(["true", "solid", "spotlight", "35"]);
    expect(a.maskAttrs.length).toBeGreaterThanOrEqual(35);
    expect(a.spot).toHaveLength(1);
    expect(b).toEqual(a);
  });
});
