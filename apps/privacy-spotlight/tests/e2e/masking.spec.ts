import { expect, type Page, test } from "@playwright/test";
import {
  boxesOf,
  boxOf,
  contains,
  EXPECTED_TARGETS,
  EXPECTED_TARGETS_WITH_TICKET,
  masks,
  masksOf,
  open,
  openPresenting,
  overlaps,
  overlay,
  union,
} from "./helpers";

/** Sensitive value spans whose masks must fully cover them, with their mask kind. */
const COVERED: [string, string][] = [
  ...[0, 1, 2, 3, 4].map((i): [string, string] => [`customer-name-${i}`, "marked"]),
  ...[0, 1, 2, 3, 4].map((i): [string, string] => [`customer-email-${i}`, "email"]),
  ["customer-phone-0", "phone"],
  ["customer-id-0", "account"],
  ["billing-card-number", "card"],
  ["billing-email", "email"],
  ["billing-account-id", "account"],
  ["billing-address", "marked"],
  ["billing-note", "marked"],
  ["api-key-live", "token"],
  ["api-key-test", "token"],
  ["api-key-generic", "token"],
];

/** Non-sensitive elements that must stay readable. */
const READABLE = [
  "kpi-mrr",
  "kpi-customers",
  "kpi-churn",
  "today-date",
  "app-version",
  "customer-plan-0",
  "customer-mrr-0",
  "inbox-body-2",
];

async function startPresenting(page: Page) {
  await open(page, "/");
  await page.getByTestId("toggle-presenting").click();
  await expect(overlay(page)).toHaveAttribute("data-presenting", "true");
  await expect(overlay(page)).toHaveAttribute("data-count", String(EXPECTED_TARGETS));
}

async function kindsOf(page: Page, owner: string) {
  return masksOf(page, owner).evaluateAll((els) => els.map((e) => e.getAttribute("data-kind")));
}

