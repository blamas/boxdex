import { describe, expect, it } from "vitest";
import type { CompressionDriver, ConeDriver, Driver } from "../src/lib/schemas";
import { allSubstitutes, scoreDriver } from "../src/lib/similarity";

function subs(target: Driver, pool: Driver[], limit = 10) {
  return allSubstitutes([target, ...pool], limit).get(target.id) ?? [];
}

function makeCone(id: string, partial: Partial<ConeDriver> = {}): ConeDriver {
  return {
    id,
    type: "cone",
    brand: "Test",
    model: id,
    impedanceOhm: 8,
    peW: 600,
    sizeInch: 18,
    fsHz: 35,
    qts: 0.35,
    vasL: 180,
    sdCm2: 1180,
    xmaxMm: 8,
    sensitivityDb: 97,
    ...partial,
  };
}

function makeCd(id: string, partial: Partial<CompressionDriver> = {}): CompressionDriver {
  return {
    id,
    type: "compression",
    brand: "Test",
    model: id,
    impedanceOhm: 8,
    peW: 80,
    exitInch: 1.4,
    voiceCoilMm: 75,
    fLowHz: 500,
    fHighHz: 18000,
    minCrossoverHz: 800,
    sensitivityHornDb: 108,
    ...partial,
  };
}

describe("subs: hard filters", () => {
  const target = makeCone("target");

  it("excludes the target itself, other sizes and other types", () => {
    const pool = [
      target,
      makeCone("same-size"),
      makeCone("other-size", { sizeInch: 15 }),
      makeCd("cd"),
    ];
    const ids = subs(target, pool).map((c) => c.driver.id);
    expect(ids).toEqual(["same-size"]);
  });

  it("matches compression drivers on throat exit", () => {
    const cd = makeCd("cd-target");
    const pool = [makeCd("same-exit"), makeCd("other-exit", { exitInch: 2 })];
    const ids = subs(cd, pool).map((c) => c.driver.id);
    expect(ids).toEqual(["same-exit"]);
  });

  it("honours the limit", () => {
    const target2 = makeCone("t");
    const pool = Array.from({ length: 15 }, (_, i) => makeCone(`c${i}`));
    expect(subs(target2, pool, 10)).toHaveLength(10);
  });
});

describe("subs: cone scoring", () => {
  const target = makeCone("target");

  it("scores an identical driver 0 / close and ranks it first", () => {
    const pool = [makeCone("twin"), makeCone("far", { qts: 0.7, fsHz: 55 })];
    const [first, second] = subs(target, pool);
    expect(first.driver.id).toBe("twin");
    expect(first.score).toBe(0);
    expect(first.tier).toBe("close");
    expect(second.tier).toBe("risky");
  });

  it("penalises less Xmax harder than more Xmax", () => {
    const pool = [makeCone("more", { xmaxMm: 16 }), makeCone("less", { xmaxMm: 4 })];
    const [first, second] = subs(target, pool);
    expect(first.driver.id).toBe("more");
    expect(first.score).toBeLessThan(second.score);
  });

  it("grades a moderate deviation as usable", () => {
    // Qts off by ×2 alone: 3·1/9 ≈ 0.33 → usable
    const [c] = subs(target, [makeCone("c", { qts: 0.7 })]);
    expect(c.tier).toBe("usable");
  });

  it("reports per-parameter deltas", () => {
    const [c] = subs(target, [makeCone("c", { fsHz: 40 })]);
    const fs = c.deltas.find((d) => d.key === "fs");
    expect(fs).toEqual({ key: "fs", unit: "Hz", target: 35, candidate: 40 });
  });
});

describe("subs: compression scoring", () => {
  const target = makeCd("target");

  it("penalises a higher protection floor harder than a lower one", () => {
    const pool = [
      makeCd("lower-floor", { minCrossoverHz: 400 }),
      makeCd("higher-floor", { minCrossoverHz: 1600 }),
    ];
    const [first, second] = subs(target, pool);
    expect(first.driver.id).toBe("lower-floor");
    expect(first.score).toBeLessThan(second.score);
  });
});

describe("scoreDriver", () => {
  it("returns Infinity when types differ", () => {
    expect(scoreDriver(makeCone("a"), makeCd("b"))).toBe(Infinity);
  });

  it("returns Infinity when size groups differ (cone)", () => {
    expect(scoreDriver(makeCone("a"), makeCone("b", { sizeInch: 15 }))).toBe(Infinity);
  });

  it("returns Infinity when exit groups differ (compression)", () => {
    expect(scoreDriver(makeCd("a"), makeCd("b", { exitInch: 2 }))).toBe(Infinity);
  });

  it("returns 0 for an identical compression driver", () => {
    expect(scoreDriver(makeCd("a"), makeCd("b"))).toBe(0);
  });

  it("routes compression candidates through compression scoring", () => {
    const target = makeCd("t");
    const closer = makeCd("c1", { minCrossoverHz: 600 });
    const further = makeCd("c2", { minCrossoverHz: 1600 });
    expect(scoreDriver(target, closer)).toBeLessThan(scoreDriver(target, further));
  });
});

describe("subs: flags", () => {
  const target = makeCone("target");

  it("flags impedance, power and Xmax regressions", () => {
    const [c] = subs(target, [makeCone("c", { impedanceOhm: 4, peW: 300, xmaxMm: 5 })]);
    expect(c.flags).toEqual([
      { key: "impedanceDiffers", params: { candidate: 4, target: 8 } },
      { key: "lowerPower", params: { candidate: 300, target: 600 } },
      { key: "lowerExcursion", params: { candidate: 5, target: 8 } },
    ]);
  });

  it("flags a raised CD crossover floor", () => {
    const cd = makeCd("t");
    const [c] = subs(cd, [makeCd("c", { minCrossoverHz: 1200 })]);
    expect(c.flags).toContainEqual({
      key: "higherMinCrossover",
      params: { candidate: 1200, target: 800 },
    });
  });

  it("has no flags for an equivalent driver", () => {
    const [c] = subs(target, [makeCone("c")]);
    expect(c.flags).toEqual([]);
  });
});
