// Shapes and helpers for the /api/curves/<slug>.json payload shared by the curve
// endpoint and every island that plots it.

import { CURVE_KINDS, type CurveKind, type ParsedCurve } from "./csv";

export interface DriverCurves {
  driverId: string;
  source: string;
  curves: Partial<Record<CurveKind, ParsedCurve>>;
}

export interface CurvesResponse {
  slug: string;
  name: string;
  simulations: DriverCurves[];
  measurements: DriverCurves[];
}

export const CURVE_Y_LABELS: Record<CurveKind, string> = {
  spl: "SPL (dB)",
  phase: "Phase (°)",
  impedance: "Impedance (Ω)",
  group_delay: "Group delay (ms)",
  distortion: "Distortion (%)",
  power_compression: "Power compression (dB)",
};

// Default view once a box's curves load: prefer measurements over simulations, and
// the first kind (in CURVE_KINDS order) the group's first driver actually carries.
export function initialCurveView(data: CurvesResponse): { tab: "sim" | "meas"; kind: CurveKind } {
  const tab = data.measurements.length > 0 ? "meas" : "sim";
  const group = tab === "meas" ? data.measurements : data.simulations;
  const kind = CURVE_KINDS.find((k) => group[0]?.curves[k]) ?? "spl";
  return { tab, kind };
}

// The curve a box "shows" for a kind: measurements take priority over simulations,
// first driver carrying the kind wins within each group.
export function pickCurve(
  payload: CurvesResponse,
  kind: CurveKind
): { dc: DriverCurves; isMeas: boolean } | null {
  for (const dc of payload.measurements) {
    if (dc.curves[kind]) return { dc, isMeas: true };
  }
  for (const dc of payload.simulations) {
    if (dc.curves[kind]) return { dc, isMeas: false };
  }
  return null;
}
