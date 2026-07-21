import { describe, expect, it } from "vitest";
import {
  AXIS_FIELDS,
  axisComboboxItems,
  deriveMetrics,
  driverFormatParts,
  type EnclosureFilters,
  filterByCategory,
  filterEnclosures,
  frontierLine,
  metricKeyOf,
  paretoFront,
  provenanceOf,
  sortEnclosuresByColumn,
  sortRecords,
} from "../src/lib/metrics";
import { makeMetrics, makeRecord } from "./fixtures";

describe("driverFormatParts", () => {
  it("returns empty when no entry carries a size or exit (caller falls back to driverCount)", () => {
    expect(driverFormatParts(makeRecord({ slug: "x", primaryDrivers: [{ qty: 2 }] }))).toEqual([]);
  });

  it("aggregates cone quantities per size, sorted ascending", () => {
    const rec = makeRecord({
      slug: "x",
      primaryDrivers: [
        { qty: 2, sizeInch: 15 },
        { qty: 1, sizeInch: 12 },
        { qty: 1, sizeInch: 15 },
      ],
    });
    expect(driverFormatParts(rec)).toEqual(['1×12"', '3×15"']);
  });

  it("keeps compression-driver quantities instead of assuming one per exit", () => {
    const rec = makeRecord({
      slug: "x",
      primaryDrivers: [
        { qty: 1, sizeInch: 12 },
        { qty: 2, exitInch: 1.4 },
      ],
    });
    expect(driverFormatParts(rec)).toEqual(['1×12"', '2×1.4"']);
  });
});

