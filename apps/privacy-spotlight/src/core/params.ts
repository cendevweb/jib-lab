import { DEFAULT_RADIUS, DEMO_DURATION_MS, MASK_STYLES } from "./constants";
import { clampRadius } from "./state";
import type { DemoParams, MaskStyle } from "./types";

type SearchParams = Record<string, string | string[] | undefined>;

function first(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

function toNumber(v: string | undefined): number {
  if (v === undefined || v.trim() === "") return Number.NaN;
  return Number(v);
}

export function parseDemoParams(sp: SearchParams): DemoParams {
  const present = first(sp, "present");
  const mode = first(sp, "mode");
  const spotlight = first(sp, "spotlight");
  const radius = toNumber(first(sp, "radius"));
  const t = toNumber(first(sp, "t"));
  return {
    presenting: present === "1" || present === "true",
    maskStyle: (MASK_STYLES as readonly string[]).includes(mode ?? "")
      ? (mode as MaskStyle)
      : "solid",
    spotlight: !(spotlight === "0" || spotlight === "false"),
    radius: Number.isFinite(radius) ? clampRadius(radius) : DEFAULT_RADIUS,
    tour: first(sp, "tour") === "1",
    autoplay: first(sp, "autoplay") === "1",
    t: Number.isFinite(t) ? Math.min(DEMO_DURATION_MS, Math.max(0, Math.floor(t))) : 0,
  };
}
