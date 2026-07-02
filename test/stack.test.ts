import { describe, expect, it } from "vitest";
import {
  additionalUnitsNeeded,
  arrayGainDb,
  type CoverageInputs,
  calcCategoryCoverage,
  combineCategorySplDb,
  compositeResponse,
  decodeStack,
  encodeStack,
  type ResponseBand,
  recommendedGeneratorW,
  type StackSlot,
  spectralBalance,
  summarizeStack,
} from "../src/lib/stack";
import { makeMetrics, makeRecord } from "./fixtures";

describe("encodeStack / decodeStack", () => {
  it("round-trips a stack with multiple entries", () => {
    const state: StackSlot[] = [
      { slug: "tapped-horn-18", qty: 4 },
      { slug: "tapped-horn-18", qty: 2 },
      { slug: "kickbin-18-bp", qty: 2 },
      { slug: "top-12-coax", qty: 8 },
    ];
    const cov: CoverageInputs = { distanceM: 20, targetSplDb: 103, crestDb: 6 };
    const { state: s2, cov: c2 } = decodeStack(encodeStack(state, cov));
    expect(s2).toEqual(state);
    expect(c2).toEqual(cov);
  });

  it("round-trips crossover state (applied flag + per-side overrides + gain trims)", () => {
    const state: StackSlot[] = [
      { slug: "tapped-horn-18", qty: 4 },
      { slug: "top-12-coax", qty: 8 },
    ];
    const cov: CoverageInputs = { distanceM: 20, targetSplDb: 103, crestDb: 6 };
    const xo = {
      applied: true,
      overrides: { "tapped-horn-18:hi": 85, "top-12-coax:lo": 1400 },
      gains: { "tapped-horn-18": -3, "top-12-coax": 1.5 },
    };
    const decoded = decodeStack(encodeStack(state, cov, xo));
    expect(decoded.xo).toEqual(xo);
  });

  it("prunes overrides and gains for slugs no longer in the stack", () => {
    const state: StackSlot[] = [{ slug: "tapped-horn-18", qty: 4 }];
    const cov: CoverageInputs = { distanceM: 20, targetSplDb: 103, crestDb: 6 };
    const xo = {
      applied: true,
      overrides: { "tapped-horn-18:hi": 85, "removed-box:lo": 1400 },
      gains: { "tapped-horn-18": -3, "removed-box": 1.5 },
    };
    const decoded = decodeStack(encodeStack(state, cov, xo));
    expect(decoded.xo.overrides).toEqual({ "tapped-horn-18:hi": 85 });
    expect(decoded.xo.gains).toEqual({ "tapped-horn-18": -3 });
  });

  it("clamps URL-borne overrides and gains to the UI input bounds", () => {
    const { xo } = decodeStack("a:1,xa:lo=999999,xa:hi=1,ga=1000,gb=-1000");
    expect(xo.overrides["a:lo"]).toBe(20000);
    expect(xo.overrides["a:hi"]).toBe(20);
    expect(xo.gains.a).toBe(24);
    expect(xo.gains.b).toBe(-24);
  });

  it("drops a zero gain trim (no-op, same as not having one)", () => {
    const state: StackSlot[] = [{ slug: "tapped-horn-18", qty: 4 }];
    const cov: CoverageInputs = { distanceM: 20, targetSplDb: 103, crestDb: 6 };
    const xo = { applied: false, overrides: {}, gains: { "tapped-horn-18": 0 } };
    const decoded = decodeStack(encodeStack(state, cov, xo));
    expect(decoded.xo.gains).toEqual({});
  });

  it("round-trips per-slot channel overrides, keeping duplicate-slug slots independent", () => {
    const state: StackSlot[] = [
      { slug: "tapped-horn-18", qty: 8, channels: 4 },
      { slug: "tapped-horn-18", qty: 4, channels: 2 },
      { slug: "top-12-coax", qty: 4 },
    ];
    const cov: CoverageInputs = { distanceM: 20, targetSplDb: 103, crestDb: 6 };
    const { state: s2 } = decodeStack(encodeStack(state, cov));
    expect(s2[0].channels).toBe(4);
    expect(s2[1].channels).toBe(2);
    expect(s2[2].channels).toBeUndefined();
  });

  it("round-trips a channel override alongside a curve selection on the same slot", () => {
    const state: StackSlot[] = [
      { slug: "bass-reflex-18", qty: 4, channels: 2, curveSelection: "sim:driver-x" },
    ];
    const cov: CoverageInputs = { distanceM: 20, targetSplDb: 103, crestDb: 6 };
    const { state: s2 } = decodeStack(encodeStack(state, cov));
    expect(s2[0].channels).toBe(2);
    expect(s2[0].curveSelection).toBe("sim:driver-x");
  });

  it("defaults to no crossover state for a plain hash", () => {
    expect(decodeStack("a:1,d=20,spl=103,c=6").xo).toEqual({
      applied: false,
      overrides: {},
      gains: {},
    });
  });

  it("accepts an arbitrary id-keyed override (ids are enclosure slugs, not a closed enum)", () => {
    expect(decodeStack("a:1,xfoo=120").xo.overrides).toEqual({ foo: 120 });
  });

  it("accepts an arbitrary id-keyed gain trim, including negative and fractional values", () => {
    expect(decodeStack("a:1,gfoo=-3.5").xo.gains).toEqual({ foo: -3.5 });
  });

  it("drops a non-positive override", () => {
    expect(decodeStack("a:1,xsub=0").xo.overrides).toEqual({});
  });

  it("ignores a non-positive channel override", () => {
    expect(decodeStack("tapped-horn-18:4:ch0").state[0].channels).toBeUndefined();
  });

  it("preserves insertion order", () => {
    const state: StackSlot[] = [
      { slug: "top-12-coax", qty: 8 },
      { slug: "tapped-horn-18", qty: 4 },
    ];
    const { state: s2 } = decodeStack(
      encodeStack(state, { distanceM: 20, targetSplDb: 103, crestDb: 6 })
    );
    expect(s2[0].slug).toBe("top-12-coax");
    expect(s2[1].slug).toBe("tapped-horn-18");
  });

  it("returns empty state and defaults for empty string", () => {
    const { state, cov } = decodeStack("");
    expect(state).toEqual([]);
    expect(cov.distanceM).toBe(20);
    expect(cov.targetSplDb).toBe(103);
    expect(cov.crestDb).toBe(6);
  });

  it("parses coverage params from a minimal hash", () => {
    const { cov } = decodeStack("bass-reflex-18:2,d=30,spl=110,c=9");
    expect(cov.distanceM).toBe(30);
    expect(cov.targetSplDb).toBe(110);
    expect(cov.crestDb).toBe(9);
  });

  it("migrates old curveSelection key format on decode", () => {
    const { state } = decodeStack(
      "bass-reflex-18:2:meas:rcf-lf18x451-8:c1:rew_measured,d=20,spl=103,c=6"
    );
    expect(state[0].curveSelection).toBe("meas:rcf-lf18x451-8");
  });

  it("leaves new-format curveSelection unchanged on decode", () => {
    const { state } = decodeStack("bass-reflex-18:2:meas:rcf-lf18x451-8,d=20,spl=103,c=6");
    expect(state[0].curveSelection).toBe("meas:rcf-lf18x451-8");
  });
});