describe("filterByCategory", () => {
  const records = [
    makeRecord({ slug: "a", category: "sub" }),
    makeRecord({ slug: "b", category: "top" }),
    makeRecord({ slug: "c", category: "sub" }),
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
  it("sorts by name A-Z", () => {
    const recs = [
      makeRecord({ slug: "Charlie" }),
      makeRecord({ slug: "alpha" }),
      makeRecord({ slug: "Bravo" }),
    ];
    expect(sortRecords(recs, "name").map((r) => r.slug)).toEqual(["alpha", "Bravo", "Charlie"]);
  });

  it("sorts a 'min better' metric ascending", () => {
    const recs = [
      makeRecord({ slug: "big", metrics: makeMetrics({ volumeL: 300 }) }),
      makeRecord({ slug: "small", metrics: makeMetrics({ volumeL: 50 }) }),
    ];
    expect(sortRecords(recs, "volumeL").map((r) => r.slug)).toEqual(["small", "big"]);
  });

  it("sorts a 'max better' metric descending", () => {
    const recs = [
      makeRecord({ slug: "quiet", metrics: makeMetrics({ maxSplDb: 120 }) }),
      makeRecord({ slug: "loud", metrics: makeMetrics({ maxSplDb: 140 }) }),
    ];
    expect(sortRecords(recs, "maxSplDb").map((r) => r.slug)).toEqual(["loud", "quiet"]);
  });

  it("pushes records missing the metric to the end", () => {
    const recs = [
      makeRecord({ slug: "none", metrics: makeMetrics({ maxSplDb: undefined }) }),
      makeRecord({ slug: "has", metrics: makeMetrics({ maxSplDb: 130 }) }),
    ];
    expect(sortRecords(recs, "maxSplDb").map((r) => r.slug)).toEqual(["has", "none"]);
  });

  it("does not mutate the input array", () => {
    const recs = [
      makeRecord({ slug: "b", metrics: makeMetrics({ volumeL: 2 }) }),
      makeRecord({ slug: "a", metrics: makeMetrics({ volumeL: 1 }) }),
    ];
    const order = recs.map((r) => r.slug);
    sortRecords(recs, "volumeL");
    expect(recs.map((r) => r.slug)).toEqual(order);
  });
});

describe("sortEnclosuresByColumn", () => {
  it("sorts a string column alphabetically", () => {
    const recs = [
      makeRecord({ slug: "c", category: "top" }),
      makeRecord({ slug: "a", category: "sub" }),
      makeRecord({ slug: "b", category: "mid" }),
    ];
    expect(sortEnclosuresByColumn(recs, "category", true).map((r) => r.slug)).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(sortEnclosuresByColumn(recs, "category", false).map((r) => r.slug)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("sorts a numeric column ascending and descending", () => {
    const recs = [
      makeRecord({ slug: "big", metrics: makeMetrics({ volumeL: 300 }) }),
      makeRecord({ slug: "small", metrics: makeMetrics({ volumeL: 50 }) }),
    ];
    expect(sortEnclosuresByColumn(recs, "volumeL", true).map((r) => r.slug)).toEqual([
      "small",
      "big",
    ]);
    expect(sortEnclosuresByColumn(recs, "volumeL", false).map((r) => r.slug)).toEqual([
      "big",
      "small",
    ]);
  });

  it("sorts a boolean column, false before true when ascending", () => {
    const recs = [
      makeRecord({ slug: "yes", hasPlans: true }),
      makeRecord({ slug: "no", hasPlans: false }),
    ];
    expect(sortEnclosuresByColumn(recs, "hasPlans", true).map((r) => r.slug)).toEqual([
      "no",
      "yes",
    ]);
    expect(sortEnclosuresByColumn(recs, "hasPlans", false).map((r) => r.slug)).toEqual([
      "yes",
      "no",
    ]);
  });

  it("pushes records missing the column value to the end regardless of direction", () => {
    const recs = [
      makeRecord({ slug: "none", metrics: makeMetrics({ maxSplDb: undefined }) }),
      makeRecord({ slug: "has", metrics: makeMetrics({ maxSplDb: 130 }) }),
    ];
    expect(sortEnclosuresByColumn(recs, "maxSplDb", true).map((r) => r.slug)).toEqual([
      "has",
      "none",
    ]);
    expect(sortEnclosuresByColumn(recs, "maxSplDb", false).map((r) => r.slug)).toEqual([
      "has",
      "none",
    ]);
  });

  it("does not mutate the input array", () => {
    const recs = [
      makeRecord({ slug: "b", metrics: makeMetrics({ volumeL: 2 }) }),
      makeRecord({ slug: "a", metrics: makeMetrics({ volumeL: 1 }) }),
    ];
    const order = recs.map((r) => r.slug);
    sortEnclosuresByColumn(recs, "volumeL", true);
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

describe("metricKeyOf", () => {
  it("narrows a known axis key", () => {
    expect(metricKeyOf("volumeL")).toBe("volumeL");
  });

  it("rejects unknown or non-axis keys", () => {
    expect(metricKeyOf("nonexistent")).toBeUndefined();
    expect(metricKeyOf("maxSplExcursionDb")).toBeUndefined();
  });
});

describe("axisComboboxItems", () => {
  const axisLabels = Object.fromEntries(
    AXIS_FIELDS.map((f) => [f.key, `${f.key} (localized)`])
  ) as Record<string, string>;

  it("maps every axis field to a localized {id,label} item", () => {
    const items = axisComboboxItems(axisLabels as never);
    expect(items).toHaveLength(AXIS_FIELDS.length);
    expect(items[0]).toEqual({ id: "volumeL", label: "volumeL (localized) (L)" });
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

  it("computes outputPerKg only when both maxSplDb and weight are present", () => {
    const base = {
      netVolumeL: 100,
      dims: { hMm: 800, wMm: 600, dMm: 500 },
    };
    // 130 - 10 * log10(50) = 113.0
    expect(
      deriveMetrics({ ...base, weightKg: 50, specs: { f3Hz: 40, maxSplDb: 130 } }).outputPerKg
    ).toBe(113.0);
    expect(
      deriveMetrics({ ...base, specs: { f3Hz: 40, maxSplDb: 130 } }).outputPerKg
    ).toBeUndefined();
    expect(
      deriveMetrics({ ...base, weightKg: 50, specs: { f3Hz: 40 } }).outputPerKg
    ).toBeUndefined();
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
  it("identifies the non-dominated point on min/max axes", () => {
    // xKey=volumeL (min better), yKey=maxSplDb (max better)
    // A: vol=100, spl=130
    // B: vol=200, spl=130 → dominated by A (same SPL, worse vol)
    // C: vol=100, spl=125 → dominated by A (same vol, worse SPL)
    // D: vol=80,  spl=128 → not dominated by A (better vol, worse SPL)
    const records = [
      makeRecord({ slug: "A", metrics: makeMetrics({ volumeL: 100, maxSplDb: 130 }) }),
      makeRecord({ slug: "B", metrics: makeMetrics({ volumeL: 200, maxSplDb: 130 }) }),
      makeRecord({ slug: "C", metrics: makeMetrics({ volumeL: 100, maxSplDb: 125 }) }),
      makeRecord({ slug: "D", metrics: makeMetrics({ volumeL: 80, maxSplDb: 128 }) }),
    ];

    const frontier = paretoFront(records, "volumeL", "maxSplDb");
    expect(frontier.has(0)).toBe(true); // A
    expect(frontier.has(1)).toBe(false); // B dominated
    expect(frontier.has(2)).toBe(false); // C dominated
    expect(frontier.has(3)).toBe(true); // D
  });

  it("skips records with undefined metrics", () => {
    const records = [
      makeRecord({ slug: "A", metrics: makeMetrics({ sensitivityDb: 98, maxSplDb: 130 }) }),
      makeRecord({ slug: "B", metrics: makeMetrics({ maxSplDb: 135 }) }),
      makeRecord({ slug: "C", metrics: makeMetrics({ sensitivityDb: 102 }) }),
    ];
    const frontier = paretoFront(records, "sensitivityDb", "maxSplDb");
    expect(frontier.has(0)).toBe(true);
    expect(frontier.has(1)).toBe(false);
    expect(frontier.has(2)).toBe(false);
  });

  it("returns empty set for a key that is not a plottable axis", () => {
    const records = [makeRecord({ slug: "A" })];
    expect(paretoFront(records, "volumeL", "maxSplExcursionDb")).toEqual(new Set());
  });
});

describe("frontierLine", () => {
  const rec = (slug: string, vol: number) =>
    makeRecord({ slug, metrics: makeMetrics({ volumeL: vol, maxSplDb: 130 - vol / 10 }) });

  it("returns frontier records sorted by xKey ascending", () => {
    const records = [rec("C", 300), rec("A", 100), rec("B", 200)];
    const frontier = new Set([0, 1, 2]);
    const line = frontierLine(records, frontier, "volumeL");
    expect(line.map((r) => r.slug)).toEqual(["A", "B", "C"]);
  });
});

describe("filterEnclosures", () => {
  const noFilters: EnclosureFilters = {
    category: "all",
    topology: "all",
    driverSize: "all",
    driverCount: "all",
    name: "",
    tags: [],
    minF3: "",
    maxF3: "",
    minSpl: "",
    minVol: "",
    maxVol: "",
    measuredOnly: false,
    plansOnly: false,
    verifiedOnly: false,
  };

  const records = [
    makeRecord({
      slug: "th18",
      category: "sub",
      topology: "tapped_horn",
      driverSizes: [18],
      driverCount: 1,
      recommendedFor: ["dub"],
      verified: true,
      hasMeasurements: true,
      hasPlans: true,
      metrics: makeMetrics({ f3Hz: 35, maxSplDb: 138, volumeL: 230 }),
    }),
    makeRecord({
      slug: "br15-quad",
      category: "sub",
      topology: "bass_reflex",
      driverSizes: [15],
      driverCount: 4,
      metrics: makeMetrics({ f3Hz: 42, volumeL: 400 }),
    }),
    makeRecord({
      slug: "top12",
      category: "top",
      topology: "front_loaded_horn",
      driverSizes: [12],
      driverCount: 2,
      metrics: makeMetrics({ f3Hz: 90, maxSplDb: 132, volumeL: 60 }),
    }),
  ];

  const slugs = (f: Partial<EnclosureFilters>) =>
    filterEnclosures(records, { ...noFilters, ...f }).map((r) => r.slug);

  it("passes everything with no active filters", () => {
    expect(slugs({})).toEqual(["th18", "br15-quad", "top12"]);
  });

  it("filters by category, topology and driver size", () => {
    expect(slugs({ category: "sub" })).toEqual(["th18", "br15-quad"]);
    expect(slugs({ topology: "tapped_horn" })).toEqual(["th18"]);
    expect(slugs({ driverSize: "12" })).toEqual(["top12"]);
  });

  it("filters by driver count, including the 4+ bucket", () => {
    expect(slugs({ driverCount: "2" })).toEqual(["top12"]);
    expect(slugs({ driverCount: "4+" })).toEqual(["br15-quad"]);
  });

  it("matches a free-text name search case-insensitively", () => {
    expect(slugs({ name: "BR15" })).toEqual(["br15-quad"]);
    expect(slugs({ name: "nope" })).toEqual([]);
  });

  it("matches any selected tag", () => {
    expect(slugs({ tags: ["dub", "techno"] })).toEqual(["th18"]);
    expect(slugs({ tags: ["techno"] })).toEqual([]);
  });

  it("applies numeric bounds and excludes records missing the bounded metric", () => {
    expect(slugs({ maxF3: 40 })).toEqual(["th18"]);
    expect(slugs({ minF3: 40 })).toEqual(["br15-quad", "top12"]);
    // br15-quad has no maxSplDb: an unknown SPL cannot satisfy a minimum
    expect(slugs({ minSpl: 130 })).toEqual(["th18", "top12"]);
    expect(slugs({ minVol: 100, maxVol: 300 })).toEqual(["th18"]);
  });

  it("applies the boolean-only switches", () => {
    expect(slugs({ measuredOnly: true })).toEqual(["th18"]);
    expect(slugs({ plansOnly: true })).toEqual(["th18"]);
    expect(slugs({ verifiedOnly: true })).toEqual(["th18"]);
  });
});
