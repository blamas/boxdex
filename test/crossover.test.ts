import { describe, expect, it } from "vitest";
import {
  applyCrossovers,
  EXTRAPOLATION_OCTAVES,
  extrapolatedDb,
  findCrossingHz,
  lr4Db,
  MAX_APPROX_DIFF_DB,
  resolveCrossovers,
  suggestCrossovers,
  type XoCurve,
  type XoSuggestion,
  xoOverrideKey,
} from "../src/lib/crossover";
import { LOG_GRID, type ResponseBand } from "../src/lib/stack";

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

describe("extrapolatedDb", () => {
  const points: [number, number][] = [
    [100, 100],
    [200, 80],
  ]; // -20 dB/octave
  const reach = 2 ** EXTRAPOLATION_OCTAVES;
  const [f0] = points[0];
  const [f1] = points[points.length - 1];

  it("matches interpDb inside the real data range", () => {
    expect(extrapolatedDb(points, 150)).toBeCloseTo(88.3, 1);
  });

  it("extrapolates past the last point using the last segment's own slope", () => {
    // EXTRAPOLATION_OCTAVES further forward continues the same -20 dB/octave trend.
    expect(extrapolatedDb(points, f1 * reach)).toBeCloseTo(60, 5);
  });

  it("extrapolates before the first point using the first segment's own slope", () => {
    expect(extrapolatedDb(points, f0 / reach)).toBeCloseTo(120, 5);
  });

  it("returns null more than EXTRAPOLATION_OCTAVES past either edge", () => {
    expect(extrapolatedDb(points, f1 * reach + 1)).toBeNull();
    expect(extrapolatedDb(points, f0 / reach - 1)).toBeNull();
  });

  it("returns null for a degenerate (<2 point) curve", () => {
    expect(extrapolatedDb([[100, 90]], 200)).toBeNull();
    expect(extrapolatedDb([], 200)).toBeNull();
  });
});

