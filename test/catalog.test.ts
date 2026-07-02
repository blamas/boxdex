import { describe, expect, it } from "vitest";
import {
  type DriverFilters,
  driverSortValue,
  filterDrivers,
  filterHorns,
  type HornFilters,
  hornSortValue,
  mouthCm2,
  sortDrivers,
  sortHorns,
} from "../src/lib/catalog";
import type { CompressionDriver, ConeDriver, Horn } from "../src/lib/schemas";

function cone(id: string, over: Partial<ConeDriver> = {}): ConeDriver {
  return {
    id,
    type: "cone",
    brand: "Acme",
    model: id.toUpperCase(),
    impedanceOhm: 8,
    peW: 600,
    sizeInch: 18,
    fsHz: 35,
    qts: 0.35,
    vasL: 180,
    sdCm2: 1150,
    xmaxMm: 9,
    sensitivityDb: 97,
    ...over,
  };
}

function comp(id: string, over: Partial<CompressionDriver> = {}): CompressionDriver {
  return {
    id,
    type: "compression",
    brand: "Acme",
    model: id.toUpperCase(),
    impedanceOhm: 8,
    peW: 80,
    exitInch: 1.4,
    voiceCoilMm: 75,
    fLowHz: 500,
    fHighHz: 18000,
    minCrossoverHz: 800,
    sensitivityHornDb: 108,
    ...over,
  };
}

function horn(id: string, over: Partial<Horn> = {}): Horn {
  return {
    id,
    brand: "Acme",
    model: id.toUpperCase(),
    exitInch: 1.4,
    coverageHorizontalDeg: 90,
    coverageVerticalDeg: 40,
    cutoffHz: 500,
    mouthWmm: 500,
    mouthHmm: 300,
    profile: "conical",
    ...over,
  };
}

const noDriverFilters: DriverFilters = {
  brand: "all",
  size: "all",
  impedance: "all",
  maxFs: "",
  minQts: "",
  maxQts: "",
  minXmax: "",
  minPe: "",
  maxCrossover: "",
  minSens: "",
};

const noHornFilters: HornFilters = { brand: "all", exit: "all", profile: "all", maxCutoff: "" };

describe("filterDrivers", () => {
  const drivers = [
    cone("a", { brand: "BC", sizeInch: 18, fsHz: 32, qts: 0.3, xmaxMm: 12, peW: 1200 }),
    cone("b", { brand: "Faital", sizeInch: 15, fsHz: 45, qts: 0.5, impedanceOhm: 4 }),
    comp("c", { brand: "BC", minCrossoverHz: 600, sensitivityHornDb: 110 }),
    comp("d", { brand: "BMS", exitInch: 2, minCrossoverHz: 1200 }),
  ];

  const ids = (f: Partial<DriverFilters>) =>
    filterDrivers(drivers, { ...noDriverFilters, ...f }).map((d) => d.id);

  it("passes everything with no active filters", () => {
    expect(ids({})).toEqual(["a", "b", "c", "d"]);
  });

  it("filters shared fields: brand and impedance", () => {
    expect(ids({ brand: "BC" })).toEqual(["a", "c"]);
    expect(ids({ impedance: "4" })).toEqual(["b"]);
  });

  it("interprets size per type: cone sizeInch vs compression exitInch", () => {
    expect(ids({ size: "18" })).toEqual(["a"]);
    expect(ids({ size: "2" })).toEqual(["d"]);
  });

  it("applies cone-only bounds without dropping compression drivers", () => {
    expect(ids({ maxFs: 40 })).toEqual(["a", "c", "d"]);
    expect(ids({ minQts: 0.4, maxQts: 0.6 })).toEqual(["b", "c", "d"]);
    expect(ids({ minXmax: 10, minPe: 1000 })).toEqual(["a", "c", "d"]);
  });

  it("applies compression-only bounds without dropping cones", () => {
    expect(ids({ maxCrossover: 800 })).toEqual(["a", "b", "c"]);
    expect(ids({ minSens: 109 })).toEqual(["a", "b", "c"]);
  });
});

