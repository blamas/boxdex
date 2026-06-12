import { describe, expect, it } from "vitest";
import {
  type EnclosureRecord,
  deriveMetrics,
  filterByCategory,
  frontierLine,
  paretoFront,
  provenanceOf,
  sortRecords,
} from "../src/lib/metrics";

function record(partial: Partial<EnclosureRecord> & { slug: string }): EnclosureRecord {
  return {
    name: partial.slug,
    category: "sub",
    topology: "sealed",
    topologyVariant: undefined,
    driverCount: 1,
    drivers: [],
    driverSizes: [],
    ways: undefined,
    recommendedFor: [],
    verified: false,
    provenance: "sim",
    buildComplexity: undefined,
    hasPlans: false,
    hasMeasurements: false,
    availableKinds: [],
    recommendedCrossoverHz: undefined,
    coverageAngleDeg: undefined,
    recommendedPowerW: undefined,
    powerAesW: undefined,
    powerProgramW: undefined,
    metrics: {},
    ...partial,
  };
}

describe("filterByCategory", () => {
  const records = [
    record({ slug: "a", category: "sub" }),
    record({ slug: "b", category: "top" }),
    record({ slug: "c", category: "sub" }),
  ];

  it("returns all records (same reference) for 'all'", () => {
    expect(filterByCategory(records, "all")).toBe(records);
  });

  it("keeps only the matching category", () => {
    expect(filterByCategory(records, "sub").map((r) => r.slug)).toEqual(["a", "c"]);
    expect(filterByCategory(records, "top").map((r) => r.slug)).toEqual(["b"]);
  });
});

describe("sortRecords", () => {
  it("sorts by name A–Z", () => {
    const recs = [
      record({ slug: "Charlie" }),
      record({ slug: "alpha" }),
      record({ slug: "Bravo" }),
    ];
    expect(sortRecords(recs, "name").map((r) => r.slug)).toEqual(["alpha", "Bravo", "Charlie"]);
  });

  it("sorts a 'min better' metric ascending", () => {
    const recs = [
      record({ slug: "big", metrics: { volumeL: 300 } }),
      record({ slug: "small", metrics: { volumeL: 50 } }),
    ];
    expect(sortRecords(recs, "volumeL").map((r) => r.slug)).toEqual(["small", "big"]);
  });

  it("sorts a 'max better' metric descending", () => {
    const recs = [
      record({ slug: "quiet", metrics: { maxSplDb: 120 } }),
      record({ slug: "loud", metrics: { maxSplDb: 140 } }),
    ];
    expect(sortRecords(recs, "maxSplDb").map((r) => r.slug)).toEqual(["loud", "quiet"]);
  });

  it("pushes records missing the metric to the end", () => {
    const recs = [
      record({ slug: "none", metrics: {} }),
      record({ slug: "has", metrics: { volumeL: 100 } }),
    ];
    expect(sortRecords(recs, "volumeL").map((r) => r.slug)).toEqual(["has", "none"]);
  });

  it("does not mutate the input array", () => {
    const recs = [
      record({ slug: "b", metrics: { volumeL: 2 } }),
      record({ slug: "a", metrics: { volumeL: 1 } }),
    ];
    const order = recs.map((r) => r.slug);
    sortRecords(recs, "volumeL");
    expect(recs.map((r) => r.slug)).toEqual(order);
  });
});

describe("provenanceOf", () => {
  it("is 'measured' when at least one measurement exists", () => {
    expect(provenanceOf([{}])).toBe("measured");
  });

  it("is 'sim' when there are no measurements", () => {
    expect(provenanceOf([])).toBe("sim");
  });
});

describe("deriveMetrics", () => {
  it("computes footprintCm2 correctly", () => {
    const m = deriveMetrics({
      netVolumeL: 100,
      dims: { hMm: 800, wMm: 600, dMm: 500 },
      specs: { f3Hz: 40 },
    });
    // 600 * 500 / 100 = 3000
    expect(m.footprintCm2).toBe(3000);
  });

  it("computes outputDensity when maxSplDb is present", () => {
    const m = deriveMetrics({
      netVolumeL: 100,
      dims: { hMm: 800, wMm: 600, dMm: 500 },
      specs: { f3Hz: 40, maxSplDb: 130 },
    });
    // 130 - 10 * log10(100) = 130 - 20 = 110
    expect(m.outputDensity).toBe(110);
  });

  it("outputDensity is undefined when maxSplDb is absent", () => {
    const m = deriveMetrics({
      netVolumeL: 100,
      dims: { hMm: 800, wMm: 600, dMm: 500 },
      specs: { f3Hz: 40 },
    });
    expect(m.outputDensity).toBeUndefined();
  });

  it("rounds outputDensity to 1 decimal place", () => {
    const m = deriveMetrics({
      netVolumeL: 50,
      dims: { hMm: 800, wMm: 600, dMm: 500 },
      specs: { f3Hz: 40, maxSplDb: 130 },
    });
    // 130 - 10 * log10(50) = 130 - 16.98... = 113.01..., rounded = 113.0
    expect(m.outputDensity).toBe(113.0);
  });

  it("passes through volumeL and heightMm unchanged", () => {
    const m = deriveMetrics({
      netVolumeL: 75.5,
      dims: { hMm: 920, wMm: 500, dMm: 400 },
      specs: { f3Hz: 45 },
    });
    expect(m.volumeL).toBe(75.5);
    expect(m.heightMm).toBe(920);
  });
});

