import { describe, expect, it } from "vitest";
import { CURVE_KINDS } from "../src/lib/csv";
import {
  availSplCounts,
  CURVE_Y_LABELS,
  type CurvesResponse,
  curveEntries,
  curveLabel,
  curvesForProfile,
  type DriverCurves,
  initialCurveView,
  resolveCurveEntry,
} from "../src/lib/curves";

const spl = { freq: [40, 80], value: [110, 120] };
const impedance = { freq: [40, 80], value: [8, 12] };

function dc(
  id: string,
  driverProfile: string,
  source: string,
  curves: DriverCurves["curves"]
): DriverCurves {
  return { id, driverProfile, source, curves, stacked: {}, notes: {} };
}

function payload(
  simulations: DriverCurves[] = [],
  measurements: DriverCurves[] = [],
  driverProfiles: CurvesResponse["driverProfiles"] = []
): CurvesResponse {
  return { slug: "box", name: "Box", simulations, measurements, driverProfiles };
}

describe("availSplCounts", () => {
  it("returns [1] when only a plain spl curve exists", () => {
    expect(availSplCounts(dc("d1", "default", "s", { spl }))).toEqual([1]);
  });

  it("returns stacked counts when no plain spl", () => {
    const d: DriverCurves = {
      id: "d1",
      driverProfile: "default",
      source: "s",
      curves: {},
      stacked: { 4: { curve: spl }, 6: { curve: spl } },
      notes: {},
    };
    expect(availSplCounts(d)).toEqual([4, 6]);
  });

  it("returns [1, ...stacked] when both exist", () => {
    const d: DriverCurves = {
      id: "d1",
      driverProfile: "default",
      source: "s",
      curves: { spl },
      stacked: { 4: { curve: spl } },
      notes: {},
    };
    expect(availSplCounts(d)).toEqual([1, 4]);
  });

  it("returns [] when neither exists", () => {
    expect(availSplCounts(dc("d1", "default", "s", {}))).toEqual([]);
  });
});

describe("CURVE_Y_LABELS", () => {
  it("labels every curve kind", () => {
    for (const kind of CURVE_KINDS) {
      expect(CURVE_Y_LABELS[kind]).toBeTruthy();
    }
  });
});

describe("curveEntries", () => {
  it("returns measurements before simulations", () => {
    const p = payload(
      [dc("d1", "default", "hornresp_sim", { spl })],
      [dc("d1", "default", "rew_measured", { spl })]
    );
    const entries = curveEntries(p, "spl");
    expect(entries).toHaveLength(2);
    expect(entries[0].isMeas).toBe(true);
    expect(entries[1].isMeas).toBe(false);
  });

  it("omits entries that lack the requested kind", () => {
    const p = payload([
      dc("d1", "default", "hornresp_sim", { impedance }),
      dc("d2", "default", "hornresp_sim", { spl }),
    ]);
    const entries = curveEntries(p, "spl");
    expect(entries).toHaveLength(1);
    expect(entries[0].dc.id).toBe("d2");
  });

  it("uses id in label", () => {
    const p = payload([dc("d1", "default", "hornresp_sim", { spl })]);
    const entries = curveEntries(p, "spl");
    expect(entries[0].label).toBe("sim · default · d1");
  });

  it("keys encode prefix, driverProfile and id", () => {
    const p = payload(
      [dc("d1", "default", "hornresp_sim", { spl })],
      [dc("d1", "default", "rew_measured", { spl })]
    );
    const entries = curveEntries(p, "spl");
    expect(entries.find((e) => e.isMeas)?.key).toBe("meas:default:d1");
    expect(entries.find((e) => !e.isMeas)?.key).toBe("sim:default:d1");
  });

  it("keeps keys unique across profiles sharing the same curve-set id", () => {
    const p = payload([
      dc("full-system", "default", "hornresp_sim", { spl }),
      dc("full-system", "alt", "hornresp_sim", { spl }),
    ]);
    const entries = curveEntries(p, "spl");
    const keys = entries.map((e) => e.key);
    expect(new Set(keys).size).toBe(2);
    expect(keys).toEqual(["sim:default:full-system", "sim:alt:full-system"]);
  });
});