describe("sortDrivers", () => {
  const drivers = [
    cone("slow", { fsHz: 45 }),
    cone("low", { fsHz: 28 }),
    cone("mid", { fsHz: 35 }),
  ];

  it("sorts ascending and descending by a cone column", () => {
    expect(sortDrivers(drivers, "fsHz", true).map((d) => d.id)).toEqual(["low", "mid", "slow"]);
    expect(sortDrivers(drivers, "fsHz", false).map((d) => d.id)).toEqual(["slow", "mid", "low"]);
  });

  it("keeps order across types for a column only one type carries", () => {
    const mixed = [comp("c"), cone("a")];
    expect(sortDrivers(mixed, "fsHz", true).map((d) => d.id)).toEqual(["c", "a"]);
  });

  it("does not mutate the input", () => {
    const order = drivers.map((d) => d.id);
    sortDrivers(drivers, "fsHz", true);
    expect(drivers.map((d) => d.id)).toEqual(order);
  });

  it("resolves every sortable column", () => {
    const c = cone("a", { brand: "BC", impedanceOhm: 8, peW: 1200 });
    expect(
      [
        "brand",
        "model",
        "impedanceOhm",
        "peW",
        "sizeInch",
        "fsHz",
        "qts",
        "vasL",
        "xmaxMm",
        "sensitivityDb",
      ].map((key) => driverSortValue(c, key))
    ).toEqual(["BC", "A", 8, 1200, 18, 35, 0.35, 180, 9, 97]);

    const k = comp("b");
    expect(
      ["exitInch", "voiceCoilMm", "fLowHz", "fHighHz", "minCrossoverHz", "sensitivityHornDb"].map(
        (key) => driverSortValue(k, key)
      )
    ).toEqual([1.4, 75, 500, 18000, 800, 108]);
  });
});

describe("filterHorns / sortHorns", () => {
  const horns = [
    horn("wide", { coverageHorizontalDeg: 120, cutoffHz: 800 }),
    horn("deep", { brand: "BMS", exitInch: 2, cutoffHz: 350, profile: "exponential" }),
  ];

  it("filters by brand, exit, profile and cutoff", () => {
    const ids = (f: Partial<HornFilters>) =>
      filterHorns(horns, { ...noHornFilters, ...f }).map((h) => h.id);
    expect(ids({ brand: "BMS" })).toEqual(["deep"]);
    expect(ids({ exit: "2" })).toEqual(["deep"]);
    expect(ids({ profile: "exponential" })).toEqual(["deep"]);
    expect(ids({ maxCutoff: 500 })).toEqual(["deep"]);
  });

  it("sorts by derived mouth area and puts missing depth last in either direction", () => {
    const byMouth = [horn("small", { mouthWmm: 300, mouthHmm: 200 }), horn("big")];
    expect(sortHorns(byMouth, "mouthCm2", true).map((h) => h.id)).toEqual(["small", "big"]);

    const byDepth = [horn("none"), horn("x", { depthMm: 250 })];
    expect(sortHorns(byDepth, "depthMm", true).map((h) => h.id)).toEqual(["x", "none"]);
    expect(sortHorns(byDepth, "depthMm", false).map((h) => h.id)).toEqual(["x", "none"]);
  });

  it("resolves every sortable column, falling back to brand", () => {
    const h = horn("h", { brand: "BMS", depthMm: 250 });
    expect(
      [
        "mouthCm2",
        "depthMm",
        "exitInch",
        "coverageHorizontalDeg",
        "coverageVerticalDeg",
        "cutoffHz",
        "unknown",
      ].map((key) => hornSortValue(h, key))
    ).toEqual([1500, 250, 1.4, 90, 40, 500, "BMS"]);
  });
});

describe("mouthCm2", () => {
  it("converts mouth W×H mm to rounded cm²", () => {
    expect(mouthCm2(horn("h", { mouthWmm: 500, mouthHmm: 300 }))).toBe(1500);
    expect(mouthCm2(horn("h", { mouthWmm: 333, mouthHmm: 333 }))).toBe(1109);
  });
});
