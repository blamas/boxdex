import { describe, expect, it } from "vitest";
import {
  type CoverageInputs,
  type ResponseBand,
  type StackSlot,
  arrayGainDb,
  calcCoverage,
  compositeResponse,
  decodeStack,
  encodeStack,
  recommendedGeneratorW,
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

describe("calcCoverage", () => {
  it("adds coherent array gain for subs and meets target at the expected count", () => {
    // splAtD = 138 - 20*log10(20) = 111.98 dB; +20*log10(8) = +18.06 → 130.04 dB
    const result = calcCoverage(138, "sub", 8, 20, 130, 0);
    expect(result).not.toBeNull();
    expect(result?.splAtD).toBeCloseTo(111.98, 1);
    expect(result?.arrayGainDb).toBeCloseTo(18.06, 1);
    expect(result?.systemSplAtD).toBeCloseTo(130.04, 1);
    expect(result?.headroomDb).toBeCloseTo(0.04, 1);
    expect(result?.nNeeded).toBe(8);
  });

  it("uses broadband gain for tops (10·log10 N)", () => {
    const result = calcCoverage(138, "top", 4, 20, 110, 0);
    expect(result?.arrayGainDb).toBeCloseTo(6.02, 1);
  });

  it("folds crest factor into the required peak / headroom", () => {
    const noCrest = calcCoverage(138, "sub", 4, 20, 110, 0);
    const withCrest = calcCoverage(138, "sub", 4, 20, 110, 6);
    expect((noCrest?.headroomDb ?? 0) - (withCrest?.headroomDb ?? 0)).toBeCloseTo(6, 5);
    expect(withCrest?.requiredPeakDb).toBe(116);
  });

  it("returns null when maxSplDb is undefined", () => {
    expect(calcCoverage(undefined, "sub", 1, 20, 103)).toBeNull();
  });

  it("returns null for zero distance", () => {
    expect(calcCoverage(130, "sub", 1, 0, 103)).toBeNull();
  });

  it("returns nNeeded=1 when a single cab already meets the required peak", () => {
    const result = calcCoverage(138, "sub", 1, 1, 103, 0);
    expect(result?.nNeeded).toBe(1);
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