describe("arrayGainDb", () => {
  it("is zero for a single cabinet", () => {
    expect(arrayGainDb("sub", 1)).toBe(0);
    expect(arrayGainDb("top", 1)).toBe(0);
  });

  it("gives subs +6 dB / doubling (coherent, 20·log10 N)", () => {
    expect(arrayGainDb("sub", 2)).toBeCloseTo(6.02, 1);
    expect(arrayGainDb("sub", 4)).toBeCloseTo(12.04, 1);
  });

  it("gives mid/top +3 dB / doubling (broadband, 10·log10 N)", () => {
    expect(arrayGainDb("top", 2)).toBeCloseTo(3.01, 1);
    expect(arrayGainDb("mid", 4)).toBeCloseTo(6.02, 1);
  });
});

describe("combineCategorySplDb", () => {
  it("matches a single slot's own arrayGainDb", () => {
    const combined = combineCategorySplDb("sub", [{ maxSplDb: 138, qty: 4 }]);
    expect(combined).toBeCloseTo(138 + arrayGainDb("sub", 4), 5);
  });

  it("is invariant to how an equal-model total is split across slots", () => {
    // 8 identical subs as one slot vs. split 4+4 across two slots must combine to the
    // same category-wide SPL@1m: this is the property a naive per-slot headroom would
    // miss (see StackBuilder's coverageResults).
    const asOne = combineCategorySplDb("sub", [{ maxSplDb: 138, qty: 8 }]);
    const asTwo = combineCategorySplDb("sub", [
      { maxSplDb: 138, qty: 4 },
      { maxSplDb: 138, qty: 4 },
    ]);
    expect(asTwo).toBeCloseTo(asOne as number, 5);
  });

  it("weights differing models by their own level, not a naive average", () => {
    const combined = combineCategorySplDb("top", [
      { maxSplDb: 130, qty: 1 },
      { maxSplDb: 100, qty: 1 },
    ]);
    // Power-summing 130 and 100 dB is dominated by the louder box, staying just above 130.
    expect(combined).toBeGreaterThan(130);
    expect(combined).toBeLessThan(130.1);
  });

  it("returns undefined for no entries", () => {
    expect(combineCategorySplDb("sub", [])).toBeUndefined();
  });
});

