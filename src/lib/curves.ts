// Shapes and helpers for the /api/curves/<slug>.json payload shared by the curve
// endpoint and every island that plots it.

import { CURVE_KINDS, type CurveKind, type ParsedCurve } from "./csv";

export interface DriverCurves {
  driverId: string;
  count: number;
  note?: string;
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
  spl_stacked: "SPL stacked (dB)",
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

export interface CurveEntry {
  // Stable selection key encoding driverId, count, source, and optional note.
  key: string;
  label: string;
  dc: DriverCurves;
  isMeas: boolean;
}

function entryKey(prefix: "meas" | "sim", dc: DriverCurves): string {
  return `${prefix}:${dc.driverId}:c${dc.count}:${dc.source}${dc.note ? `:${dc.note}` : ""}`;
}

function entryLabel(prefix: "meas" | "sim", dc: DriverCurves): string {
  const countSuffix = dc.count > 1 ? ` · ${dc.count}×` : "";
  const noteSuffix = dc.note ? ` · ${dc.note}` : "";
  return `${prefix} · ${dc.driverId}${countSuffix}${noteSuffix}`;
}

// All entries for a given kind, measurements first.
export function curveEntries(payload: CurvesResponse, kind: CurveKind): CurveEntry[] {
  const result: CurveEntry[] = [];
  for (const dc of payload.measurements) {
    if (dc.curves[kind]) {
      result.push({ key: entryKey("meas", dc), label: entryLabel("meas", dc), dc, isMeas: true });
    }
  }
  for (const dc of payload.simulations) {
    if (dc.curves[kind]) {
      result.push({ key: entryKey("sim", dc), label: entryLabel("sim", dc), dc, isMeas: false });
    }
  }
  return result;
}

// Resolve which entry to use: prefer the selected key, fall back to first (meas-priority).
export function resolveCurveEntry(
  payload: CurvesResponse,
  kind: CurveKind,
  selected: string | undefined
): CurveEntry | null {
  const entries = curveEntries(payload, kind);
  if (entries.length === 0) return null;
  if (selected) {
    const found = entries.find((e) => e.key === selected);
    if (found) return found;
  }
  return entries[0];
}
