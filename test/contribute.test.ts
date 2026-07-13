import { describe, expect, it } from "vitest";
import { buildFrontmatter, type ContributeState, type CurveSetState } from "../src/lib/contribute";
import { enclosureFrontmatterSchema } from "../src/lib/schemas";

// Complete set of required fields so the result passes the real schema unless a test breaks it.
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
    },
    driverProfiles: [
      {
        id: "default",
        drivers: [{ id: "faital-18hp1060-8", qty: 1, horn: null }],
        simulations: [],
        measurements: [],
      },
    ],
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
    srcs: [],
    images: [],
    plans: [],
    recommendedFor: [],
    connectors: [],
    lic: { license: "CC0-1.0", licenseNote: "", author: "", sourceUrl: "" },
    availability: "",
    contact: [],
    ...overrides,
  };
}

function emptyCurveSet(overrides: Partial<CurveSetState> = {}): CurveSetState {
  return { id: "cs", source: "hornresp_sim", curves: {}, stacked: [], ...overrides };
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
    expect(fm).not.toHaveProperty("images");
    expect(fm).not.toHaveProperty("availability");
    expect(fm).not.toHaveProperty("contact");
    expect((fm.driverProfiles as Record<string, unknown>[])[0]).not.toHaveProperty("simulations");
    expect((fm.driverProfiles as Record<string, unknown>[])[0]).not.toHaveProperty("measurements");
    expect(fm.specs).toEqual({ f3Hz: 38 });
  });

  it("emits availability and drops contact rows with an empty value", () => {
    const fm = buildFrontmatter(
      state({
        availability: "paid",
        contact: [
          { channel: "profile", value: "instagram.com/boxbuilder", note: "" },
          { channel: "email", value: "  ", note: "" },
        ],
      })
    );
    expect(fm).toHaveProperty("availability", "paid");
    expect(fm.contact).toEqual([{ channel: "profile", value: "instagram.com/boxbuilder" }]);
  });

  it("always includes an explicit id and qty per driver profile entry, never omitted", () => {
    const fm = buildFrontmatter(state());
    expect(fm.driverProfiles).toEqual([
      { id: "default", drivers: [{ driver: "faital-18hp1060-8", qty: 1 }] },
    ]);
    const twoQty = state({
      driverProfiles: [
        {
          id: "default",
          drivers: [{ id: "faital-18hp1060-8", qty: 2, horn: null }],
          simulations: [],
          measurements: [],
        },
      ],
    });
    expect(buildFrontmatter(twoQty).driverProfiles).toEqual([
      { id: "default", drivers: [{ driver: "faital-18hp1060-8", qty: 2 }] },
    ]);
  });

  it("includes horn only when set on a driver entry", () => {
    const withHorn = state({
      driverProfiles: [
        {
          id: "default",
          drivers: [{ id: "bc-de360-8", qty: 1, horn: "bc-jbe250" }],
          simulations: [],
          measurements: [],
        },
      ],
    });
    expect(buildFrontmatter(withHorn).driverProfiles).toEqual([
      { id: "default", drivers: [{ driver: "bc-de360-8", qty: 1, horn: "bc-jbe250" }] },
    ]);
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

  it("nests a curve set's kinds and stacked entries under the owning profile", () => {
    const fm = buildFrontmatter(
      state({
        driverProfiles: [
          {
            id: "default",
            drivers: [{ id: "faital-18hp1060-8", qty: 1, horn: null }],
            simulations: [
              emptyCurveSet({
                id: "full-system",
                curves: { spl: { file: "s1.csv", note: "" } },
                stacked: [{ count: 4, file: "s4.csv", note: "loud" }],
              }),
            ],
            measurements: [],
          },
        ],
      })
    );
    const profile = (fm.driverProfiles as Record<string, unknown>[])[0];
    expect(profile.simulations).toEqual([
      {
        id: "full-system",
        source: "hornresp_sim",
        curves: { spl: { file: "s1.csv" } },
        stacked: [{ count: 4, file: "s4.csv", note: "loud" }],
      },
    ]);
  });

  it("reports a missing curve file at its own nested path", () => {
    const fm = buildFrontmatter(
      state({
        driverProfiles: [
          {
            id: "default",
            drivers: [{ id: "faital-18hp1060-8", qty: 1, horn: null }],
            simulations: [emptyCurveSet({ id: "row", curves: { spl: { file: null, note: "" } } })],
            measurements: [],
          },
        ],
      })
    );
    const parsed = enclosureFrontmatterSchema.safeParse(fm);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(
        parsed.error.issues.some(
          (i) => i.path.join(".") === "driverProfiles.0.simulations.0.curves.spl.file"
        )
      ).toBe(true);
    }
  });

  it("allows a stacked entry alongside its plain spl sibling in the same curve set", () => {
    const fm = buildFrontmatter(
      state({
        driverProfiles: [
          {
            id: "default",
            drivers: [{ id: "faital-18hp1060-8", qty: 1, horn: null }],
            simulations: [
              emptyCurveSet({
                id: "spl",
                curves: { spl: { file: "s1.csv", note: "" } },
                stacked: [
                  { count: 4, file: "s4.csv", note: "" },
                  { count: 6, file: "s6.csv", note: "" },
                ],
              }),
            ],
            measurements: [],
          },
        ],
      })
    );
    expect(enclosureFrontmatterSchema.safeParse(fm).success).toBe(true);
  });

  it("rejects two curve sets sharing an id in the same profile", () => {
    const fm = buildFrontmatter(
      state({
        driverProfiles: [
          {
            id: "default",
            drivers: [{ id: "faital-18hp1060-8", qty: 1, horn: null }],
            simulations: [
              emptyCurveSet({ id: "spl", curves: { spl: { file: "a.csv", note: "" } } }),
              emptyCurveSet({ id: "spl", curves: { phase: { file: "b.csv", note: "" } } }),
            ],
            measurements: [],
          },
        ],
      })
    );
    const parsed = enclosureFrontmatterSchema.safeParse(fm);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(
        parsed.error.issues.some(
          (i) =>
            i.path.join(".") === "driverProfiles.0.simulations.1.id" &&
            (i as { params?: { key?: string } }).params?.key === "duplicateCurveId"
        )
      ).toBe(true);
    }
  });

  it("allows the same curve set id to be reused across different profiles", () => {
    const fm = buildFrontmatter(
      state({
        driverProfiles: [
          {
            id: "default",
            drivers: [{ id: "faital-18hp1060-8", qty: 1, horn: null }],
            simulations: [
              emptyCurveSet({ id: "full-system", curves: { spl: { file: "a.csv", note: "" } } }),
            ],
            measurements: [],
          },
          {
            id: "alt",
            drivers: [{ id: "faital-18hp1060-8", qty: 2, horn: null }],
            simulations: [
              emptyCurveSet({ id: "full-system", curves: { spl: { file: "b.csv", note: "" } } }),
            ],
            measurements: [],
          },
        ],
      })
    );
    expect(enclosureFrontmatterSchema.safeParse(fm).success).toBe(true);
  });

  it("rejects a stacked entry with no plain spl sibling in the same curve set", () => {
    const fm = buildFrontmatter(
      state({
        driverProfiles: [
          {
            id: "default",
            drivers: [{ id: "faital-18hp1060-8", qty: 1, horn: null }],
            simulations: [
              emptyCurveSet({
                id: "spl",
                stacked: [{ count: 4, file: "s4.csv", note: "" }],
              }),
            ],
            measurements: [],
          },
        ],
      })
    );
    const parsed = enclosureFrontmatterSchema.safeParse(fm);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(
        parsed.error.issues.some(
          (i) =>
            i.path.join(".") === "driverProfiles.0.simulations.0.stacked" &&
            (i as { params?: { key?: string } }).params?.key === "stackedMissingBase"
        )
      ).toBe(true);
    }
  });

  it("rejects a curve set with no kinds and no stacked entries", () => {
    const fm = buildFrontmatter(
      state({
        driverProfiles: [
          {
            id: "default",
            drivers: [{ id: "faital-18hp1060-8", qty: 1, horn: null }],
            simulations: [emptyCurveSet({ id: "empty" })],
            measurements: [],
          },
        ],
      })
    );
    const parsed = enclosureFrontmatterSchema.safeParse(fm);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(
        parsed.error.issues.some(
          (i) =>
            i.path.join(".") === "driverProfiles.0.simulations.0.curves" &&
            (i as { params?: { key?: string } }).params?.key === "curveSetEmpty"
        )
      ).toBe(true);
    }
  });
});
