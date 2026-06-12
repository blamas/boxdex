import { describe, expect, it } from "vitest";
import {
  applyCrossovers,
  lr4Db,
  resolveCrossovers,
  suggestCrossovers,
  type XoBand,
  type XoFilter,
  type XoSuggestion,
} from "../src/lib/crossover";
import type { ResponseBand } from "../src/lib/stack";

describe("lr4Db", () => {
  it("is −6 dB at fc", () => {
    expect(lr4Db(100, 100, "lowpass")).toBeCloseTo(-6.02, 1);
    expect(lr4Db(100, 100, "highpass")).toBeCloseTo(-6.02, 1);
  });

  it("rolls off ~24 dB the first octave out", () => {
    expect(lr4Db(200, 100, "lowpass")).toBeCloseTo(-24.6, 1);
    expect(lr4Db(50, 100, "highpass")).toBeCloseTo(-24.6, 1);
  });

  it("is transparent well inside the passband", () => {
    expect(lr4Db(10, 1000, "lowpass")).toBeCloseTo(0, 3);
    expect(lr4Db(10000, 100, "highpass")).toBeCloseTo(0, 3);
  });
});

describe("suggestCrossovers", () => {
  it("uses the lower box's recommended crossover when stated", () => {
    const bands: XoBand[] = [
      { category: "sub", f3Hz: 35, recommendedXoHz: 90 },
      { category: "top", f3Hz: 70 },
    ];
    expect(suggestCrossovers(bands)).toEqual<XoSuggestion[]>([
      {
        low: "sub",
        high: "top",
        fcHz: 90,
        source: "recommended",
        clampedToCdMin: false,
        bandFloorHz: 70,
        cdMinHz: undefined,
        hardCeilingHz: 100,
      },
    ]);
  });

  it("falls back to the geometric mean of the usable overlap", () => {
    const bands: XoBand[] = [
      { category: "sub", f3Hz: 35 }, // upper limit 100 (category default)
      { category: "top", f3Hz: 60 },
    ];
    const [s] = suggestCrossovers(bands);
    expect(s.source).toBe("geometric");
    expect(s.fcHz).toBe(Math.round(Math.sqrt(60 * 100)));
  });

  it("clamps a stated crossover up to the CD protection floor", () => {
    const bands: XoBand[] = [
      { category: "mid", f3Hz: 200, recommendedXoHz: 1000 },
      { category: "top", f3Hz: 500, minCrossoverHz: 1200 },
    ];
    const [s] = suggestCrossovers(bands);
    expect(s.fcHz).toBe(1200);
    expect(s.clampedToCdMin).toBe(true);
  });

  it("reports a spectral gap instead of inventing a point", () => {
    const bands: XoBand[] = [
      { category: "sub", f3Hz: 35, recommendedXoHz: 90 },
      { category: "top", f3Hz: 150 },
    ];
    const [s] = suggestCrossovers(bands);
    expect(s.fcHz).toBeUndefined();
  });

  it("aggregates multiple cabs per category with the most restrictive figures", () => {
    const bands: XoBand[] = [
      { category: "sub", f3Hz: 40, recommendedXoHz: 90 },
      { category: "sub", f3Hz: 50, recommendedXoHz: 85 },
      { category: "top", f3Hz: 80 },
    ];
    const [s] = suggestCrossovers(bands);
    expect(s.fcHz).toBe(85);
  });

  it("yields one suggestion per adjacent pair in category order", () => {
    const bands: XoBand[] = [
      { category: "top", f3Hz: 90 },
      { category: "sub", f3Hz: 35 },
      { category: "kick", f3Hz: 60 },
    ];
    const pairs = suggestCrossovers(bands).map((s) => `${s.low}/${s.high}`);
    expect(pairs).toEqual(["sub/kick", "kick/top"]);
  });
});

describe("applyCrossovers", () => {
  const flat = (category: ResponseBand["category"]): ResponseBand => ({
    category,
    qty: 1,
    points: [
      [50, 100],
      [100, 100],
      [200, 100],
    ],
  });

  it("lowpasses the lower band and highpasses the upper band", () => {
    const points: XoFilter[] = [{ low: "sub", high: "top", fcHz: 100 }];
    const [sub, top] = applyCrossovers([flat("sub"), flat("top")], points);
    expect(sub.points[1][1]).toBeCloseTo(100 - 6.02, 1); // LP at fc
    expect(sub.points[2][1]).toBeCloseTo(100 - 24.6, 1); // octave above
    expect(top.points[1][1]).toBeCloseTo(100 - 6.02, 1); // HP at fc
    expect(top.points[0][1]).toBeCloseTo(100 - 24.6, 1); // octave below
  });

  it("passes bands through untouched when no crossover applies to them", () => {
    const band = flat("sub");
    expect(applyCrossovers([band], [])[0]).toBe(band);
  });

  it("ignores gap suggestions (fcHz undefined)", () => {
    const points: XoFilter[] = [{ low: "sub", high: "top", fcHz: undefined }];
    const [sub] = applyCrossovers([flat("sub")], points);
    expect(sub.points[1][1]).toBe(100);
  });
});

describe("resolveCrossovers", () => {
  const suggestion = (partial: Partial<XoSuggestion> = {}): XoSuggestion => ({
    low: "sub",
    high: "top",
    fcHz: 90,
    source: "recommended",
    clampedToCdMin: false,
    bandFloorHz: 70,
    cdMinHz: undefined,
    hardCeilingHz: 100,
    ...partial,
  });

  it("passes suggestions through when no override is set", () => {
    const [p] = resolveCrossovers([suggestion()], {});
    expect(p.fcHz).toBe(90);
    expect(p.custom).toBe(false);
    expect(p.source).toBe("recommended");
    expect(p.warnings).toEqual([]);
  });

  it("applies a valid override without warnings", () => {
    const [p] = resolveCrossovers([suggestion()], { sub: 85 });
    expect(p.fcHz).toBe(85);
    expect(p.custom).toBe(true);
    expect(p.source).toBe("custom");
    expect(p.warnings).toEqual([]);
  });

  it("warns below the CD protection floor", () => {
    const [p] = resolveCrossovers([suggestion({ cdMinHz: 95 })], { sub: 80 });
    expect(p.warnings).toContain("below the CD protection floor (≥ 95 Hz): diaphragm risk");
  });

  it("warns below the upper band's F3 and above the lower band's top", () => {
    const [low] = resolveCrossovers([suggestion()], { sub: 50 });
    expect(low.warnings).toContain("below the top band's F3 (70 Hz)");
    const [highP] = resolveCrossovers([suggestion()], { sub: 150 });
    expect(highP.warnings).toContain("above the sub band's usable top (100 Hz)");
  });

  it("lets an override force a point into a spectral gap, with warnings", () => {
    const gap = suggestion({ fcHz: undefined, bandFloorHz: 150 });
    expect(resolveCrossovers([gap], {})[0].gap).toBe(true);
    const [p] = resolveCrossovers([gap], { sub: 120 });
    expect(p.gap).toBe(false);
    expect(p.fcHz).toBe(120);
    expect(p.warnings.length).toBeGreaterThan(0);
  });

  it("ignores non-positive overrides", () => {
    const [p] = resolveCrossovers([suggestion()], { sub: 0 });
    expect(p.custom).toBe(false);
    expect(p.fcHz).toBe(90);
  });
});