describe("findCrossingHz", () => {
  it("finds the exact crossing of two straight (log-linear) curves", () => {
    // Both curves are single-segment lines in log-f/dB space, so the diff between them
    // is itself exactly linear in log10(f): the crossing at the geometric mean of the
    // range (1000 Hz) is recovered exactly by the interpolation, no approximation error.
    const low: [number, number][] = [
      [100, 100],
      [10000, 60],
    ];
    const high: [number, number][] = [
      [100, 60],
      [10000, 100],
    ];
    const result = findCrossingHz(low, high);
    expect(result?.fcHz).toBe(1000);
    expect(result?.extrapolated).toBe(false);
    expect(result?.approximated).toBe(false);
  });

  it("returns undefined for an empty curve", () => {
    const points: [number, number][] = [
      [100, 90],
      [1000, 90],
    ];
    expect(findCrossingHz([], points)).toBeUndefined();
    expect(findCrossingHz(points, [])).toBeUndefined();
  });

  it("returns undefined when the curves' domains are too far apart to bridge", () => {
    const low: [number, number][] = [
      [20, 80],
      [80, 80],
    ];
    const high: [number, number][] = [
      [500, 90],
      [2000, 90],
    ];
    expect(findCrossingHz(low, high)).toBeUndefined();
  });

  it("falls back to the closest approach when domains overlap but the curves never cross", () => {
    // Flat at a constant 10 dB gap the whole way: no exact crossing exists anywhere, but
    // the curves stay within MAX_APPROX_DIFF_DB, so the closest approach (tied everywhere
    // here, first grid point wins) stands in instead of leaving the corner blank.
    const low: [number, number][] = [
      [100, 100],
      [10000, 100],
    ];
    const high: [number, number][] = [
      [100, 90],
      [10000, 90],
    ];
    const result = findCrossingHz(low, high);
    expect(result).toBeDefined();
    expect(result?.approximated).toBe(true);
  });

  it("reports a gap instead of a closest approach beyond MAX_APPROX_DIFF_DB", () => {
    // A constant 50 dB apart: any "closest approach" would be an arbitrary frequency,
    // not a usable handoff, so no corner is suggested at all.
    const low: [number, number][] = [
      [100, 100],
      [10000, 100],
    ];
    const high: [number, number][] = [
      [100, 100 - MAX_APPROX_DIFF_DB - 30],
      [10000, 100 - MAX_APPROX_DIFF_DB - 30],
    ];
    expect(findCrossingHz(low, high)).toBeUndefined();
  });

  it("returns the first crossing (scanning low→high) when curves cross more than once", () => {
    // low is a "V": 90 dB at both ends, dipping to 70 at 1000 Hz. high is flat at 80 dB.
    // diff (low-high) is +10 at 100 Hz, -10 at 1000 Hz, +10 at 10000 Hz: two crossings,
    // one around 316 Hz (log midpoint of 100-1000), one around 3162 Hz (log midpoint of
    // 1000-10000). The first one must win.
    const low: [number, number][] = [
      [100, 90],
      [1000, 70],
      [10000, 90],
    ];
    const high: [number, number][] = [
      [100, 80],
      [10000, 80],
    ];
    const fc = findCrossingHz(low, high)?.fcHz;
    expect(fc).toBeDefined();
    expect(fc as number).toBeGreaterThan(200);
    expect(fc as number).toBeLessThan(500);
  });

  it("returns an exact tangent point without needing a sign change", () => {
    // Both curves touch exactly 80 dB at a shared LOG_GRID node, staying above it (and
    // above each other's higher curve) on both sides: a zero-diff point with no sign
    // flip around it, which the sign-change scan alone would miss.
    const touchF = LOG_GRID[60];
    const low: [number, number][] = [
      [touchF / 4, 100],
      [touchF, 80],
      [touchF * 4, 100],
    ];
    const high: [number, number][] = [
      [touchF / 4, 90],
      [touchF, 80],
      [touchF * 4, 90],
    ];
    expect(findCrossingHz(low, high)?.fcHz).toBe(Math.round(touchF));
  });

  it("extrapolates up to one octave past a curve's edge to catch a crossing just beyond it", () => {
    // low drops 20 dB/octave, real data only to 200 Hz; high is flat at 70 dB from
    // 150 Hz. They don't cross within low's own real range (low is still louder at
    // 200 Hz: 80 vs 70), but extending low's own trend one octave further (to 400 Hz)
    // crosses it well before that, just past where low's real data happens to stop.
    const low: [number, number][] = [
      [100, 100],
      [200, 80],
    ];
    const high: [number, number][] = [
      [150, 70],
      [1000, 70],
    ];
    const result = findCrossingHz(low, high);
    expect(result).toBeDefined();
    expect(result?.extrapolated).toBe(true);
    expect(result?.fcHz as number).toBeGreaterThan(200);
    expect(result?.fcHz as number).toBeLessThan(400);
  });

  it("falls back to the closest approach when the true crossing needs more than one octave of reach", () => {
    const low: [number, number][] = [
      [100, 100],
      [200, 80],
    ]; // -20 dB/octave
    const high: [number, number][] = [
      [150, 55],
      [1000, 55],
    ]; // flat, still below low even after a full octave of extrapolation (60 dB at 400 Hz)
    const result = findCrossingHz(low, high);
    expect(result).toBeDefined();
    expect(result?.approximated).toBe(true);
    // closest approach is at the far edge of the extrapolated reach (400 Hz), where low
    // has decayed the most: never fabricated past EXTRAPOLATION_OCTAVES though.
    expect(result?.fcHz as number).toBeLessThanOrEqual(400);
  });

  it("can bridge a small gap between domains that don't touch at all, within reach", () => {
    // low's real data ends at 100 Hz (declining), high's starts at 150 Hz (flat at 82,
    // just under where low's own trend is heading): a real gap between the two domains,
    // but well within a combined one-octave-each reach (100*2=200 >= 150/2=75), and the
    // curves do cross once bridged.
    const low: [number, number][] = [
      [50, 100],
      [100, 90],
    ];
    const high: [number, number][] = [
      [150, 82],
      [1000, 82],
    ];
    const result = findCrossingHz(low, high);
    expect(result).toBeDefined();
    expect(result?.extrapolated).toBe(true);
    expect(result?.fcHz as number).toBeGreaterThan(150);
    expect(result?.fcHz as number).toBeLessThan(200);
  });
});

