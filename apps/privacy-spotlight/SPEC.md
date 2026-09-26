# Privacy Spotlight — Specification

> Phase: spec · Source: https://app.notion.com/p/3e529c7096258143bfd1f27ced813a46 · Slug: `privacy-spotlight` · Port: 3108

## 1. Concept (refined)
`<PrivacySpotlight>` is a React wrapper for screen sharing and recording. In **Presentation mode**
it finds sensitive values inside its subtree (explicit `data-sensitive` markers plus 5 low-false-positive
detectors: email, phone, API token, account/customer ID, payment card), then paints one overlay
of masks exactly over their pixels. A cursor **spotlight** punches a round hole in the masks,
so only the value you point at is readable. Holding **Alt/⌥** reveals everything while held.
The masks follow live data: a new support ticket shows up already masked.

**Threat model (normative, repeated in README and the page footer).** This is *visual* protection
for pixels that leave the machine (screen share, recording, screenshots). It is **not** data
protection: the values stay in the DOM, in the accessibility tree, in copy/paste, in devtools, in
network responses and for browser extensions. The spotlight and hold-to-reveal show real pixels
to the audience: they are deliberate disclosure, not a private peek. Known gaps in v1: text split
across several text nodes, values in `<input>`/`<textarea>`, canvas/images (unless marked),
portals outside the wrapper, inner scroll containers (masks are not clipped), and a possible
one-frame lag after layout changes (resize/scroll/fonts). New or changed DOM content is masked
**before the next paint** (fail-closed, §4.6).

## 2. Demo promise
- **Hook:** I made a React component for screen sharing without leaking your data.
- **5-second demo:** a dense SaaS admin dashboard (customers table, billing card, API keys, support
  inbox) full of fake PII. At 2 s "Presentation mode" is clicked: 35 values vanish under labelled
  masks (`EMAIL`, `PHONE`, `SECRET`, `ID`, `CARD`, `PRIVATE`) in the same frame, while KPIs,
  plans and prices stay readable. At 3–5 s the cursor glides onto one customer row and only a
  round spotlight around it becomes readable.

## 3. Notion corrections
| Notion said | Spec says | Why |
|---|---|---|
| "without leaking your data" / "Sensitive values become hidden" | Pixel-level protection for screen share/recording only. Values remain in DOM, a11y tree, clipboard, devtools. Spotlight and hold-to-reveal show real pixels to viewers. Stated in SPEC §1, README and page footer (`threat-note`). | Overlay masking cannot protect data. It only protects what is painted. Claiming more would mislead users. |
| "Automatically mask sensitive UI while screen-sharing" | A web page cannot know it is being shared (only the page calling `getDisplayMedia` knows). Masking starts with an explicit **Presentation mode** toggle or prop. "Automatic" means *which* values get masked, not *when*. | Browser API reality. Also fail-closed: the library default is `presenting: true` when you wrap something. |
| Modes: Blur · Solid · Partial reveal · Spotlight reveal · Hold key | Two orthogonal axes. **Mask style** `solid` (default, opaque) · `blur` (labelled cosmetic) · `partial` (masks all but the last 4 chars, e.g. `•••• 4242`). **Reveal** = spotlight (toggle) + hold Alt (always available). | Spotlight and hold-to-reveal combine with every style. Blur can be reversed for short strings (digits, codes), so solid is the safe default. |
| Detectors: email, phone, token-looking strings, account/customer IDs; DoD "2–3 detectors" | 5 detectors with normative positive/negative tables (§4.2): email, phone, token (vendor prefixes + JWT + mixed-case high-entropy), account ID (`cus_`/`acct_`/… with ≥2 digits, `ACCT-123456`), **card** (IIN 2–6 + Luhn). Names and addresses are **not** auto-detected: use `data-sensitive`. | Cards are the canonical partial-reveal case. Luhn and digit-count checks keep dates, versions, prices and UUIDs readable. A name detector would be all false positives. |
| "Render one overlay mask and a radial reveal around the cursor" | One overlay layer with one absolutely positioned mask per text rect. The radial `mask-image` hole goes on **each mask rect** (centre translated to rect-local coordinates), not on the overlay parent. | A `mask-image` on the parent makes it a *backdrop root*: child `backdrop-filter: blur()` would blur nothing, and blur mode would show plaintext. |
| "Demo under 15 s" | Kept: 15 s scripted tour (`?tour=1&autoplay=1`, ghost cursor) that is reproducible frame by frame (`?tour=1&t=…`). Manual recording on `/` also works. | Hands-free recording and deterministic e2e. |
| Implicit: realistic PII | Obviously fake data only: RFC 2606 domains (`example.com`, `.example`), 555-01xx / Ofcom drama numbers, Stripe test card 4242…, a fictional `ac_live_` key prefix. Vendor-prefixed tokens (`sk_live_`, `ghp_`, `AKIA`…) appear only in unit tests, built by string concatenation. | Realistic vendor secrets trip GitHub push protection and secret scanners. |

## 4. Domain model & public contract
All paths relative to `apps/privacy-spotlight/`, `@/…` = `src/…`. Tests import exactly these
modules and names. `src/core/**` is pure TypeScript with no DOM and no React, so it can later
become a shared package. `src/spotlight/**` is the reusable React component (the "library").
It is kept separate from the demo UI (`src/demo/**`, `src/components/**`) so it can be extracted
as a unit. This deviates from "UI in src/components" on purpose.

