import { describe, expect, it } from "vitest";
import { CURVE_KINDS } from "../src/lib/csv";
import {
  availSplCounts,
  CURVE_Y_LABELS,
  type CurvesResponse,
  curveEntries,
  type DriverCurves,
  initialCurveView,
  resolveCurveEntry,
} from "../src/lib/curves";

const spl = { freq: [40, 80], value: [110, 120] };
const impedance = { freq: [40, 80], value: [8, 12] };

function dc(driverId: string, source: string, curves: DriverCurves["curves"]): DriverCurves {
  return { driverId, source, curves, stacked: {}, notes: {} };
}

function payload(
  simulations: DriverCurves[] = [],
  measurements: DriverCurves[] = []
): CurvesResponse {
  return { slug: "box", name: "Box", simulations, measurements };
}

describe("availSplCounts", () => {
  it("returns [1] when only a plain spl curve exists", () => {
    expect(availSplCounts(dc("d1", "s", { spl }))).toEqual([1]);
  });

  it("returns stacked counts when no plain spl", () => {
    const d: DriverCurves = {
      driverId: "d1",
      source: "s",
      curves: {},
      stacked: { 4: { curve: spl }, 6: { curve: spl } },
      notes: {},
    };
    expect(availSplCounts(d)).toEqual([4, 6]);
  });

  it("returns [1, ...stacked] when both exist", () => {
    const d: DriverCurves = {
      driverId: "d1",
      source: "s",
      curves: { spl },
      stacked: { 4: { curve: spl } },
      notes: {},
    };
    expect(availSplCounts(d)).toEqual([1, 4]);
  });

  it("returns [] when neither exists", () => {
    expect(availSplCounts(dc("d1", "s", {}))).toEqual([]);
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
    const p = payload([dc("d1", "hornresp_sim", { spl })], [dc("d1", "rew_measured", { spl })]);
    const entries = curveEntries(p, "spl");
    expect(entries).toHaveLength(2);
    expect(entries[0].isMeas).toBe(true);
    expect(entries[1].isMeas).toBe(false);
  });

  it("omits entries that lack the requested kind", () => {
    const p = payload([dc("d1", "hornresp_sim", { impedance }), dc("d2", "hornresp_sim", { spl })]);
    const entries = curveEntries(p, "spl");
    expect(entries).toHaveLength(1);
    expect(entries[0].dc.driverId).toBe("d2");
  });

  it("uses driverId in label", () => {
    const p = payload([dc("d1", "hornresp_sim", { spl })]);
    const entries = curveEntries(p, "spl");
    expect(entries[0].label).toBe("sim · d1");
  });

  it("keys encode prefix and driverId", () => {
    const p = payload([dc("d1", "hornresp_sim", { spl })], [dc("d1", "rew_measured", { spl })]);
    const entries = curveEntries(p, "spl");
    expect(entries.find((e) => e.isMeas)?.key).toBe("meas:d1");
    expect(entries.find((e) => !e.isMeas)?.key).toBe("sim:d1");
  });
});

describe("resolveCurveEntry", () => {
  it("selects by key when found", () => {
    const p = payload([dc("d1", "hornresp_sim", { spl })], [dc("d1", "rew_measured", { spl })]);
    const entry = resolveCurveEntry(p, "spl", "sim:d1");
    expect(entry?.isMeas).toBe(false);
  });

  it("falls back to first (meas-priority) when key not found", () => {
    const p = payload([dc("d1", "hornresp_sim", { spl })], [dc("d1", "rew_measured", { spl })]);
    const entry = resolveCurveEntry(p, "spl", "sim:unknown");
    expect(entry?.isMeas).toBe(true);
  });

  it("falls back to first when no selection given", () => {
    const p = payload([dc("d1", "hornresp_sim", { spl })], [dc("d1", "rew_measured", { spl })]);
    expect(resolveCurveEntry(p, "spl", undefined)?.isMeas).toBe(true);
  });

  it("returns null when no entries carry the kind", () => {
    const p = payload([dc("d1", "hornresp_sim", { spl })]);
    expect(resolveCurveEntry(p, "phase", undefined)).toBeNull();
  });

  it("picks the first entry carrying the kind when multiple drivers differ", () => {
    const p = payload([dc("d1", "hornresp_sim", { impedance }), dc("d2", "akabak_sim", { spl })]);
    expect(resolveCurveEntry(p, "spl", undefined)?.dc.driverId).toBe("d2");
  });

  it("falls back to sim when no measurement carries the kind", () => {
    const p = payload(
      [dc("d1", "hornresp_sim", { spl })],
      [dc("d1", "rew_measured", { impedance })]
    );
    const entry = resolveCurveEntry(p, "spl", undefined);
    expect(entry?.isMeas).toBe(false);
    expect(entry?.dc.source).toBe("hornresp_sim");
  });
});

describe("initialCurveView", () => {
  it("opens on measurements when any exist", () => {
    const p = payload([dc("d1", "hornresp_sim", { spl })], [dc("d1", "rew_measured", { spl })]);
    expect(initialCurveView(p)).toEqual({ tab: "meas", kind: "spl" });
  });

  it("opens on simulations otherwise", () => {
    const p = payload([dc("d1", "hornresp_sim", { spl })]);
    expect(initialCurveView(p)).toEqual({ tab: "sim", kind: "spl" });
  });

  it("picks the first available kind in CURVE_KINDS order", () => {
    const p = payload([dc("d1", "hornresp_sim", { impedance })]);
    expect(initialCurveView(p).kind).toBe("impedance");
  });

  it("defaults to spl when the group is empty", () => {
    expect(initialCurveView(payload()).kind).toBe("spl");
  });
});
