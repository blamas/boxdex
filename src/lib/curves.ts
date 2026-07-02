// Shapes and helpers for the /api/curves/<slug>.json payload shared by the curve
// endpoint and every island that plots it.

import { CURVE_KINDS, type CurveKind, type ParsedCurve } from "./csv";

// Kinds surfaced in the UI — excludes spl_stacked which is accessed via DriverCurves.stacked.
export const DISPLAY_KINDS = CURVE_KINDS.filter((k) => k !== "spl_stacked");

interface StackedEntry {
  curve: ParsedCurve;
  note?: string;
}

export interface DriverCurves {
  driverId: string;
  source: string;
  curves: Partial<Record<CurveKind, ParsedCurve>>;
  stacked: Partial<Record<number, StackedEntry>>; // spl_stacked curves by cabinet count
  notes: Partial<Record<CurveKind, string>>;
}

// Available SPL count options for a driver entry: [1] if a plain curve exists, then stacked counts.
export function availSplCounts(dc: DriverCurves): number[] {
  return [
    ...(dc.curves.spl ? [1] : []),
    ...Object.keys(dc.stacked)
      .map(Number)
      .sort((a, b) => a - b),
  ];
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
// spl_stacked is excluded here because it is handled separately via the stacked map.
export function initialCurveView(data: CurvesResponse): { tab: "sim" | "meas"; kind: CurveKind } {
  const tab = data.measurements.length > 0 ? "meas" : "sim";
  const group = tab === "meas" ? data.measurements : data.simulations;
  const kind = DISPLAY_KINDS.find((k) => group[0]?.curves[k]) ?? "spl";
  return { tab, kind };
}

export interface CurveEntry {
  // Stable selection key: "meas:<driverId>" or "sim:<driverId>"
  key: string;
  label: string;
  dc: DriverCurves;
  isMeas: boolean;
}

// All entries for a given kind, measurements first. spl_stacked is not surfaced here
// because StackBuilder never requests it — use DriverCurves.stacked directly for that kind.
export function curveEntries(payload: CurvesResponse, kind: CurveKind): CurveEntry[] {
  const result: CurveEntry[] = [];
  for (const dc of payload.measurements) {
    if (dc.curves[kind]) {
      result.push({ key: `meas:${dc.driverId}`, label: `meas · ${dc.driverId}`, dc, isMeas: true });
    }
  }
  for (const dc of payload.simulations) {
    if (dc.curves[kind]) {
      result.push({ key: `sim:${dc.driverId}`, label: `sim · ${dc.driverId}`, dc, isMeas: false });
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
