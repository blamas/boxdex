import { describe, expect, it } from "vitest";
import { type RadarAxis, axisMaxima, radarValues } from "../src/lib/radar";

interface Item {
  sens?: number;
  fs?: number;
}

const AXES: RadarAxis<Item>[] = [
  { label: "Sensitivity", unit: "dB", invert: false, get: (i) => i.sens },
  // lower is better
  { label: "Fs (inv.)", unit: "Hz", invert: true, get: (i) => i.fs },
];

describe("axisMaxima", () => {
  it("takes the max per axis across the pool, treating missing values as 0", () => {
    const pool: Item[] = [{ sens: 96, fs: 40 }, { sens: 100 }, { fs: 30 }];
    expect(axisMaxima(pool, AXES)).toEqual([100, 40]);
  });

  it("yields 0 for an axis nobody carries", () => {
    expect(axisMaxima([{}], AXES)).toEqual([0, 0]);
  });
});

describe("radarValues", () => {
  it("normalises to 100 = pool max", () => {
    const maxima = [100, 40];
    expect(radarValues({ sens: 96, fs: 40 }, AXES, maxima)[0]).toBeCloseTo(96);
  });

  it("inverts axes where lower raw values are better", () => {
    const maxima = [100, 40];
    // fs=30 → 75 normalised → inverted 25
    expect(radarValues({ sens: 100, fs: 30 }, AXES, maxima)[1]).toBeCloseTo(25);
  });

  it("scores 0 on a zero-max axis instead of dividing by zero", () => {
    expect(radarValues({ sens: 96 }, AXES, [0, 0])).toEqual([0, 100]);
  });
});