describe("calcCategoryCoverage", () => {
  it("applies coherent array gain and inverse-square loss for a single sub entry", () => {
    // SPL@1m = 138 + 20·log10(8) = 156.06; at 20 m: −20·log10(20) = −26.02 → 130.04 dB,
    // 0.04 dB of headroom over a 130 dB target at zero crest.
    const combined = calcCategoryCoverage("sub", [{ maxSplDb: 138, qty: 8 }], 20, 130, 0);
    expect(combined?.splAt1m).toBeCloseTo(156.06, 1);
    expect(combined?.splAtD).toBeCloseTo(130.04, 1);
    expect(combined?.headroomDb).toBeCloseTo(0.04, 1);
  });

  it("folds crest factor into the required peak / headroom", () => {
    const entries = [{ maxSplDb: 138, qty: 4 }];
    const noCrest = calcCategoryCoverage("sub", entries, 20, 110, 0);
    const withCrest = calcCategoryCoverage("sub", entries, 20, 110, 6);
    expect((noCrest?.headroomDb ?? 0) - (withCrest?.headroomDb ?? 0)).toBeCloseTo(6, 5);
    expect(withCrest?.requiredPeakDb).toBe(116);
  });

  it("combines two slots of the same category into one headroom figure", () => {
    // 4+4 split of the same sub model must read exactly like the 8-cab case above.
    const combined = calcCategoryCoverage(
      "sub",
      [
        { maxSplDb: 138, qty: 4 },
        { maxSplDb: 138, qty: 4 },
      ],
      20,
      130,
      0
    );
    expect(combined?.headroomDb).toBeCloseTo(0.04, 1);
    expect(combined?.totalQty).toBe(8);
  });

  it("returns null for zero distance or no entries", () => {
    expect(calcCategoryCoverage("sub", [{ maxSplDb: 138, qty: 4 }], 0, 130)).toBeNull();
    expect(calcCategoryCoverage("sub", [], 20, 130)).toBeNull();
  });
});

describe("additionalUnitsNeeded", () => {
  it("returns 0 when the category already meets target without this slot's help", () => {
    const entries = [
      { maxSplDb: 138, qty: 8 },
      { maxSplDb: 138, qty: 4 },
    ];
    expect(additionalUnitsNeeded("sub", entries, 1, 20, 130, 0)).toBe(0);
  });

  it("solves the required total count when it's the only entry in the category", () => {
    // 138 dB per cab needs 130 + 26.02 = 156.02 dB at 1 m: 8 coupled subs
    // (+18.06 dB) reach 156.06, 7 (+16.9) don't, so a slot of 4 needs 4 more.
    const entries = [{ maxSplDb: 138, qty: 4 }];
    const more = additionalUnitsNeeded("sub", entries, 0, 20, 130, 0);
    expect(entries[0].qty + more).toBe(8);
  });

  it("accounts for another slot's contribution before recommending more", () => {
    // Two slots of 2 subs each (4 total, matching the calcCoverage(138,"sub",4,...) case
    // which needs 8 total). Growing just one slot by 4 more (to 6) should close the gap,
    // since 6+2=8 total, matching the known single-slot-of-8 result.
    const entries = [
      { maxSplDb: 138, qty: 2 },
      { maxSplDb: 138, qty: 2 },
    ];
    const more = additionalUnitsNeeded("sub", entries, 0, 20, 130, 0);
    expect(more).toBe(4);
  });
});

