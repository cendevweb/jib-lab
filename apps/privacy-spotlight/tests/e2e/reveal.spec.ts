import { expect, type Page, test } from "@playwright/test";
import { boxOf, centre, hover, masks, masksOf, openPresenting, overlay } from "./helpers";

const revealed = (page: Page) => page.locator('[data-testid="privacy-mask"][data-revealed="true"]');
const concealed = (page: Page) =>
  page.locator('[data-testid="privacy-mask"][data-revealed="false"]');

/** Number of masks whose computed visibility is not hidden. */
const visibleMaskCount = (page: Page) =>
  masks(page).evaluateAll(
    (els) => els.filter((e) => getComputedStyle(e).visibility !== "hidden").length,
  );

test.describe("spotlight", () => {
  test("[AC-18] the spotlight follows the mouse and reveals only the value under it", async ({
    page,
  }) => {
    await openPresenting(page);
    const mouse = await hover(page, "api-key-live");
    const spot = page.getByTestId("privacy-spotlight");
    await expect(spot).toBeVisible();
    await expect(spot).toHaveAttribute("data-radius", "110");
    await expect(overlay(page)).toHaveAttribute("data-reveal", "spotlight");
    await expect(async () => {
      const c = centre(await boxOf(spot));
      expect(Math.abs(c.x - mouse.x)).toBeLessThanOrEqual(2);
      expect(Math.abs(c.y - mouse.y)).toBeLessThanOrEqual(2);
    }).toPass();

    const key = masksOf(page, "api-key-live");
    await expect(key.first()).toHaveAttribute("data-revealed", "true");
    const keyStates = await key.evaluateAll((els) =>
      els.map((e) => {
        const s = getComputedStyle(e) as CSSStyleDeclaration & { webkitMaskImage?: string };
        return {
          revealed: e.getAttribute("data-revealed"),
          image: `${s.maskImage ?? ""} ${s.webkitMaskImage ?? ""}`,
        };
      }),
    );
    expect(keyStates.length).toBeGreaterThan(0);
    for (const k of keyStates) {
      expect(k.revealed).toBe("true");
      expect(k.image).toContain("radial-gradient");
    }
    const far = masksOf(page, "customer-email-0");
    expect(await far.count()).toBeGreaterThan(0);
    expect(await far.evaluateAll((els) => els.map((e) => e.getAttribute("data-revealed")))).toEqual(
      Array(await far.count()).fill("false"),
    );
    expect(await concealed(page).count()).toBeGreaterThan(await revealed(page).count());
  });

  test("[AC-18] leaving the wrapper (onto the toolbar) removes the spotlight", async ({ page }) => {
    await openPresenting(page);
    await hover(page, "api-key-live");
    await expect(overlay(page)).toHaveAttribute("data-reveal", "spotlight");
    const toolbar = await boxOf(page.getByTestId("toolbar"));
    await page.mouse.move(toolbar.x + 4, toolbar.y + toolbar.height / 2);
    await expect(overlay(page)).toHaveAttribute("data-reveal", "none");
    await expect(page.getByTestId("privacy-spotlight")).toHaveCount(0);
    await expect(revealed(page)).toHaveCount(0);
  });

  test("[AC-18] with Spotlight off, hovering reveals nothing", async ({ page }) => {
    await openPresenting(page);
    await page.getByTestId("toggle-spotlight").click();
    await expect(page.getByTestId("toggle-spotlight")).toHaveAttribute("aria-pressed", "false");
    await hover(page, "api-key-live");
    await expect(overlay(page)).toHaveAttribute("data-reveal", "none");
    await expect(page.getByTestId("privacy-spotlight")).toHaveCount(0);
    await expect(revealed(page)).toHaveCount(0);
    await expect(masksOf(page, "api-key-live").first()).toHaveAttribute("data-revealed", "false");
  });
});

test.describe("hold to reveal", () => {
  test("[AC-19] holding Alt reveals every mask; releasing masks again", async ({ page }) => {
    await openPresenting(page);
    const total = await masks(page).count();
    await page.keyboard.down("Alt");
    await expect(overlay(page)).toHaveAttribute("data-reveal", "all");
    await expect(page.getByTestId("reveal-hint")).toHaveAttribute("data-active", "true");
    await expect(concealed(page)).toHaveCount(0);
    await expect(revealed(page)).toHaveCount(total);
    await expect.poll(() => visibleMaskCount(page)).toBe(0);
    await expect(masks(page).first()).toBeHidden();

    await page.keyboard.up("Alt");
    await expect(overlay(page)).toHaveAttribute("data-reveal", "none");
    await expect(page.getByTestId("reveal-hint")).toHaveAttribute("data-active", "false");
    await expect(revealed(page)).toHaveCount(0);
    await expect.poll(() => visibleMaskCount(page)).toBe(total);
    await expect(masks(page).first()).toBeVisible();
  });

  test("[AC-19] window blur while holding Alt fails closed", async ({ page }) => {
    await openPresenting(page);
    await page.keyboard.down("Alt");
    await expect(overlay(page)).toHaveAttribute("data-reveal", "all");
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await expect(overlay(page)).toHaveAttribute("data-reveal", "none");
    await expect(revealed(page)).toHaveCount(0);
    await page.keyboard.up("Alt");
    await expect(overlay(page)).toHaveAttribute("data-reveal", "none");
  });

  test("[AC-19] toggling presentation while Alt is held resets the reveal", async ({ page }) => {
    await openPresenting(page);
    await page.keyboard.down("Alt");
    await expect(overlay(page)).toHaveAttribute("data-reveal", "all");
    await page.getByTestId("toggle-presenting").click();
    await expect(overlay(page)).toHaveAttribute("data-presenting", "false");
    await page.getByTestId("toggle-presenting").click();
    await expect(overlay(page)).toHaveAttribute("data-presenting", "true");
    await expect(overlay(page)).toHaveAttribute("data-count", "35");
    await expect(overlay(page)).toHaveAttribute("data-reveal", "none");
    await expect(revealed(page)).toHaveCount(0);
    await expect(page.getByTestId("reveal-hint")).toHaveAttribute("data-active", "false");
    await page.keyboard.up("Alt");
  });
});