### 4.1 `src/core/types.ts` + `src/core/constants.ts` (WP-01; harness copies both **verbatim**)
```ts
// src/core/types.ts
export type DetectorKind = "email" | "phone" | "token" | "account" | "card";
/** "marked" = element carrying [data-sensitive]. */
export type SensitiveKind = DetectorKind | "marked";
export type MaskStyle = "solid" | "blur" | "partial";
/** Half-open UTF-16 range [start, end) in a text node's data. */
export type TextMatch = { kind: DetectorKind; start: number; end: number };

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };
export type Spotlight = { x: number; y: number; radius: number };

/** One sensitive value found in the container. Rects are container-local, merged, padded. */
export type MaskTarget = {
  /** "t0", "t1", … in document order, assigned after empty targets are dropped. */
  id: string;
  kind: SensitiveKind;
  /** data-testid of the closest element at/above the value, below the scanned root; else null. */
  owner: string | null;
  rects: Rect[];
  /** Rects of partialRange(match) for detector matches; equal to `rects` for "marked". */
  partialRects: Rect[];
};

export type PrivacyState = {
  presenting: boolean;
  maskStyle: MaskStyle;
  /** Spotlight reveal enabled. */
  spotlight: boolean;
  /** Spotlight radius, px, integer in [RADIUS_MIN, RADIUS_MAX]. */
  radius: number;
  /** Reveal key currently held. */
  holding: boolean;
  /** Pointer in container-local px; null when outside the container. */
  pointer: Point | null;
  /** KeyboardEvent.key that reveals all while held. */
  revealKey: string;
};
export type PrivacyPatch = Partial<
  Pick<PrivacyState, "presenting" | "maskStyle" | "spotlight" | "radius" | "holding">
>;
export type PrivacyAction =
  | { type: "setPresenting"; value: boolean }
  | { type: "togglePresenting" }
  | { type: "setMaskStyle"; value: MaskStyle }
  | { type: "setSpotlight"; value: boolean }
  | { type: "setRadius"; value: number }
  | { type: "pointerMove"; point: Point }
  | { type: "pointerLeave" }
  | { type: "keyDown"; key: string }
  | { type: "keyUp"; key: string }
  /** Window blur / tab hidden: fail closed. */
  | { type: "release" }
  /** Scripted tour: apply a validated patch. */
  | { type: "sync"; patch: PrivacyPatch };

export type RevealMode = "none" | "spotlight" | "all";
export type MaskView = {
  /** `${targetId}:${rectIndex}` */
  key: string;
  targetId: string;
  kind: SensitiveKind;
  owner: string | null;
  rect: Rect;
  revealed: boolean;
  /** CSS mask-image for the spotlight hole, or null. */
  maskImage: string | null;
};
export type OverlayView = {
  presenting: boolean;
  mode: MaskStyle;
  reveal: RevealMode;
  spotlight: Spotlight | null;
  /** Number of targets masked (0 when not presenting). */
  count: number;
  masks: MaskView[];
};

export type DemoParams = {
  presenting: boolean;
  maskStyle: MaskStyle;
  spotlight: boolean;
  radius: number;
  tour: boolean;
  autoplay: boolean;
  t: number;
};
```
```ts
// src/core/constants.ts
import type { DetectorKind, MaskStyle, PrivacyState, SensitiveKind } from "./types";

export const DETECTOR_KINDS: readonly DetectorKind[] = ["email", "phone", "token", "account", "card"];
/** Tie-break when merged matches have equal length (earlier wins). */
export const KIND_PRIORITY: readonly DetectorKind[] = ["token", "card", "email", "account", "phone"];
export const MASK_STYLES: readonly MaskStyle[] = ["solid", "blur", "partial"];
export const KIND_LABELS: Record<SensitiveKind, string> = {
  email: "EMAIL", phone: "PHONE", token: "SECRET", account: "ID", card: "CARD", marked: "PRIVATE",
};
export const RADIUS_MIN = 40;
export const RADIUS_MAX = 320;
export const DEFAULT_RADIUS = 110;
export const MASK_PADDING = 2;
export const MERGE_TOLERANCE = 1;
export const PARTIAL_KEEP = 4;
export const SPOTLIGHT_FEATHER = 12;
export const REVEAL_KEY = "Alt";
export const DEMO_DURATION_MS = 15_000;
/** Library default: wrapping something protects it (fail-closed). The demo starts with presenting false. */
export const DEFAULT_PRIVACY_STATE: PrivacyState = {
  presenting: true, maskStyle: "solid", spotlight: true, radius: DEFAULT_RADIUS,
  holding: false, pointer: null, revealKey: REVEAL_KEY,
};
```

### 4.2 `src/core/detectors.ts` (WP-01), pure
```ts
export function detectEmails(text: string): TextMatch[];
export function detectPhones(text: string): TextMatch[];
export function detectTokens(text: string): TextMatch[];
export function detectAccountIds(text: string): TextMatch[];
export function detectCards(text: string): TextMatch[];
export const DETECTORS: Record<DetectorKind, (text: string) => TextMatch[]>;
export function luhnValid(digits: string): boolean;
export function mergeMatches(matches: readonly TextMatch[]): TextMatch[];
export function detect(text: string, kinds?: readonly DetectorKind[]): TextMatch[];
export function partialRange(
  match: { start: number; end: number }, keep?: number,
): { start: number; end: number };
```
- Every `detectX` returns **non-overlapping** matches of its kind, sorted by start (applies
  `mergeMatches` internally). Must not use the `g`-flag regex state across calls (no shared
  `lastIndex` bugs).
- **mergeMatches**: sort by start asc, then length desc. Sweep and group matches whose ranges
  overlap (`next.start < groupEnd`; merely adjacent ranges do **not** merge). Each group becomes one
  match `{ start: min, end: max, kind }`, where kind = kind of the longest original match in the
  group (tie → earlier in `KIND_PRIORITY`). Exact duplicates collapse. Output sorted by start.
