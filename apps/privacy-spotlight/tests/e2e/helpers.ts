import { expect, type Locator, type Page } from "@playwright/test";

export type Box = { x: number; y: number; width: number; height: number };

export const EXPECTED_TARGETS = 35;
export const EXPECTED_TARGETS_WITH_TICKET = 38;

export const overlay = (page: Page) => page.getByTestId("privacy-overlay");
export const masks = (page: Page) => page.getByTestId("privacy-mask");
export const masksOf = (page: Page, owner: string) =>
  page.locator(`[data-testid="privacy-mask"][data-owner="${owner}"]`);

/**
 * Wait until React has hydrated the toolbar (event handlers attached), so the next interaction
 * is not lost. React stores props on DOM nodes under `__reactProps$…` once hydrated.
 */
export async function waitForHydration(page: Page) {
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="toggle-presenting"]');
    return !!el && Object.keys(el).some((k) => k.startsWith("__reactProps$"));
  });
}

/** Open a URL and wait until the page is hydrated. */
export async function open(page: Page, url: string) {
  await page.goto(url);
  await expect(overlay(page)).toBeAttached();
  await waitForHydration(page);
}

/** Open a presenting URL and wait for the 35 masks (implies hydration + first scan). */
export async function openPresenting(page: Page, url = "/?present=1") {
  await page.goto(url);
  await expect(overlay(page)).toHaveAttribute("data-presenting", "true");
  await expect(overlay(page)).toHaveAttribute("data-count", String(EXPECTED_TARGETS));
  await waitForHydration(page);
}

export async function boxOf(locator: Locator): Promise<Box> {
  const b = await locator.boundingBox();
  if (!b) throw new Error("element has no bounding box");
  return b;
}

export async function boxesOf(locator: Locator): Promise<Box[]> {
  const n = await locator.count();
  const out: Box[] = [];
  for (let i = 0; i < n; i++) out.push(await boxOf(locator.nth(i)));
  return out;
}

export function union(boxes: readonly Box[]): Box {
  if (boxes.length === 0) throw new Error("union of no boxes");
  const x1 = Math.min(...boxes.map((b) => b.x));
  const y1 = Math.min(...boxes.map((b) => b.y));
  const x2 = Math.max(...boxes.map((b) => b.x + b.width));
  const y2 = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export function contains(outer: Box, inner: Box, tol = 1): boolean {
  return (
    outer.x <= inner.x + tol &&
    outer.y <= inner.y + tol &&
    outer.x + outer.width >= inner.x + inner.width - tol &&
    outer.y + outer.height >= inner.y + inner.height - tol
  );
}

/** True when the two boxes share an area wider and taller than `tol` px. */
export function overlaps(a: Box, b: Box, tol = 0.5): boolean {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > tol && h > tol;
}

export const centre = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

/** Scroll an element into view and move the real mouse to its centre. Returns the point. */
export async function hover(page: Page, testId: string) {
  const el = page.getByTestId(testId);
  await el.scrollIntoViewIfNeeded();
  const c = centre(await boxOf(el));
  await page.mouse.move(c.x, c.y);
  return c;
}

/** Let fonts load and two frames pass, so rAF-throttled rescans have settled. */
export async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}