describe("suggestCrossovers", () => {
  const curve = (partial: Partial<XoCurve> & Pick<XoCurve, "id" | "category">): XoCurve => ({
    name: partial.id.toUpperCase(),
    points: [],
    ...partial,
  });

  it("gives each box its own independent low/high corner from its neighbors", () => {
    const a = curve({
      id: "a",
      category: "sub",
      points: [
        [100, 100],
        [10000, 60],
      ],
    });
    const b = curve({
      id: "b",
      category: "top",
      points: [
        [100, 60],
        [10000, 100],
      ],
    });
    const [sa, sb] = suggestCrossovers([a, b]);
    expect(sa.id).toBe("a");
    expect(sa.lowHz).toBeUndefined(); // no band below
    expect(sa.highHz).toBe(1000); // crossing with b
    expect(sa.highGap).toBe(false);
    expect(sa.highExtrapolated).toBe(false);
    expect(sb.id).toBe("b");
    expect(sb.lowHz).toBe(1000); // crossing with a
    expect(sb.highHz).toBeUndefined(); // no band above
  });

  it("flags a corner found via extrapolation", () => {
    const low = curve({
      id: "low",
      category: "sub",
      points: [
        [100, 100],
        [200, 80],
      ],
    });
    const high = curve({
      id: "high",
      category: "top",
      points: [
        [150, 70],
        [1000, 70],
      ],
    });
    const [sLow, sHigh] = suggestCrossovers([low, high]);
    expect(sLow.highExtrapolated).toBe(true);
    expect(sHigh.lowExtrapolated).toBe(true);
    expect(sLow.highGap).toBe(false);
    expect(sHigh.lowGap).toBe(false);
  });

  it("flags a corner found only as the closest approach, not an exact crossing", () => {
    const low = curve({
      id: "low",
      category: "sub",
      points: [
        [100, 100],
        [10000, 100],
      ],
    });
    const high = curve({
      id: "high",
      category: "top",
      points: [
        [100, 90],
        [10000, 90],
      ],
    });
    const [sLow, sHigh] = suggestCrossovers([low, high]);
    expect(sLow.highApproximated).toBe(true);
    expect(sHigh.lowApproximated).toBe(true);
    expect(sLow.highGap).toBe(false);
    expect(sHigh.lowGap).toBe(false);
    expect(sLow.highHz).toBeDefined();
  });

  it("orders bands by category band order (sub → mid → top), not input order", () => {
    const lo = curve({
      id: "lo",
      category: "sub",
      points: [
        [20, 100],
        [50, 100],
      ],
    });
    const mid = curve({
      id: "mid",
      category: "mid",
      points: [
        [40, 100],
        [400, 100],
      ],
    });
    const hi = curve({
      id: "hi",
      category: "top",
      points: [
        [300, 100],
        [3000, 100],
      ],
    });
    const suggestions = suggestCrossovers([hi, lo, mid]);
    expect(suggestions.map((s) => s.id)).toEqual(["lo", "mid", "hi"]);
    expect(suggestions[0].lowHz).toBeUndefined(); // lo: no band below
    expect(suggestions[2].highHz).toBeUndefined(); // hi: no band above
    expect(suggestions[1].lowHz).toBeDefined(); // mid: crosses with lo below
    expect(suggestions[1].highHz).toBeDefined(); // mid: crosses with hi above
  });

  it("boxes of the same category share one band: no crossover between them, shared corners", () => {
    // Two sub models playing the same band, flat at 100 and 94 dB: their power-sum
    // composite sits at ~101 dB, so the crossing with the rising top happens where the
    // top passes ~101 dB (~328 Hz), above where the louder sub alone would cross (316 Hz).
    const subA = curve({
      id: "subA",
      category: "sub",
      points: [
        [30, 100],
        [400, 100],
      ],
    });
    const subB = curve({
      id: "subB",
      category: "sub",
      points: [
        [40, 94],
        [400, 94],
      ],
    });
    const top = curve({
      id: "top",
      category: "top",
      points: [
        [100, 70],
        [1000, 130],
      ],
    });
    const [sA, sB, sTop] = suggestCrossovers([subA, subB, top]);
    expect([sA.id, sB.id, sTop.id]).toEqual(["subA", "subB", "top"]);
    // No corner between the two subs: neither has a band below, both share the same
    // lowpass toward the top, and the top's highpass is that same handoff.
    expect(sA.lowHz).toBeUndefined();
    expect(sB.lowHz).toBeUndefined();
    expect(sA.highHz).toBe(sB.highHz);
    expect(sTop.lowHz).toBe(sA.highHz);
    expect(sA.highHz as number).toBeGreaterThan(320);
    expect(sA.highHz as number).toBeLessThan(340);
  });

  it("clamps a box's lowHz up to its CD floor and raises its neighbor's highHz to match", () => {
    const low = curve({
      id: "low",
      category: "sub",
      points: [
        [100, 100],
        [10000, 60],
      ],
    });
    const high = curve({
      id: "high",
      category: "top",
      points: [
        [100, 60],
        [10000, 100],
      ],
      minCrossoverHz: 1500,
    });
    // Raw crossing (see the exact-crossing test above) is 1000 Hz, below high's own 1500
    // floor: both sides of the handoff move to the floor, an aligned pair rather than a
    // 1000-1500 Hz hole where neither box plays full-range.
    const [sLow, sHigh] = suggestCrossovers([low, high]);
    expect(sHigh.lowHz).toBe(1500);
    expect(sHigh.clampedToCdMin).toBe(true);
    expect(sHigh.cdMinHz).toBe(1500);
    expect(sLow.highHz).toBe(1500);
    expect(sLow.highClampedToCdMin).toBe(true);
    expect(sLow.clampedToCdMin).toBe(false);
  });

  it("never fabricates a point from a CD floor when the curves are too far apart", () => {
    const low = curve({
      id: "low",
      category: "sub",
      points: [
        [20, 80],
        [80, 80],
      ],
    });
    const high = curve({
      id: "high",
      category: "top",
      points: [
        [500, 90],
        [2000, 90],
      ],
      minCrossoverHz: 600,
    });
    const [sLow, sHigh] = suggestCrossovers([low, high]);
    expect(sHigh.lowHz).toBeUndefined();
    expect(sHigh.lowGap).toBe(true);
    expect(sHigh.clampedToCdMin).toBe(false);
    expect(sLow.highHz).toBeUndefined();
    expect(sLow.highGap).toBe(true);
    expect(sLow.highClampedToCdMin).toBe(false);
  });

  it("drops curves that can't place a crossing (fewer than 2 points)", () => {
    const empty = curve({ id: "empty", category: "sub", points: [] });
    const single = curve({ id: "single", category: "mid", points: [[100, 90]] });
    const ok = curve({
      id: "ok",
      category: "top",
      points: [
        [300, 90],
        [3000, 90],
      ],
    });
    const suggestions = suggestCrossovers([empty, single, ok]);
    expect(suggestions.map((s) => s.id)).toEqual(["ok"]);
    // Dropped curves aren't neighbors either: ok has no band below.
    expect(suggestions[0].lowHz).toBeUndefined();
    expect(suggestions[0].lowGap).toBe(false);
  });
});

