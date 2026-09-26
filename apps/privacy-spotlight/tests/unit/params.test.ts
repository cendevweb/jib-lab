import { describe, expect, it } from "vitest";
import { parseDemoParams } from "@/core/params";

describe("parseDemoParams", () => {
  it("[AC-08] empty params give the demo defaults", () => {
    expect(parseDemoParams({})).toEqual({
      presenting: false,
      maskStyle: "solid",
      spotlight: true,
      radius: 110,
      tour: false,
      autoplay: false,
      t: 0,
    });
  });

  it("[AC-08] every param set", () => {
    expect(
      parseDemoParams({
        present: "1",
        mode: "partial",
        spotlight: "0",
        radius: "160",
        tour: "1",
        autoplay: "1",
        t: "4500.7",
      }),
    ).toEqual({
      presenting: true,
      maskStyle: "partial",
      spotlight: false,
      radius: 160,
      tour: true,
      autoplay: true,
      t: 4500,
    });
  });

  it("[AC-08] boolean spellings", () => {
    expect(parseDemoParams({ present: "true" }).presenting).toBe(true);
    expect(parseDemoParams({ present: "0" }).presenting).toBe(false);
    expect(parseDemoParams({ spotlight: "false" }).spotlight).toBe(false);
    expect(parseDemoParams({ spotlight: "1" }).spotlight).toBe(true);
    expect(parseDemoParams({ tour: "0", autoplay: "0" })).toMatchObject({
      tour: false,
      autoplay: false,
    });
  });

  it("[AC-08] invalid mode falls back to solid", () => {
    expect(parseDemoParams({ mode: "neon" }).maskStyle).toBe("solid");
    expect(parseDemoParams({ mode: "blur" }).maskStyle).toBe("blur");
  });

  it("[AC-08] radius is clamped, non-numeric → 110", () => {
    expect(parseDemoParams({ radius: "999" }).radius).toBe(320);
    expect(parseDemoParams({ radius: "10" }).radius).toBe(40);
    expect(parseDemoParams({ radius: "abc" }).radius).toBe(110);
  });

  it("[AC-08] t is floored and clamped to [0, 15000]", () => {
    expect(parseDemoParams({ t: "-5" }).t).toBe(0);
    expect(parseDemoParams({ t: "99999" }).t).toBe(15000);
    expect(parseDemoParams({ t: "abc" }).t).toBe(0);
    expect(parseDemoParams({ t: "12000" }).t).toBe(12000);
  });

  it("[AC-08] array values use the first element; undefined is ignored", () => {
    expect(
      parseDemoParams({
        present: ["1", "0"],
        mode: ["blur", "solid"],
        radius: ["200", "40"],
        t: ["3000", "9000"],
        tour: undefined,
      }),
    ).toEqual({
      presenting: true,
      maskStyle: "blur",
      spotlight: true,
      radius: 200,
      tour: false,
      autoplay: false,
      t: 3000,
    });
  });
});