describe("resolveCurveEntry", () => {
  it("selects by key when found", () => {
    const p = payload(
      [dc("d1", "default", "hornresp_sim", { spl })],
      [dc("d1", "default", "rew_measured", { spl })]
    );
    const entry = resolveCurveEntry(p, "spl", "sim:default:d1");
    expect(entry?.isMeas).toBe(false);
  });

  it("falls back to first (meas-priority) when key not found", () => {
    const p = payload(
      [dc("d1", "default", "hornresp_sim", { spl })],
      [dc("d1", "default", "rew_measured", { spl })]
    );
    const entry = resolveCurveEntry(p, "spl", "sim:default:unknown");
    expect(entry?.isMeas).toBe(true);
  });

  it("falls back to first when no selection given", () => {
    const p = payload(
      [dc("d1", "default", "hornresp_sim", { spl })],
      [dc("d1", "default", "rew_measured", { spl })]
    );
    expect(resolveCurveEntry(p, "spl", undefined)?.isMeas).toBe(true);
  });

  it("returns null when no entries carry the kind", () => {
    const p = payload([dc("d1", "default", "hornresp_sim", { spl })]);
    expect(resolveCurveEntry(p, "phase", undefined)).toBeNull();
  });

  it("picks the first entry carrying the kind when multiple ids differ", () => {
    const p = payload([
      dc("d1", "default", "hornresp_sim", { impedance }),
      dc("d2", "default", "akabak_sim", { spl }),
    ]);
    expect(resolveCurveEntry(p, "spl", undefined)?.dc.id).toBe("d2");
  });

  it("falls back to sim when no measurement carries the kind", () => {
    const p = payload(
      [dc("d1", "default", "hornresp_sim", { spl })],
      [dc("d1", "default", "rew_measured", { impedance })]
    );
    const entry = resolveCurveEntry(p, "spl", undefined);
    expect(entry?.isMeas).toBe(false);
    expect(entry?.dc.source).toBe("hornresp_sim");
  });
});

describe("initialCurveView", () => {
  it("opens on measurements when any exist", () => {
    const p = payload(
      [dc("d1", "default", "hornresp_sim", { spl })],
      [dc("d1", "default", "rew_measured", { spl })]
    );
    expect(initialCurveView(p)).toEqual({ tab: "meas", kind: "spl" });
  });

  it("opens on simulations otherwise", () => {
    const p = payload([dc("d1", "default", "hornresp_sim", { spl })]);
    expect(initialCurveView(p)).toEqual({ tab: "sim", kind: "spl" });
  });

  it("picks the first available kind in CURVE_KINDS order", () => {
    const p = payload([dc("d1", "default", "hornresp_sim", { impedance })]);
    expect(initialCurveView(p).kind).toBe("impedance");
  });

  it("defaults to spl when the group is empty", () => {
    expect(initialCurveView(payload()).kind).toBe("spl");
  });

  it("scopes the tab choice to the given profile on multi-profile boxes", () => {
    // Measurements only exist on "alt": profile "default" must open on its own simulations,
    // not on a meas tab the profile filter would empty out.
    const p = payload(
      [dc("full-system", "default", "hornresp_sim", { impedance })],
      [dc("full-system", "alt", "rew_measured", { spl })],
      [{ id: "default" }, { id: "alt" }]
    );
    expect(initialCurveView(p, "default")).toEqual({ tab: "sim", kind: "impedance" });
    expect(initialCurveView(p, "alt")).toEqual({ tab: "meas", kind: "spl" });
  });

  it("ignores the profile filter on single-profile boxes", () => {
    const p = payload([], [dc("m", "default", "rew_measured", { spl })], [{ id: "default" }]);
    expect(initialCurveView(p, "default")).toEqual({ tab: "meas", kind: "spl" });
  });
});

describe("curveLabel / curvesForProfile", () => {
  it("always prefixes the label with the profile id, even for a single profile", () => {
    expect(curveLabel(dc("x", "default", "s", {}))).toBe("default · x");
  });

  it("labels distinct curves within the same profile by their own id", () => {
    expect(curveLabel(dc("lf-only", "default", "s", {}))).toBe("default · lf-only");
    expect(curveLabel(dc("full-system", "default", "s", {}))).toBe("default · full-system");
  });

  it("filters DriverCurves down to one profile", () => {
    const dcs = [dc("x", "default", "s", {}), dc("p", "alt", "s", {})];
    expect(curvesForProfile(dcs, "default").map((d) => d.id)).toEqual(["x"]);
    expect(curvesForProfile(dcs, "alt").map((d) => d.id)).toEqual(["p"]);
  });
});