describe("applyCrossovers", () => {
  const flat = (id: string): ResponseBand & { id: string } => ({
    id,
    category: "sub",
    qty: 1,
    points: [
      [50, 100],
      [100, 100],
      [200, 100],
    ],
  });

  it("highpasses a band at its own lowHz", () => {
    const [a] = applyCrossovers([flat("a")], [{ id: "a", lowHz: 100, highHz: undefined }]);
    expect(a.points[1][1]).toBeCloseTo(100 - 6.02, 1); // at fc
    expect(a.points[0][1]).toBeCloseTo(100 - 24.6, 1); // octave below
  });

  it("lowpasses a band at its own highHz", () => {
    const [a] = applyCrossovers([flat("a")], [{ id: "a", lowHz: undefined, highHz: 100 }]);
    expect(a.points[1][1]).toBeCloseTo(100 - 6.02, 1); // at fc
    expect(a.points[2][1]).toBeCloseTo(100 - 24.6, 1); // octave above
  });

  it("applies an independent highpass and lowpass to the same band", () => {
    const [a] = applyCrossovers([flat("a")], [{ id: "a", lowHz: 60, highHz: 150 }]);
    for (const [f, db] of a.points) {
      const expected = 100 + lr4Db(f, 60, "highpass") + lr4Db(f, 150, "lowpass");
      expect(db).toBeCloseTo(expected, 5);
    }
  });

  it("passes bands through untouched when no matching point exists", () => {
    const band = flat("a");
    expect(applyCrossovers([band], [])[0]).toBe(band);
  });

  it("passes a band through untouched when both its corners are undefined", () => {
    const band = flat("a");
    const [a] = applyCrossovers([band], [{ id: "a", lowHz: undefined, highHz: undefined }]);
    expect(a).toBe(band);
  });

  it("applies the same filter to two bands sharing an id (two slots, one model)", () => {
    const points = [{ id: "shared", lowHz: 100, highHz: undefined }];
    const [s1, s2] = applyCrossovers([flat("shared"), flat("shared")], points);
    expect(s1.points[1][1]).toBeCloseTo(100 - 6.02, 1);
    expect(s2.points[1][1]).toBeCloseTo(100 - 6.02, 1);
  });
});