- **detect**: run `DETECTORS[k]` for each `k` in `kinds` (default `DETECTOR_KINDS`), then `mergeMatches`.
- **luhnValid**: `false` for empty or non-digit input; standard Luhn otherwise.
- **partialRange**: `len = end − start`; `len < 2 * keep` → `{ start, end }` (short values are
  masked fully); else `{ start, end: end − keep }`. `keep` defaults to `PARTIAL_KEEP` (4).

Reference rules (implementer may refine regexes, but the tables below are **normative**):

| kind | rule |
|---|---|
| email | `local@domain.tld`: local `[A-Za-z0-9._%+-]+`, labels `[A-Za-z0-9-]` not starting/ending with `-`, TLD 2–24 letters; not preceded by a local-part char, not followed by `[A-Za-z0-9-]` (a sentence-final `.` is excluded). |
| phone | (a) `+` + 1–3 digit country code + groups of 1–4 digits separated by optional ` `/`.`/`-` and optional `( )`, total **8–15 digits**, not preceded by a word char or `+`. (b) NANP without `+`: `(ddd) ddd-dddd`, `ddd-ddd-dddd`, `ddd.ddd.dddd`, `ddd ddd dddd`. Neither may touch a word char or `-`. |
| token | (a) `[a-z]{2,8}_(live\|test)_[A-Za-z0-9]{16,}` (Stripe-style, incl. the demo's `ac_live_`). (b) vendor prefixes: `gh[pousr]_` + ≥30, `github_pat_` + ≥40, `xox[abprs]-` + ≥10, `AKIA` + 16 `[0-9A-Z]`, `AIza` + 35, `sk-`/`sk-proj-` + ≥20. (c) JWT `eyJ….eyJ….…` (3 base64url segments, ≥5 chars each). (d) generic: a standalone run of ≥32 `[A-Za-z0-9_-]` with ≥1 uppercase, ≥1 lowercase and ≥4 digits. |
| account | (a) `(cus\|acct\|sub\|pm\|card)_` + ≥8 `[A-Za-z0-9]` whose body has ≥2 digits and ≥1 letter, not glued to `[A-Za-z0-9_]` on either side. (b) `(ACCT\|ACC\|CUST\|CID)-?` + ≥5 digits. |
| card | first digit 2–6, 13–19 digits total with optional single ` `/`-` separators, not touching another digit or `-`, and `luhnValid(digits)`. |

**Must match** (each string alone → exactly one match of that kind spanning the whole string):
- email: `maya.chen@example.com`, `tomas.ortega@example.org`, `aiko@tanaka-design.example`, `billing@acme-corp.example`
- phone: `+1 (415) 555-0132`, `+44 20 7946 0958`, `(212) 555-0187`, `+1 646 555 0199`, `+1-312-555-0110`, `212.555.0187`
- token: `ac_live_7Hq2Kx9LmP4vT8sW3nB6yR1c`, `ac_test_4fG8hJ2kL6mN0pQ3rS5tU7vW`, `eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJkZW1vLXVzZXIifQ.x7Rk2Lq9Vt4Wm8Ny3Pb6Hs1Z`, `Qm9X4tR7pL2vK8sN3wY6hB1dF5gJ0cZe`, plus concatenated vendor fixtures (`"gh" + "p_" + 36 alnum`, `"AK" + "IA" + 16 [0-9A-Z]`)
- account: `cus_Q8f3LmN2xZ7p`, `acct_1Nv0FGQ9RKHgCVdK`, `ACCT-0048213`, `CUST-100245`
- card: `4242 4242 4242 4242`, `4242424242424242`, `5555 5555 5555 4444`, `3782 822463 10005`

**Must not match** (`detect(s)` → `[]`): `@maya`, `user@localhost`, `a@b.c`, `ada at example dot com`,
`2026-09-26`, `v2.14.3`, `$48,210`, `1,284`, `2.1%`, `Order #10442`, `192.168.0.1`, `555-0132`,
`+15% growth`, `20260926`, `3f1c9a2e-7b4d-4e8a-9c6f-1a2b3c4d5e6f` (UUID),
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` (hex hash),
`getUserAccountSettingsHandlerV2`, `sk_live_short`, `the_live_show`, `in_progress`,
`sub_category1`, `cus_short`, `discus_1234567890`, `ACC-12`, `4242 4242 4242 4241` (Luhn),
`1727344800000` (timestamp), `2026 0926 1200`,
`Weekly digest: 3 tickets closed, median response 2h 14m, CSAT 96%.`

**Prose and merge (exact `detect` output):**
- `Mail maya.chen@example.com or call +1 (415) 555-0132.` → email [5,26), phone [35,52)
- `Hi! Our invoices bounce — can you call me at +1 (415) 555-0132? Account cus_Q8f3LmN2xZ7p.` → phone [45,62), account [72,88)
- `Rotated our key, the old one was ac_test_9Zx8Cv7Bn6Mm5Ll4Kk3Jj2Hh — please revoke it.` → token [33,65)
- `Please move billing to leo.martin@example.com and call +1 (628) 555-0144 after 3pm.` → email [23,45), phone [55,72)
- `Qm9X4tR7pL2vK8sN3wY6hB1dF5gJ0cZe@example.com` → one email [0,44) (the generic token [0,32) is merged into the longer email)
- `detect("maya@example.com +1 (415) 555-0132", ["phone"])` → phone only.

### 4.3 `src/core/geometry.ts` (WP-01), pure
```ts
export function normalizeRects(rects: readonly Rect[]): Rect[];   // drop non-finite, width <= 0 or height <= 0
export function toLocal(rect: Rect, origin: Point): Rect;         // x - origin.x, y - origin.y
export function padRect(rect: Rect, pad: number): Rect;           // grow by pad on every side
export function unionRect(a: Rect, b: Rect): Rect;
export function rectsTouch(a: Rect, b: Rect, tolerance?: number): boolean;
//   a.x <= b.x + b.width + tol && b.x <= a.x + a.width + tol && same on y (tol default MERGE_TOLERANCE)
export function mergeRects(rects: readonly Rect[], tolerance?: number): Rect[];
//   normalize, then union touching rects until fixpoint; output sorted by y, then x
export function circleIntersectsRect(s: Spotlight, r: Rect): boolean;
//   distance from centre to the closest point of r  <  s.radius  (strict: tangent = false)
export function spotlightMaskImage(s: Spotlight, r: Rect, feather?: number): string | null;
```
**spotlightMaskImage**: `null` when `!circleIntersectsRect(s, r)`; else, with
`R = Math.round(s.radius)`, `lx = Math.round(s.x − r.x)`, `ly = Math.round(s.y − r.y)`,
`inner = Math.max(0, R − feather)` (feather default `SPOTLIGHT_FEATHER`):
`radial-gradient(circle ${R}px at ${lx}px ${ly}px, transparent ${inner}px, black ${R}px)`.
The hole is rect-local on purpose (see §3, backdrop root).

### 4.4 `src/core/state.ts` (WP-01), pure reducer
```ts
export function clampRadius(value: number): number;   // round, clamp [RADIUS_MIN, RADIUS_MAX]; non-finite → DEFAULT_RADIUS
export function createPrivacyState(initial?: Partial<PrivacyState>): PrivacyState;
//   DEFAULT_PRIVACY_STATE ⊕ initial; radius clamped; invalid maskStyle → "solid"
export function privacyReducer(state: PrivacyState, action: PrivacyAction): PrivacyState;
export function revealMode(state: PrivacyState): RevealMode;
```
| action | effect |
|---|---|
| setPresenting / togglePresenting | presenting set/flipped; **holding := false** (fail-closed: a fresh key press is needed) |
| setMaskStyle | only if value ∈ MASK_STYLES, else unchanged |
| setSpotlight | spotlight := value |
| setRadius | radius := clampRadius(value) |
| pointerMove / pointerLeave | pointer := point / null |
| keyDown / keyUp | if `key === state.revealKey`: holding := true / false; other keys: unchanged |
| release | holding := false |
| sync | apply patch fields with the same validation (maskStyle ∈ MASK_STYLES, clampRadius); patching presenting does **not** reset holding (the patch sets it) |

Any action that changes no field returns **the same object** (`toBe`), so React can bail out.
**revealMode**: not presenting → `none`; holding → `all`; spotlight && pointer ≠ null → `spotlight`; else `none`.

### 4.5 `src/core/overlay.ts` + `src/core/params.ts` (WP-01), pure
```ts
export function computeOverlay(
  state: PrivacyState, targets: readonly MaskTarget[], feather?: number,
): OverlayView;
export function parseDemoParams(sp: Record<string, string | string[] | undefined>): DemoParams;
```
**computeOverlay**:
- not presenting → `{ presenting: false, mode, reveal: "none", spotlight: null, count: 0, masks: [] }`.
- presenting: one MaskView per rect of each target, in target order then rect order. Rect source
  is `partialRects` when `maskStyle === "partial"`, else `rects`. `count = targets.length`.
- reveal `all`: every mask `revealed: true`, `maskImage: null`, spotlight null.
- reveal `spotlight`: `spotlight = { ...pointer, radius }`; per mask `revealed =
  circleIntersectsRect`, `maskImage = spotlightMaskImage(spotlight, rect, feather)`.
- reveal `none`: all `revealed: false`, `maskImage: null`, spotlight null.

**parseDemoParams** (array values → first element):
`present` `"1"`/`"true"` → presenting (default false) · `mode` ∈ MASK_STYLES else `"solid"` ·
`spotlight` `"0"`/`"false"` → false (default true) · `radius` finite number → `clampRadius`, else
110 · `tour` `"1"` · `autoplay` `"1"` · `t` finite → `Math.floor`, clamp `[0, DEMO_DURATION_MS]`, else 0.

### 4.6 `src/spotlight/*` (WP-02): DOM scanner + component + hook
```ts
// src/spotlight/scanner.ts
/** Client rects of a Range or Element in viewport px. Injectable because jsdom has no layout. */
export type MeasureFn = (target: Range | Element) => Rect[];
export const defaultMeasure: MeasureFn;   // Array.from(target.getClientRects(), r => ({ x: r.left, y: r.top, width: r.width, height: r.height }))
export type ScanOptions = {
  detectors?: readonly DetectorKind[];    // default DETECTOR_KINDS
  measure?: MeasureFn;                     // default defaultMeasure
  origin?: Point;                          // viewport position of the overlay origin; default root.getBoundingClientRect() left/top
  padding?: number;                        // default MASK_PADDING
  keep?: number;                           // default PARTIAL_KEEP
};
export function scanSensitive(root: Element, options?: ScanOptions): MaskTarget[];

// src/spotlight/usePrivacySpotlight.ts
export type PrivacyController = { state: PrivacyState; dispatch: (action: PrivacyAction) => void };
export function usePrivacySpotlight(initial?: Partial<PrivacyState>): PrivacyController;
//   useReducer(privacyReducer, initial, createPrivacyState)

// src/spotlight/PrivacySpotlight.tsx ("use client")
export type PrivacySpotlightProps = {
  children: ReactNode;
  /** Controlled mode (demo toolbar). Absent → internal controller from `initial`. */
  controller?: PrivacyController;
  initial?: Partial<PrivacyState>;
  detectors?: readonly DetectorKind[];
  measure?: MeasureFn;
  padding?: number;
  /** Called after every scan with the current targets ([] when not presenting). */
  onTargetsChange?: (targets: MaskTarget[]) => void;
  className?: string;
};
export function PrivacySpotlight(props: PrivacySpotlightProps): ReactElement;

// src/spotlight/index.ts: public barrel
export { PrivacySpotlight, usePrivacySpotlight, scanSensitive, defaultMeasure };
export type { PrivacySpotlightProps, PrivacyController, MeasureFn, ScanOptions };
export * from "@/core/types";  // plus DETECTOR_KINDS, MASK_STYLES, detect, computeOverlay, createPrivacyState
```
**scanSensitive** (normative):
1. Walk `root` in document order (TreeWalker `SHOW_ELEMENT | SHOW_TEXT`).
2. Element with `[data-sensitive]` (any value) → one `marked` target from `measure(element)`, and
   its subtree is skipped (only the outermost marked element counts). This applies **even inside
   `[data-privacy-ignore]`**: explicit sensitive beats opt-out.
3. Text nodes are skipped when an ancestor (up to root) is `[data-privacy-ignore]`, or is
   `SCRIPT`, `STYLE`, `NOSCRIPT`, `TEMPLATE`, `TEXTAREA`. Otherwise `detect(node.data, detectors)`.
   Each match gives a Range(node, start, end) → `rects`, and a Range over `partialRange(match, keep)` → `partialRects`.
4. Rects: `measure` → `toLocal(origin)` → `mergeRects` → `padRect(padding)`. For `marked`, `partialRects` is a copy of `rects`.
5. Drop targets with no rects (hidden/`display:none`). Then assign ids `t0…`.
6. `owner` = `data-testid` of the closest element at or above the marked element / the text node's
   parent, stopping **before** `root` (root and anything above it are never owners); null if none.

**PrivacySpotlight** DOM (testids in §6):
```html
<div data-testid="privacy-root" class="ps-root" style="position:relative">   ← mousemove/mouseleave listeners
  <div class="ps-content" style="position:relative;z-index:0">{children}</div>   ← scanned & observed
  <div data-testid="privacy-overlay" data-privacy-overlay aria-hidden="true" class="ps-overlay" …>
    <div data-testid="privacy-mask" …/> × masks
    <div data-testid="privacy-spotlight" …/>   ← only when reveal === "spotlight"
  </div>
</div>
```
- The overlay is a **sibling** of the content (never scanned, and its re-renders never trigger the
  MutationObserver). It is `position:absolute; inset:0; pointer-events:none; z-index:1`. Coordinates
  are relative to `privacy-root`, so page scroll needs no rescan.
- Render = `computeOverlay(state, targets)`. Each mask: `left/top/width/height` px from its rect,
  `mask-image` **and** `-webkit-mask-image` = `maskImage` when non-null, class per mode.
- Pointer: `mousemove` on root → `pointerMove` with `{ x: clientX − rootRect.left, y: clientY − rootRect.top }`;
  `mouseleave` → `pointerLeave`. Mouse events, not pointer events (jsdom 26 has no PointerEvent, and
  this is a mouse-driven presenter tool).
- Keys: `window` `keydown`/`keyup` → `keyDown`/`keyUp` with `event.key` (`preventDefault()` on the
  reveal key while presenting, to stop Alt from focusing browser menus); `window` `blur` and
  `document` `visibilitychange` (hidden) → `release`. Listeners live in the component and use the
  active controller's dispatch.
- **Scanning (fail-closed):**
  - When presenting turns true (and on mount if presenting), scan synchronously in `useLayoutEffect`.
    Masks are committed before the first paint.
  - A `MutationObserver` on the content (childList, subtree, characterData, attributes
    `data-sensitive`/`data-privacy-ignore`) rescans **inside its callback** and commits with
    `flushSync`. New text is masked before the next paint.
  - `ResizeObserver` on the content (guarded, jsdom lacks it), `window` resize, `scroll` (capture) and
    `document.fonts.ready` schedule one rescan per animation frame.
  - All observers are disconnected when not presenting (targets = [], `onTargetsChange([])` is called once).
  - The component calls `scanSensitive(contentElement, { origin: privacy-root rect left/top, detectors, measure, padding })`.
  - `onTargetsChange(targets)` is called after each scan.
- Styles (`src/spotlight/privacy-spotlight.css`, imported by the component):
  - solid: opaque `background: #2a3142` with the `KIND_LABELS` text (`data-label`) in 9 px mono caps.
  - blur: `backdrop-filter: blur(14px) saturate(0.6)` + `rgba(20,24,33,0.35)` tint.
  - partial: like solid, but over the partial rects.
  - reveal `all`: masks `visibility: hidden`.
  - spotlight ring: 2 px accent circle centred on the pointer, diameter `2·radius`.
  - `prefers-reduced-motion: reduce` disables mask/ring transitions.
  - jsdom drops unknown CSS properties, so unit tests assert `mask-image`/`backdrop-filter` only through `computeOverlay` (pure) and e2e (computed style).

### 4.7 Demo content `src/demo/*` (WP-03)
```ts
// src/demo/data.ts: static, deterministic (normative strings below)
export type Customer = { name: string; email: string; phone: string; id: string; plan: string; mrr: string };
export type ApiKey = { testId: string; label: string; value: string; lastUsed: string };
export type InboxMessage = { from: string; subject: string; body: string; received: string };
export const COMPANY: string;             // "Acme Cloud"
export const TODAY: string;               // "2026-09-26"
export const APP_VERSION: string;         // "v2.14.3"
export const KPIS: { testId: string; label: string; value: string }[];
export const CUSTOMERS: Customer[];
export const BILLING: { cardNumber: string; expiry: string; email: string; accountId: string; address: string; note: string; plan: string };
export const API_KEYS: ApiKey[];
export const INBOX: InboxMessage[];
export const NEW_TICKET: InboxMessage;
export const EXPECTED_TARGETS = 35;             // masked values before the ticket
export const EXPECTED_TARGETS_WITH_TICKET = 38;

// src/demo/Dashboard.tsx
export function Dashboard(props: { ticket: boolean; onAddTicket: () => void }): ReactElement;
// src/demo/Toolbar.tsx ("use client")
export type ToolbarProps = { state: PrivacyState; dispatch: (a: PrivacyAction) => void; hiddenCount: number };
export function Toolbar(props: ToolbarProps): ReactElement;
// src/demo/demo.css
```
**Data (normative):**

| # | name (`data-sensitive`) | email | phone | id | plan | mrr |
|---|---|---|---|---|---|---|
| 0 | Maya Chen | maya.chen@example.com | +1 (415) 555-0132 | cus_Q8f3LmN2xZ7p | Pro | $490 |
| 1 | Tomás Ortega | tomas.ortega@example.org | +44 20 7946 0958 | cus_Tb3Nc8Wd1Fe5 | Team | $1,250 |
| 2 | Aiko Tanaka | aiko@tanaka-design.example | (212) 555-0187 | cus_7Hn2Wq9Rt4Kd | Starter | $49 |
| 3 | Priya Raman | priya.r@example.net | +1 646 555 0199 | cus_Zp4Lx8Vb2Nm6 | Enterprise | $4,800 |
| 4 | Jonas Weber | j.weber@example.com | +1-312-555-0110 | cus_Rt5Yh7Uj3Ki9 | Pro | $490 |

- KPIS: `kpi-mrr` MRR `$48,210` · `kpi-customers` Active customers `1,284` · `kpi-churn` Churn (30d) `2.1%` · `kpi-nps` NPS `61`.
- BILLING: cardNumber `4242 4242 4242 4242`, expiry `12/28`, email `billing@acme-corp.example`,
  accountId `acct_1Nv0FGQ9RKHgCVdK`, address (`data-sensitive`) `221B Baker Street, London NW1 6XE`,
  note (`data-sensitive`) `Renewal: 18% discount approved by CFO`, plan `Enterprise · annual`.
- API_KEYS (label · value · lastUsed): `api-key-live` Production secret key · `ac_live_7Hq2Kx9LmP4vT8sW3nB6yR1c` · 2 min ago;
  `api-key-test` Test secret key · `ac_test_4fG8hJ2kL6mN0pQ3rS5tU7vW` · 1 h ago;
  `api-key-jwt` Service JWT · `eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJkZW1vLXVzZXIifQ.x7Rk2Lq9Vt4Wm8Ny3Pb6Hs1Z` · yesterday;
  `api-key-generic` Webhook signing secret · `Qm9X4tR7pL2vK8sN3wY6hB1dF5gJ0cZe` · 3 days ago.
- INBOX (from · subject · received · body):
  0 `maya.chen@example.com` · Invoices bouncing · 09:14 · `Hi! Our invoices bounce — can you call me at +1 (415) 555-0132? Account cus_Q8f3LmN2xZ7p.`;
  1 `d.kowalski@example.org` · Key rotated · 08:52 · `Rotated our key, the old one was ac_test_9Zx8Cv7Bn6Mm5Ll4Kk3Jj2Hh — please revoke it.`;
  2 `digest@acme-corp.example` · Weekly digest · 07:00 · `Weekly digest: 3 tickets closed, median response 2h 14m, CSAT 96%.`
- NEW_TICKET: `leo.martin@example.com` · Update billing contact · 09:31 · `Please move billing to leo.martin@example.com and call +1 (628) 555-0144 after 3pm.`
- Count: customers 20 + billing 5 (card, email, account, address, note) + keys 4 + inbox 6 (3 from, body0 ×2, body1 ×1) = **35**; the ticket adds 3 → **38**. No other rendered text inside the dashboard may match a detector.
- Every value is rendered as the **sole text** of its own inline `<span data-testid=…>` (one text
  node, so React never splits it). Inbox bodies are one string each.

**Dashboard layout** (inside the wrapper, 1440×900 viewport). A header strip with `COMPANY · Admin`,
`today-date`, `app-version`. A 4-tile KPI row. Then a 2-column grid `minmax(0,3fr) minmax(0,2fr)`:
left = Customers table then Support inbox; right = Billing card then API keys card. There are no
inner scroll containers. Long tokens use `word-break: break-all` in a mono font. The inbox card has
an `inbox-add` button ("Simulate incoming ticket", disabled once `ticket` is true); when `ticket` is
true, NEW_TICKET is rendered as message index 3 (top of the list is fine, testids fixed by index).

**Toolbar** (outside the wrapper, sticky, `data-testid="toolbar"`):
- `toggle-presenting` button "Presentation mode", `aria-pressed = presenting` → `togglePresenting`.
- `mode-solid` / `mode-blur` / `mode-partial` buttons, `aria-pressed` = current style → `setMaskStyle`.
  `mode-blur` has `title` "Cosmetic: blur can leak short values. Use Solid on real calls."
- `toggle-spotlight` button "Spotlight", `aria-pressed` → `setSpotlight(!spotlight)`.
- `radius-input` `<input type="range" min=40 max=320 step=10>` value = radius → `setRadius(Number(value))`.
- `hidden-count`: `data-count` = presenting ? hiddenCount : 0. Text is `"{n} values hidden"`
  (`"1 value hidden"` when n = 1), or `"Not presenting"`.
- `reveal-hint`: text `Hold ⌥ Alt to reveal all`, `data-active = String(presenting && holding)`.

### 4.8 Tour `src/scenario/tour.ts` (WP-04), pure
```ts
export type TourFrame = { presenting: boolean; maskStyle: MaskStyle; holding: boolean; ticket: boolean };
export type CursorWaypoint = { at: number; target: string };  // target = data-testid
export const GLIDE_MS = 700;
export const TOUR_INITIAL: TourFrame;          // { presenting: false, maskStyle: "solid", holding: false, ticket: false }
export const TOUR_BEATS: Beat<TourFrame>[];    // §7, label = caption
export const TOUR_CURSOR: CursorWaypoint[];    // §7
export function createTour(): Timeline<TourFrame>;   // createTimeline({ initial: () => TOUR_INITIAL, beats: TOUR_BEATS, duration: DEMO_DURATION_MS })
export function easeInOut(p: number): number;        // quad: p < .5 ? 2p² : 1 − (−2p+2)²/2, p clamped to [0,1]
export function cursorAt(t: number, waypoints?: readonly CursorWaypoint[]): { from: string | null; to: string; progress: number };
//   i = last waypoint with at <= t (t below the first → 0); to = wp[i].target;
//   i === 0 → { from: null, progress: 1 }; else from = wp[i-1].target, progress = easeInOut((t − wp[i].at) / GLIDE_MS)
```

### 4.9 Page wiring `src/components/*` + `app/page.tsx` (WP-04)
```ts
// src/components/DemoApp.tsx ("use client")
export function DemoApp(props: { params: DemoParams }): ReactElement;
// src/components/TourDriver.tsx ("use client"): mounted only when params.tour
export function TourDriver(props: {
  controller: PrivacyController; onTicket: (ticket: boolean) => void; initialT: number; autoplay: boolean;
}): ReactElement;
```
- `app/page.tsx`: async server component. `const sp = await searchParams` →
  `<DemoShell title="Privacy Spotlight" hook=… badge="offline · fake data" footer={threat note}><DemoApp params={parseDemoParams(sp)} /></DemoShell>`.
  Footer `threat-note`: "Visual protection for screen sharing only. Values stay in the DOM."
- DemoApp: `controller = usePrivacySpotlight({ presenting, maskStyle, spotlight, radius })` from params.
  It renders `Toolbar` (hiddenCount from `onTargetsChange(t => t.length)`), then
  `<PrivacySpotlight controller>` + `<Dashboard ticket={userTicket || tourTicket} onAddTicket>`,
  and `TourDriver` when `params.tour`.
- TourDriver: `player = useScenarioPlayer(createTour(), { initialT, autoplay })` + `ScenarioControls`.
  - On each `player.state` change, dispatch `sync` with `{ presenting, maskStyle, holding }` and call `onTicket(ticket)`.
  - On each `player.t` (layout effect), `cursorAt(t)` gives from/to testids. Resolve their centres
    (`getBoundingClientRect`, viewport), `P = lerp(from, to, progress)`, then place the
    `ghost-cursor` (position fixed) at P.
  - If P is inside `privacy-root`'s rect, dispatch `pointerMove(P − rootRect.topLeft)`; else `pointerLeave`.
  - `body` gets `cursor: none` while the tour is mounted.

## 5. Jev decisions
None. This project does not use Jev (no probabilistic decision). The simulated-first rule is met
by static fake data and the pure tour timeline (`@jib/demo-kit`). `app/api/jev/route.ts` and the
`@jib/jev` dependency are removed (Harness request 1).

## 6. UI
Dark theme (`@jib/ui/styles.css`), viewport 1440×900. `DemoShell` header (title, hook, badge
`offline · fake data`) → sticky Toolbar → (tour only: `ScenarioControls`) → wrapped Dashboard →
footer threat note.

`data-testid` contract (tests use only these):

| testid | element | attributes / text |
|---|---|---|
| `privacy-root` | wrapper root | receives mouse events |
| `privacy-overlay` | overlay | `data-presenting` true/false, `data-mode` solid/blur/partial, `data-reveal` none/spotlight/all, `data-count` (targets masked) |
| `privacy-mask` | one per MaskView | `data-kind`, `data-label` (KIND_LABELS), `data-target` (t0…), `data-owner` (testid or ""), `data-revealed` true/false; inline left/top/width/height |
| `privacy-spotlight` | ring, only when reveal = spotlight | `data-x`, `data-y` (Math.round, root-local), `data-radius`; box centred on the pointer |
| `toolbar`, `toggle-presenting`, `mode-solid`, `mode-blur`, `mode-partial`, `toggle-spotlight`, `radius-input`, `hidden-count`, `reveal-hint` | toolbar | §4.7 |
| `today-date`, `app-version`, `kpi-mrr`, `kpi-customers`, `kpi-churn`, `kpi-nps` | dashboard header/KPIs | non-sensitive controls |
| `customer-row-{i}`, `customer-name-{i}` (`data-sensitive`), `customer-email-{i}`, `customer-phone-{i}`, `customer-id-{i}`, `customer-plan-{i}`, `customer-mrr-{i}` | customers table, i = 0…4 | value spans |
| `billing-card`, `billing-card-number`, `billing-expiry`, `billing-email`, `billing-account-id`, `billing-address` (`data-sensitive`), `billing-note` (`data-sensitive`), `billing-plan` | billing card | value spans |
| `api-keys-card`, `api-key-live`, `api-key-test`, `api-key-jwt`, `api-key-generic` | API keys card | value spans (the value only) |
| `inbox-card`, `inbox-message-{i}`, `inbox-from-{i}`, `inbox-subject-{i}`, `inbox-body-{i}`, `inbox-add` | support inbox, i = 0…2 (+3 with ticket) | |
| `ghost-cursor` | tour only | `data-target` = current `to` testid |
| `threat-note` | footer | text contains "DOM" |
| `scenario-toggle`, `scenario-restart`, `scenario-progress`, `scenario-caption`, `provider-badge` | from `@jib/ui` | |

Query params (`parseDemoParams`): `?present=1`, `?mode=solid|blur|partial`, `?spotlight=0`,
`?radius=160` set the initial state (screenshots). `?tour=1` mounts the tour (ignores the other
params once its first frame syncs). `&t=<ms>` seeks paused, `&autoplay=1` plays.

## 7. Demo scenario (deterministic, 15 s: `/?tour=1&autoplay=1`)
`TOUR_BEATS` (label = caption, normative):

| at (ms) | label | patch |
|---|---|---|
| 0 | `A normal admin dashboard, full of customer data` | — |
| 2000 | `Presentation mode: every sensitive value masked` | presenting true |
| 3000 | `Spotlight: only what's under the cursor is readable` | — |
| 7000 | `Blur mode (cosmetic)` | maskStyle blur |
| 8500 | `Partial mode: •••• 4242` | maskStyle partial |
| 10000 | `A new ticket arrives, already masked` | ticket true |
| 11500 | `Hold ⌥ Alt: reveal everything, on purpose` | holding true |
| 13000 | `Release: masked again` | holding false |
| 14000 | `Presentation mode off` | presenting false |

`TOUR_CURSOR`: 0 `kpi-mrr` · 1000 `toggle-presenting` · 3000 `customer-email-1` · 5000 `api-key-live` · 8500 `hidden-count` · 13200 `toggle-presenting`.

| t (s) | Beat | Visible result |
|---|---|---|
| 0.0 | intro | full dashboard, all PII readable, toolbar "Not presenting" |
| 1.0–1.7 | glide | ghost cursor to the Presentation mode button |
| 2.0 | present | 35 values masked (labelled) in one frame, `35 values hidden`, KPIs/plans/prices readable |
| 3.0–3.7 | glide | cursor onto Tomás's email; spotlight ring; only row 1 around the cursor is readable |
| 5.0–5.7 | glide | cursor to the production secret key; the key is readable inside the circle, neighbours masked |
| 7.0 | blur | frosted masks; spotlight still reveals the key |
| 8.5 | partial | cursor leaves to the toolbar (no spotlight); card shows `•••• 4242`-style tails, emails end `.com`, keys end `yR1c` |
| 10.0 | ticket | message 3 appears, its email/phone already masked, counter `38 values hidden` |
| 11.5 | hold Alt | every mask disappears, `reveal-hint` lit |
| 13.0 | release | masks back |
| 13.2–13.9 | glide | cursor to Presentation mode |
| 14.0 | off | dashboard readable again |
| 15.0 | end | |

## 8. Out of scope
v1.1 items (configurable selectors, custom regexp rules, per-field strategies) · name/address
detection · `<input>`/`<textarea>` values · text split across nodes · canvas/image/video content
(unless marked) · clipping to inner scroll containers · portals outside the wrapper · browser
extension · real screen-capture APIs (`getDisplayMedia`) and "auto-detect sharing" · dwell-delay
spotlight · touch/pen support · persistence · light theme · mobile layout · extracting a shared
package now · Jev.

## 9. Harness requests
1. **Cleanup:** delete `app/api/jev/route.ts` (and the empty `app/api` dir), remove `@jib/jev` from
   `package.json` dependencies and from `next.config.ts` `transpilePackages`. Keep `@jib/ui` and `@jib/demo-kit`.
2. **Contract stubs:** copy `src/core/types.ts` and `src/core/constants.ts` **complete** from §4.1
   so WP-03 (types + `DEFAULT_PRIVACY_STATE`) builds in wave 1. Stub the rest per §4. Create
   `src/spotlight/privacy-spotlight.css` and `src/demo/demo.css` empty. Replace the scaffold smoke
   tests only if the test-author did not.
3. **Optional, later (not now):** once shipped, extract `src/core/**` + `src/spotlight/**` into
   `packages/privacy-spotlight` (`@jib/privacy-spotlight`). No shared-package change is needed for v1.

## 10. Content plan
- **Record:** `pnpm --filter @jib-app/privacy-spotlight build && pnpm --filter @jib-app/privacy-spotlight start`,
  open `http://localhost:3108/?tour=1&autoplay=1` at 1440×900 and record 15 s. For a "real hands"
  cut, use `/` with the mouse and follow §7.
  Stills: `/?tour=1&t=4500` (spotlight on a row), `/?tour=1&t=9500` (partial `•••• 4242`),
  `/?present=1&mode=blur` (frosted).
- **Post:** "I made a React component for screen sharing without leaking your data. Wrap your app,
  hit Presentation mode: emails, phones, API keys, card numbers and customer IDs get masked in the
  same frame. Point at one value and only that spot becomes readable. Hold ⌥ to reveal all."
- **Thread:**
  1. The API: `<PrivacySpotlight><Dashboard/></PrivacySpotlight>` plus `data-sensitive`.
  2. Detectors: Luhn for cards, ≥4 digits + mixed case for secrets, so dates, versions, prices and UUIDs stay readable.
  3. The backdrop-root gotcha: why the spotlight hole lives on each mask.
  4. Honest threat model: pixels only. Values stay in the DOM, and blur is cosmetic.
  5. Fail-closed: MutationObserver + `flushSync` masks new data before it is painted.

## Changelog
- 2026-09-26: initial spec (spec-writer).