test.describe("masking", () => {
  test("[AC-16] Presentation mode masks exactly 35 values", async ({ page }) => {
    await startPresenting(page);
    await expect(page.getByTestId("hidden-count")).toHaveAttribute("data-count", "35");
    await expect(page.getByTestId("hidden-count")).toHaveText("35 values hidden");
    await expect(page.getByTestId("toggle-presenting")).toHaveAttribute("aria-pressed", "true");
    const targets = await masks(page).evaluateAll(
      (els) => new Set(els.map((e) => e.getAttribute("data-target"))).size,
    );
    expect(targets).toBe(35);
    const labels = await masks(page).evaluateAll((els) =>
      els.map((e) => [e.getAttribute("data-kind"), e.getAttribute("data-label")]),
    );
    const LABEL: Record<string, string> = {
      email: "EMAIL",
      phone: "PHONE",
      token: "SECRET",
      account: "ID",
      card: "CARD",
      marked: "PRIVATE",
    };
    for (const [kind, label] of labels) expect(label).toBe(LABEL[kind ?? ""]);
  });

  test("[AC-16] masks cover every known sensitive value with the right kind", async ({ page }) => {
    await startPresenting(page);
    for (const [id, kind] of COVERED) {
      const el = await boxOf(page.getByTestId(id));
      const boxes = await boxesOf(masksOf(page, id));
      expect(boxes.length, `${id} has masks`).toBeGreaterThan(0);
      const u = union(boxes);
      expect(
        contains(u, el, 1),
        `${id} covered: mask ${JSON.stringify(u)} vs ${JSON.stringify(el)}`,
      ).toBe(true);
      const kinds = await kindsOf(page, id);
      expect(new Set(kinds), `${id} kinds`).toEqual(new Set([kind]));
    }
    const jwt = await kindsOf(page, "api-key-jwt");
    expect(jwt.length).toBeGreaterThan(0);
    expect(new Set(jwt)).toEqual(new Set(["token"]));
  });

  test("[AC-16] inbox prose: body 0 has phone + account, body 1 one token, body 2 none", async ({
    page,
  }) => {
    await startPresenting(page);
    expect((await kindsOf(page, "inbox-body-0")).sort()).toEqual(["account", "phone"]);
    expect(await kindsOf(page, "inbox-body-1")).toEqual(["token"]);
    expect(await kindsOf(page, "inbox-body-2")).toEqual([]);
    for (const i of [0, 1, 2]) {
      expect(await kindsOf(page, `inbox-from-${i}`)).toContain("email");
    }
  });

  test("[AC-16] KPIs, dates, versions, plans and prices stay readable", async ({ page }) => {
    await startPresenting(page);
    const all = await boxesOf(masks(page));
    expect(all).toHaveLength(await masks(page).count());
    for (const id of READABLE) {
      const el = await boxOf(page.getByTestId(id));
      const hit = all.filter((b) => overlaps(b, el));
      expect(hit, `${id} must not be masked`).toEqual([]);
    }
  });

  test("[AC-17] masks are committed before the first paint after the toggle", async ({ page }) => {
    await open(page, "/");
    const result = await page.evaluate(async () => {
      const btn = document.querySelector<HTMLElement>('[data-testid="toggle-presenting"]');
      btn?.click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return {
        count: document
          .querySelector('[data-testid="privacy-overlay"]')
          ?.getAttribute("data-count"),
        masks: document.querySelectorAll('[data-testid="privacy-mask"]').length,
      };
    });
    expect(result.count).toBe(String(EXPECTED_TARGETS));
    expect(result.masks).toBeGreaterThan(0);
  });

  test("[AC-17] a new ticket is masked before its first paint", async ({ page }) => {
    await openPresenting(page, "/?present=1");
    const result = await page.evaluate(async () => {
      const btn = document.querySelector<HTMLElement>('[data-testid="inbox-add"]');
      btn?.click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return {
        count: document
          .querySelector('[data-testid="privacy-overlay"]')
          ?.getAttribute("data-count"),
        ticketMasks: document.querySelectorAll(
          '[data-testid="privacy-mask"][data-owner="inbox-body-3"]',
        ).length,
        body: document.querySelector('[data-testid="inbox-body-3"]')?.textContent ?? null,
      };
    });
    expect(result.body).toContain("leo.martin@example.com");
    expect(result.count).toBe(String(EXPECTED_TARGETS_WITH_TICKET));
    expect(result.ticketMasks).toBe(2);
    await expect(page.getByTestId("hidden-count")).toHaveText("38 values hidden");
    await expect(page.getByTestId("inbox-add")).toBeDisabled();
    expect((await kindsOf(page, "inbox-body-3")).sort()).toEqual(["email", "phone"]);
  });

  test("[AC-20] solid is the default: opaque background, no backdrop filter", async ({ page }) => {
    await openPresenting(page);
    await expect(overlay(page)).toHaveAttribute("data-mode", "solid");
    const first = masks(page).first();
    await expect
      .poll(() =>
        first.evaluate((el) => {
          const bg = getComputedStyle(el).backgroundColor;
          const m = bg.match(/rgba?\(([^)]+)\)/);
          if (!m) return 0;
          const parts = (m[1] ?? "").split(/[\s,/]+/).filter(Boolean);
          return parts.length >= 4 ? Number(parts[3]) : 1;
        }),
      )
      .toBe(1);
    const backdrop = await first.evaluate((el) => {
      const s = getComputedStyle(el) as CSSStyleDeclaration & { webkitBackdropFilter?: string };
      return s.backdropFilter || s.webkitBackdropFilter || "none";
    });
    expect(backdrop).toBe("none");
  });

  test("[AC-20] blur mode uses a backdrop blur of at least 12px", async ({ page }) => {
    await openPresenting(page);
    await page.getByTestId("mode-blur").click();
    await expect(overlay(page)).toHaveAttribute("data-mode", "blur");
    await expect(page.getByTestId("mode-blur")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("mode-solid")).toHaveAttribute("aria-pressed", "false");
    const first = masks(page).first();
    await expect
      .poll(() =>
        first.evaluate((el) => {
          const s = getComputedStyle(el) as CSSStyleDeclaration & { webkitBackdropFilter?: string };
          const f = s.backdropFilter || s.webkitBackdropFilter || "";
          const m = f.match(/blur\(\s*([\d.]+)px\s*\)/);
          return m ? Number(m[1]) : 0;
        }),
      )
      .toBeGreaterThanOrEqual(12);
  });

  test("[AC-20] partial mode leaves the last 4 card digits visible", async ({ page }) => {
    await openPresenting(page);
    await page.getByTestId("mode-partial").click();
    await expect(overlay(page)).toHaveAttribute("data-mode", "partial");
    await expect(page.getByTestId("mode-partial")).toHaveAttribute("aria-pressed", "true");
    const card = await boxOf(page.getByTestId("billing-card-number"));
    await expect(async () => {
      const u = union(await boxesOf(masksOf(page, "billing-card-number")));
      expect(Math.abs(u.x - card.x)).toBeLessThanOrEqual(3);
      expect(u.x + u.width).toBeLessThanOrEqual(card.x + card.width - 12);
    }).toPass();
    const address = await boxOf(page.getByTestId("billing-address"));
    const addrMasks = await boxesOf(masksOf(page, "billing-address"));
    expect(contains(union(addrMasks), address, 1)).toBe(true);
    await expect(overlay(page)).toHaveAttribute("data-count", String(EXPECTED_TARGETS));
  });
});
