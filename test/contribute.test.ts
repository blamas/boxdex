import { describe, expect, it } from "vitest";
import { buildFrontmatter, type ContributeState } from "../src/lib/contribute";
import { enclosureFrontmatterSchema } from "../src/lib/schemas";

// Mirrors the contribute island's initial state, with a complete set of required
// fields so the result passes the real schema unless a test breaks something.
function state(overrides: Partial<ContributeState> = {}): ContributeState {
  return {
    basics: {
      name: "FK BR 18",
      category: "sub",
      topology: "bass_reflex",
      topologyVariant: "",
      ways: null,
      revision: "",
      buildComplexity: "",
      driverCount: null,
    },
    driverIds: ["faital-18hp1060-8"],
    geom: {
      hMm: 730,
      wMm: 730,
      dMm: 650,
      netVolumeL: 280,
      grossVolumeL: null,
      weightKg: null,
      plywoodThicknessMm: null,
      sheetCount: null,
      sheetW: null,
      sheetH: null,
    },
    f3Hz: 38,
    specs: { fbHz: null, maxSplDb: null },
    sims: [],
    meas: [],
    srcs: [],
    images: [],
    plans: [],
    recommendedFor: [],
    connectors: [],
    lic: { license: "CC0-1.0", licenseNote: "", author: "", sourceUrl: "" },
    ...overrides,
  };
}

describe("buildFrontmatter", () => {
  it("produces an object that passes the real schema", () => {
    expect(enclosureFrontmatterSchema.safeParse(buildFrontmatter(state())).success).toBe(true);
  });

  it("omits empty strings, nulls, and empty arrays", () => {
    const fm = buildFrontmatter(state());
    expect(fm).not.toHaveProperty("topologyVariant");
    expect(fm).not.toHaveProperty("revision");
    expect(fm).not.toHaveProperty("licenseNote");
    expect(fm).not.toHaveProperty("simulations");
    expect(fm).not.toHaveProperty("images");
    expect(fm.specs).toEqual({ f3Hz: 38 });
  });

  it("omits driverCount when 1 or unset, keeps it otherwise", () => {
    expect(buildFrontmatter(state())).not.toHaveProperty("driverCount");
    const one = state();
    one.basics.driverCount = 1;
    expect(buildFrontmatter(one)).not.toHaveProperty("driverCount");
    const two = state();
    two.basics.driverCount = 2;
    expect(buildFrontmatter(two)).toHaveProperty("driverCount", 2);
  });

  it("emits sheetSizeMm only when both dimensions are set", () => {
    const half = state();
    half.geom.sheetW = 2500;
    expect(buildFrontmatter(half)).not.toHaveProperty("sheetSizeMm");
    half.geom.sheetH = 1250;
    expect(buildFrontmatter(half)).toEqual(
      expect.objectContaining({ sheetSizeMm: { wMm: 2500, hMm: 1250 } })
    );
  });

  it("drops a lingering count when kind is no longer spl_stacked", () => {
    const row = {
      driver: ["d"],
      kind: "spl",
      source: "hornresp_sim",
      note: "",
      count: 4,
      file: "s.csv",
    };
    const fm = buildFrontmatter(state({ sims: [row] }));
    expect((fm.simulations as Record<string, unknown>[])[0]).not.toHaveProperty("count");
    const stacked = buildFrontmatter(state({ sims: [{ ...row, kind: "spl_stacked" }] }));
    expect((stacked.simulations as Record<string, unknown>[])[0]).toHaveProperty("count", 4);
  });

  it("reports a missing curve file at its own path", () => {
    const row = {
      driver: ["d"],
      kind: "spl",
      source: "hornresp_sim",
      note: "",
      count: null,
      file: null,
    };
    const fm = buildFrontmatter(state({ sims: [row] }));
    const parsed = enclosureFrontmatterSchema.safeParse(fm);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path.join(".") === "simulations.0.file")).toBe(true);
    }
  });
});