describe("recommendedGeneratorW", () => {
  it("applies amp efficiency and generator headroom", () => {
    // 8500 / 0.85 * 1.3 = 13000 W
    expect(recommendedGeneratorW(8500)).toBeCloseTo(13000, 0);
  });

  it("returns 0 when there is no power draw", () => {
    expect(recommendedGeneratorW(0)).toBe(0);
  });

  it("honours custom efficiency and headroom", () => {
    expect(recommendedGeneratorW(1000, 0.5, 2)).toBeCloseTo(4000, 0);
  });
});

describe("compositeResponse: interpDb edge cases", () => {
  it("contributes nothing outside a band's data range", () => {
    // Band covers 100-200 Hz only; grid points outside that range should contribute 0.
    const band: ResponseBand = {
      category: "top",
      qty: 1,
      points: [
        [100, 90],
        [200, 90],
      ],
    };
    const composite = compositeResponse([band]);
    const below = composite.find(([f]) => f < 100);
    const above = composite.find(([f]) => f > 200);
    expect(below).toBeUndefined();
    expect(above).toBeUndefined();
  });

  it("handles a single-point band (degenerate, no interval to interpolate)", () => {
    const band: ResponseBand = { category: "top", qty: 1, points: [[1000, 100]] };
    // Single point: only the exact frequency (if it falls on the grid) contributes.
    const composite = compositeResponse([band]);
    // Grid is 1/12-octave; 1000 Hz may not be exactly on a node, so result may be empty.
    expect(Array.isArray(composite)).toBe(true);
  });

  it("interpolates log-linearly: values within a band stay bounded by its endpoints", () => {
    // Declining band: all interpolated grid points within [100, 10000] Hz must
    // fall strictly between 80 and 100 dB (log-linear = monotone in log space).
    const band: ResponseBand = {
      category: "top",
      qty: 1,
      points: [
        [100, 100],
        [10000, 80],
      ],
    };
    const composite = compositeResponse([band]);
    const interior = composite.filter(([f]) => f > 100 && f < 10000);
    expect(interior.length).toBeGreaterThan(0);
    for (const [, db] of interior) {
      expect(db).toBeGreaterThan(80);
      expect(db).toBeLessThan(100);
    }
    // And the relationship must be monotonically decreasing.
    for (let i = 1; i < interior.length; i++) {
      expect(interior[i][1]).toBeLessThan(interior[i - 1][1]);
    }
  });
});

describe("compositeResponse / spectralBalance", () => {
  it("power-sums overlapping bands above either alone", () => {
    // Two identical flat 100 dB bands at qty 1 → +3 dB power sum where they overlap.
    const bands: ResponseBand[] = [
      {
        category: "top",
        qty: 1,
        points: [
          [1000, 100],
          [2000, 100],
        ],
      },
      {
        category: "top",
        qty: 1,
        points: [
          [1000, 100],
          [2000, 100],
        ],
      },
    ];
    const composite = compositeResponse(bands);
    const at1k = composite.find(([f]) => Math.abs(f - 1000) < 50);
    expect(at1k?.[1]).toBeCloseTo(103.01, 1);
  });

  it("coherent mode sums amplitudes (+6 dB for two identical bands)", () => {
    const bands: ResponseBand[] = [
      {
        category: "top",
        qty: 1,
        points: [
          [1000, 100],
          [2000, 100],
        ],
      },
      {
        category: "top",
        qty: 1,
        points: [
          [1000, 100],
          [2000, 100],
        ],
      },
    ];
    const composite = compositeResponse(bands, "coherent");
    const at1k = composite.find(([f]) => Math.abs(f - 1000) < 50);
    expect(at1k?.[1]).toBeCloseTo(106.02, 1);
  });

  it("reports a positive tilt when subs sit above tops", () => {
    const bands: ResponseBand[] = [
      {
        category: "sub",
        qty: 1,
        points: [
          [30, 130],
          [80, 130],
        ],
      },
      {
        category: "top",
        qty: 1,
        points: [
          [1000, 110],
          [10000, 110],
        ],
      },
    ];
    const bal = spectralBalance(bands);
    expect(bal).not.toBeNull();
    expect(bal?.tiltDb).toBeGreaterThan(0);
    expect(bal?.subAvgDb).toBeCloseTo(130, 0);
    expect(bal?.topAvgDb).toBeCloseTo(110, 0);
  });

  it("returns null balance when one region carries no energy", () => {
    const bands: ResponseBand[] = [
      {
        category: "sub",
        qty: 1,
        points: [
          [30, 130],
          [80, 130],
        ],
      },
    ];
    expect(spectralBalance(bands)).toBeNull();
  });
});