describe("paretoFront", () => {
  function makeRecord(slug: string, metrics: Record<string, number | undefined>): EnclosureRecord {
    return {
      slug,
      name: slug,
      category: "sub",
      topology: "sealed",
      topologyVariant: undefined,
      driverCount: 1,
      drivers: [],
      driverSizes: [],
      ways: undefined,
      recommendedFor: [],
      verified: false,
      provenance: "sim",
      buildComplexity: undefined,
      hasPlans: false,
      hasMeasurements: false,
      availableKinds: [],
      recommendedCrossoverHz: undefined,
      coverageAngleDeg: undefined,
      recommendedPowerW: undefined,
      powerAesW: undefined,
      powerProgramW: undefined,
      metrics,
    };
  }

  it("identifies the non-dominated point on min/max axes", () => {
    // xKey=volumeL (min better), yKey=maxSplDb (max better)
    // A: vol=100, spl=130
    // B: vol=200, spl=130 → dominated by A (same SPL, worse vol)
    // C: vol=100, spl=125 → dominated by A (same vol, worse SPL)
    // D: vol=80,  spl=128 → not dominated by A (better vol, worse SPL)
    const records = [
      makeRecord("A", { volumeL: 100, maxSplDb: 130 }),
      makeRecord("B", { volumeL: 200, maxSplDb: 130 }),
      makeRecord("C", { volumeL: 100, maxSplDb: 125 }),
      makeRecord("D", { volumeL: 80, maxSplDb: 128 }),
    ];

    const frontier = paretoFront(records, "volumeL", "maxSplDb");
    expect(frontier.has(0)).toBe(true); // A
    expect(frontier.has(1)).toBe(false); // B dominated
    expect(frontier.has(2)).toBe(false); // C dominated
    expect(frontier.has(3)).toBe(true); // D
  });

  it("skips records with undefined metrics", () => {
    const records = [
      makeRecord("A", { volumeL: 100, maxSplDb: 130 }),
      makeRecord("B", { volumeL: undefined, maxSplDb: 135 }),
      makeRecord("C", { volumeL: 200, maxSplDb: undefined }),
    ];
    const frontier = paretoFront(records, "volumeL", "maxSplDb");
    expect(frontier.has(0)).toBe(true);
    expect(frontier.has(1)).toBe(false);
    expect(frontier.has(2)).toBe(false);
  });

  it("returns empty set for unknown axis key", () => {
    const records = [makeRecord("A", { volumeL: 100 })];
    expect(paretoFront(records, "volumeL", "nonexistent")).toEqual(new Set());
  });
});

describe("frontierLine", () => {
  function makeRecord(slug: string, vol: number): EnclosureRecord {
    return {
      slug,
      name: slug,
      category: "sub",
      topology: "sealed",
      topologyVariant: undefined,
      driverCount: 1,
      drivers: [],
      driverSizes: [],
      ways: undefined,
      recommendedFor: [],
      verified: false,
      provenance: "sim",
      buildComplexity: undefined,
      hasPlans: false,
      hasMeasurements: false,
      availableKinds: [],
      recommendedCrossoverHz: undefined,
      coverageAngleDeg: undefined,
      recommendedPowerW: undefined,
      powerAesW: undefined,
      powerProgramW: undefined,
      metrics: { volumeL: vol, maxSplDb: 130 - vol / 10 },
    };
  }

  it("returns frontier records sorted by xKey ascending", () => {
    const records = [makeRecord("C", 300), makeRecord("A", 100), makeRecord("B", 200)];
    const frontier = new Set([0, 1, 2]);
    const line = frontierLine(records, frontier, "volumeL");
    expect(line.map((r) => r.slug)).toEqual(["A", "B", "C"]);
  });
});
