import { describe, expect, it } from "vitest";
import { CURVE_KINDS } from "../src/lib/csv";
import {
  CURVE_Y_LABELS,
  type CurvesResponse,
  type DriverCurves,
  initialCurveView,
  pickCurve,
} from "../src/lib/curves";

const spl = { freq: [40, 80], value: [110, 120] };
const impedance = { freq: [40, 80], value: [8, 12] };

function dc(driverId: string, source: string, curves: DriverCurves["curves"]): DriverCurves {
  return { driverId, source, curves };
}

function payload(
  simulations: DriverCurves[] = [],
  measurements: DriverCurves[] = []
): CurvesResponse {
  return { slug: "box", name: "Box", simulations, measurements };
}

describe("CURVE_Y_LABELS", () => {
  it("labels every curve kind", () => {
    for (const kind of CURVE_KINDS) {
      expect(CURVE_Y_LABELS[kind]).toBeTruthy();
    }
  });
});

describe("pickCurve", () => {
  it("prefers a measurement over a simulation of the same kind", () => {
    const p = payload([dc("d1", "hornresp_sim", { spl })], [dc("d1", "rew_measured", { spl })]);
    const picked = pickCurve(p, "spl");
    expect(picked?.isMeas).toBe(true);
    expect(picked?.dc.source).toBe("rew_measured");
  });

  it("falls back to a simulation when no measurement carries the kind", () => {
    const p = payload(
      [dc("d1", "hornresp_sim", { spl })],
      [dc("d1", "rew_measured", { impedance })]
    );
    const picked = pickCurve(p, "spl");
    expect(picked?.isMeas).toBe(false);
    expect(picked?.dc.source).toBe("hornresp_sim");
  });

  it("takes the first driver carrying the kind within a group", () => {
    const p = payload([dc("d1", "hornresp_sim", { impedance }), dc("d2", "akabak_sim", { spl })]);
    expect(pickCurve(p, "spl")?.dc.driverId).toBe("d2");
  });

  it("returns null when no group carries the kind", () => {
    const p = payload([dc("d1", "hornresp_sim", { spl })]);
    expect(pickCurve(p, "phase")).toBeNull();
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