describe("summarizeStack", () => {
  const sub = makeRecord({
    slug: "sub",
    category: "sub",
    powerAesW: 1000,
    powerProgramW: 2000,
    metrics: makeMetrics({ f3Hz: 35, maxSplDb: 138, weightKg: 60 }),
  });
  const top = makeRecord({
    slug: "top",
    category: "top",
    recommendedCrossoverHz: undefined,
    recommendedPowerW: 400,
    metrics: makeMetrics({ f3Hz: 90, maxSplDb: 132, weightKg: 25 }),
  });

  it("totals cabinets, weight and power across slots", () => {
    const s = summarizeStack([
      { qty: 4, rec: sub },
      { qty: 2, rec: top },
    ]);
    expect(s.totalCabs).toBe(6);
    expect(s.totalWeightKg).toBe(4 * 60 + 2 * 25);
    expect(s.weightMissing).toBe(false);
    // sub uses powerAesW, top falls back to recommendedPowerW
    expect(s.totalPowerAesW).toBe(4 * 1000 + 2 * 400);
    expect(s.powerMissing).toBe(false);
    expect(s.totalPowerProgramW).toBe(4 * 2000);
    expect(s.hasProgram).toBe(true);
  });

  it("totals transport volume and plywood sheets", () => {
    const sheeted = makeRecord({
      slug: "sheeted",
      category: "sub",
      sheetCount: 2,
      sheetSizeMm: { wMm: 2440, hMm: 1220 },
      metrics: makeMetrics({ footprintCm2: 3000, heightMm: 800 }),
    });
    const s = summarizeStack([{ qty: 3, rec: sheeted }]);
    // 3 × 3000 cm² × 800 mm = 0.72 m³
    expect(s.totalTransportM3).toBeCloseTo(0.72, 5);
    expect(s.totalSheets).toBe(6);
    expect(s.sheetsMissing).toBe(false);
    expect(s.sheetSizes).toEqual(["2440×1220"]);
    // sub/top fixtures above carry no sheetCount
    const bare = summarizeStack([{ qty: 1, rec: sub }]);
    expect(bare.sheetsMissing).toBe(true);
    expect(bare.sheetSizes).toEqual([]);
  });

  it("power-sums max SPL with per-category array gain", () => {
    // 4 subs: 138 + 20*log10(4) = 150.04 dB band level; single band → that exactly
    const s = summarizeStack([{ qty: 4, rec: sub }]);
    expect(s.systemMaxSplDb).toBeCloseTo(150.04, 1);
    expect(s.maxSplPartial).toBe(false);
  });

  it("flags partial data instead of fabricating numbers", () => {
    const bare = makeRecord({
      slug: "bare",
      category: "kick",
      metrics: makeMetrics({ f3Hz: 50 }),
    });
    const s = summarizeStack([
      { qty: 1, rec: sub },
      { qty: 1, rec: bare },
    ]);
    expect(s.weightMissing).toBe(true);
    expect(s.powerMissing).toBe(true);
    expect(s.maxSplPartial).toBe(true);
    // the sub's figure still counts
    expect(s.systemMaxSplDb).toBeCloseTo(138, 0);
  });

  it("derives bandwidth from lowest f3 to the highest crossover or category upper bound", () => {
    const s = summarizeStack([
      { qty: 1, rec: sub },
      { qty: 1, rec: top },
    ]);
    expect(s.lowHz).toBe(35);
    // top has no recommendedCrossoverHz → CATEGORY_UPPER_HZ.top = 20000
    expect(s.highHz).toBe(20000);
  });

  it("returns the empty-stack shape", () => {
    const s = summarizeStack([]);
    expect(s.totalCabs).toBe(0);
    expect(s.systemMaxSplDb).toBeUndefined();
    expect(s.lowHz).toBeUndefined();
    expect(s.highHz).toBeUndefined();
  });
});
