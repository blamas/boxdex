// Shapes and helpers for the /api/curves/<slug>.json payload shared by the curve
// endpoint and every island that plots it.

import { CURVE_KINDS, type CurveKind, type ParsedCurve } from "./csv";

// Kinds surfaced in the UI: excludes spl_stacked which is accessed via DriverCurves.stacked.
const DISPLAY_KINDS = CURVE_KINDS.filter((k) => k !== "spl_stacked");

interface StackedEntry {
  curve: ParsedCurve;
  note?: string;
}

export interface DriverCurves {
  id: string;
  driverProfile: string;
  source: string;
  curves: Partial<Record<CurveKind, ParsedCurve>>;
  stacked: Partial<Record<number, StackedEntry>>; // spl_stacked curves by cabinet count
  notes: Partial<Record<CurveKind, string>>;
}

// Curve kinds a single entry actually carries, in DISPLAY_KINDS order. SPL counts a
// stacked-only entry (no plain 1x curve) as having an SPL tab, since the count row
// still renders. Extracted from BoxCurves so the merged-curve-set tab behaviour can
// be unit-tested against an inline fixture, with no dependency on data/ existing.
export function availableKinds(dc: DriverCurves): CurveKind[] {
  return DISPLAY_KINDS.filter((k) => {
    if (k === "spl") return !!(dc.curves.spl || Object.keys(dc.stacked).length > 0);
    return !!dc.curves[k];
  });
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
  driverProfiles: { id: string }[];
}

// Human label for a curve entry: always profile-prefixed (even when there's only one profile,
// it just reads "default · ...") plus its own authored id, since one profile can still own
// several curve entries (an isolated section's curve vs. a combined full-system curve).
export function curveLabel(dc: DriverCurves): string {
  return `${dc.driverProfile} · ${dc.id}`;
}

// Keep only the DriverCurves entries belonging to a given profile, for a profile switcher over
// a sim/meas group.
export function curvesForProfile(dcs: DriverCurves[], profileId: string): DriverCurves[] {
  return dcs.filter((dc) => dc.driverProfile === profileId);
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

// First kind (in CURVE_KINDS order) the group's first entry actually carries.
// spl_stacked is excluded because it is handled separately via the stacked map.
export function firstAvailableKind(group: DriverCurves[]): CurveKind {
  return DISPLAY_KINDS.find((k) => group[0]?.curves[k]) ?? "spl";
}

// Default view once a box's curves load: prefer measurements over simulations, and the first
// kind the group's first entry carries. When a profileId is given (multi-profile boxes), the
// choice is scoped to that profile's own curves, so the initial tab/kind can't point at a
// group the profile switcher will filter down to empty.
export function initialCurveView(
  data: CurvesResponse,
  profileId?: string
): { tab: "sim" | "meas"; kind: CurveKind } {
  const scope = (dcs: DriverCurves[]) =>
    profileId !== undefined && data.driverProfiles.length > 1
      ? curvesForProfile(dcs, profileId)
      : dcs;
  const meas = scope(data.measurements);
  const tab = meas.length > 0 ? "meas" : "sim";
  const kind = firstAvailableKind(tab === "meas" ? meas : scope(data.simulations));
  return { tab, kind };
}

export interface CurveEntry {
  // Stable selection key: "meas:<driverProfile>:<id>" or "sim:<driverProfile>:<id>". The
  // profile segment matters because a curve-set id is only unique within its own profile: two
  // different profiles can legitimately both name a curve-set "full-system".
  key: string;
  label: string;
  dc: DriverCurves;
  isMeas: boolean;
}

// All entries for a given kind, measurements first. spl_stacked is not surfaced here
// because StackBuilder never requests it: use DriverCurves.stacked directly for that kind.
export function curveEntries(payload: CurvesResponse, kind: CurveKind): CurveEntry[] {
  const result: CurveEntry[] = [];
  for (const dc of payload.measurements) {
    if (dc.curves[kind]) {
      result.push({
        key: `meas:${dc.driverProfile}:${dc.id}`,
        label: `meas · ${curveLabel(dc)}`,
        dc,
        isMeas: true,
      });
    }
  }
  for (const dc of payload.simulations) {
    if (dc.curves[kind]) {
      result.push({
        key: `sim:${dc.driverProfile}:${dc.id}`,
        label: `sim · ${curveLabel(dc)}`,
        dc,
        isMeas: false,
      });
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