describe("resolveCrossovers", () => {
  const suggestion = (partial: Partial<XoSuggestion> = {}): XoSuggestion => ({
    id: "box",
    name: "Box",
    lowHz: 90,
    highHz: 3000,
    lowGap: false,
    highGap: false,
    lowExtrapolated: false,
    highExtrapolated: false,
    lowApproximated: false,
    highApproximated: false,
    clampedToCdMin: false,
    highClampedToCdMin: false,
    cdMinHz: undefined,
    floorHz: 70,
    ceilingHz: 4000,
    ...partial,
  });

  it("passes suggestions through when no override is set", () => {
    const [p] = resolveCrossovers([suggestion()], {});
    expect(p.lowHz).toBe(90);
    expect(p.highHz).toBe(3000);
    expect(p.lowCustom).toBe(false);
    expect(p.highCustom).toBe(false);
    expect(p.lowWarnings).toEqual([]);
    expect(p.highWarnings).toEqual([]);
  });

  it("applies a valid low override without warnings, leaving the high corner untouched", () => {
    const [p] = resolveCrossovers([suggestion()], { [xoOverrideKey("box", "lo")]: 85 });
    expect(p.lowHz).toBe(85);
    expect(p.lowCustom).toBe(true);
    expect(p.highHz).toBe(3000);
    expect(p.highCustom).toBe(false);
    expect(p.lowWarnings).toEqual([]);
  });

  it("applies a valid high override independently of the low corner", () => {
    const [p] = resolveCrossovers([suggestion()], { [xoOverrideKey("box", "hi")]: 2500 });
    expect(p.highHz).toBe(2500);
    expect(p.highCustom).toBe(true);
    expect(p.lowHz).toBe(90);
    expect(p.lowCustom).toBe(false);
  });

  it("warns a low override below the CD protection floor", () => {
    const [p] = resolveCrossovers([suggestion({ cdMinHz: 95 })], {
      [xoOverrideKey("box", "lo")]: 80,
    });
    expect(p.lowWarnings).toContain("below the CD protection floor (≥ 95 Hz): diaphragm risk");
  });

  it("warns overrides outside this box's own measured range", () => {
    const [lowBelow] = resolveCrossovers([suggestion()], { [xoOverrideKey("box", "lo")]: 50 });
    expect(lowBelow.lowWarnings).toContain("below this box's own lowest measured point (70 Hz)");
    const [lowAbove] = resolveCrossovers([suggestion()], { [xoOverrideKey("box", "lo")]: 9000 });
    expect(lowAbove.lowWarnings).toContain("above this box's own highest measured point (4000 Hz)");
    const [highBelow] = resolveCrossovers([suggestion()], { [xoOverrideKey("box", "hi")]: 50 });
    expect(highBelow.highWarnings).toContain("below this box's own lowest measured point (70 Hz)");
    const [highAbove] = resolveCrossovers([suggestion()], { [xoOverrideKey("box", "hi")]: 5000 });
    expect(highAbove.highWarnings).toContain(
      "above this box's own highest measured point (4000 Hz)"
    );
  });

  it("clears the gap flag when a custom override fills it in", () => {
    const gap = suggestion({ lowHz: undefined, lowGap: true });
    expect(resolveCrossovers([gap], {})[0].lowGap).toBe(true);
    const [p] = resolveCrossovers([gap], { [xoOverrideKey("box", "lo")]: 120 });
    expect(p.lowGap).toBe(false);
    expect(p.lowHz).toBe(120);
  });

  it("clears the extrapolated flag when a custom override replaces the corner", () => {
    const extrapolated = suggestion({ lowExtrapolated: true });
    expect(resolveCrossovers([extrapolated], {})[0].lowExtrapolated).toBe(true);
    const [p] = resolveCrossovers([extrapolated], { [xoOverrideKey("box", "lo")]: 85 });
    expect(p.lowExtrapolated).toBe(false);
  });

  it("clears the approximated flag when a custom override replaces the corner", () => {
    const approximated = suggestion({ lowApproximated: true });
    expect(resolveCrossovers([approximated], {})[0].lowApproximated).toBe(true);
    const [p] = resolveCrossovers([approximated], { [xoOverrideKey("box", "lo")]: 85 });
    expect(p.lowApproximated).toBe(false);
  });

  it("clears the CD-clamp flag on override, but still warns if the override is still too low", () => {
    const clamped = suggestion({ lowHz: 95, clampedToCdMin: true, cdMinHz: 95 });
    expect(resolveCrossovers([clamped], {})[0].clampedToCdMin).toBe(true);
    const [p] = resolveCrossovers([clamped], { [xoOverrideKey("box", "lo")]: 80 });
    expect(p.clampedToCdMin).toBe(false);
    expect(p.lowWarnings.length).toBeGreaterThan(0);
  });

  it("clears the high-side CD-follow flag when a custom high override replaces it", () => {
    const followed = suggestion({ highHz: 1500, highClampedToCdMin: true });
    expect(resolveCrossovers([followed], {})[0].highClampedToCdMin).toBe(true);
    const [p] = resolveCrossovers([followed], { [xoOverrideKey("box", "hi")]: 2000 });
    expect(p.highClampedToCdMin).toBe(false);
    expect(p.highHz).toBe(2000);
  });

  it("ignores non-positive overrides", () => {
    const [p] = resolveCrossovers([suggestion()], { [xoOverrideKey("box", "lo")]: 0 });
    expect(p.lowCustom).toBe(false);
    expect(p.lowHz).toBe(90);
  });
});
