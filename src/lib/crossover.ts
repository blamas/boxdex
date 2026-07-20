// Crossover suggestions for each box in a stack, and ideal LR4 filter application to
// predicted response curves. Suggestions are starting points for a real alignment, not
// DSP presets.
//
// Each box gets its own independent highpass ("low" corner) and lowpass ("high" corner),
// not a single point shared/coupled with its neighbor: stored and overridable per box per
// side, so editing one box's corner never moves another box's.
//
// Suggestions are derived from the boxes' own loaded SPL curves, not from stated specs
// (f3Hz, recommendedCrossoverHz): the suggested point is where two adjacent bands' curves
// actually cross (equal SPL), the standard acoustically-grounded natural handoff. Boxes
// share a band by category (two sub models run in parallel over the same band, never
// crossed over between each other, mirroring how coverage combines same-category slots):
// a category's curve is the power-sum composite of its members', and crossings are found
// between adjacent categories' composites, in band order (sub → kick → mid → top).

import { CATEGORIES, type Category } from "./category";
import { compositeResponse, interpDb, LOG_GRID, type ResponseBand } from "./stack";

// A box's own SPL curve, identified by its enclosure slug. category decides which band
// (composite curve) it belongs to, everything else about the crossing comes from curve data.
export interface XoCurve {
  id: string; // enclosure slug
  name: string;
  category: Category;
  points: [number, number][]; // this box's own SPL curve, ascending frequency
  // Compression-driver protection floor (crossing lower risks the diaphragm). This
  // box's own figure, never blended with any other box's.
  minCrossoverHz?: number;
}

// How far past a curve's own last/first data point the crossing search may reach, using
// that edge's own trend (see extrapolatedDb). A driver is often only characterized within
// its own designed operating band, so a real handoff can sit just past where one curve's
// data happens to stop, this is a bounded look beyond it, not a license to invent data.
export const EXTRAPOLATION_OCTAVES = 1;

// interpDb, extended up to EXTRAPOLATION_OCTAVES past either edge using that edge's own
// last segment's slope (linear in log10(f), the same convention interpDb itself uses).
// Still returns null further out, or for a degenerate (<2 point) curve.
export function extrapolatedDb(points: [number, number][], f: number): number | null {
  const real = interpDb(points, f);
  if (real !== null || points.length < 2) return real;
  const reach = 2 ** EXTRAPOLATION_OCTAVES;
  const [f0, d0] = points[0];
  const [f1, d1] = points[points.length - 1];
  if (f > f1 && f <= f1 * reach) {
    const [pf, pd] = points[points.length - 2];
    const slope = (d1 - pd) / (Math.log10(f1) - Math.log10(pf));
    return d1 + slope * (Math.log10(f) - Math.log10(f1));
  }
  if (f < f0 && f >= f0 / reach) {
    const [pf, pd] = points[1];
    const slope = (pd - d0) / (Math.log10(pf) - Math.log10(f0));
    return d0 + slope * (Math.log10(f) - Math.log10(f0));
  }
  return null;
}

function isExtrapolatedAt(
  lowPoints: [number, number][],
  highPoints: [number, number][],
  f: number
): boolean {
  return interpDb(lowPoints, f) === null || interpDb(highPoints, f) === null;
}

// Beyond this residual dB difference, the closest-approach fallback stops being a useful
// starting point (two curves 50 dB apart don't have a meaningful handoff anywhere), so
// the pair reports a gap instead of an essentially arbitrary frequency.
export const MAX_APPROX_DIFF_DB = 20;

export interface XoCrossing {
  fcHz: number;
  // true when this point needed extrapolating past one curve's own real data to find,
  // not just interpolating within it: a wider margin for error, surfaced in the UI.
  extrapolated: boolean;
  // true when no exact crossing existed anywhere in reach: fcHz is the closest approach
  // between the two curves instead (smallest |diff|), not an actual equal-SPL point. Still
  // a real, data-grounded starting point, just a weaker guarantee than an exact crossing,
  // provided so there's always something to look at and adjust rather than a blank field.
  approximated: boolean;
}

type SampleFn = (points: [number, number][], f: number) => number | null;

// Scans [lo, hi] on the shared LOG_GRID for the first frequency (low→high) where the two
// curves' sampled dB values are equal, sampling each side with its own function (real-only
// or extrapolation-allowed, see findCrossingHz). A messier pair that crosses more than once
// still only reports the first crossing: the simplest defensible rule, and any curve
// rippled enough to cross twice has no single "objectively correct" answer anyway.
//
// When allowApproximate is set and no exact crossing turns up, falls back to the closest
// approach seen during the same scan instead of returning undefined, provided the curves
// ever come within MAX_APPROX_DIFF_DB of each other.
function scanForCrossing(
  lowPoints: [number, number][],
  highPoints: [number, number][],
  lo: number,
  hi: number,
  sampleLow: SampleFn,
  sampleHigh: SampleFn,
  allowApproximate: boolean
): XoCrossing | undefined {
  let prevF: number | undefined;
  let prevDiff: number | undefined;
  let bestF: number | undefined;
  let bestAbsDiff = Number.POSITIVE_INFINITY;
  for (const f of LOG_GRID) {
    if (f < lo || f > hi) continue;
    const a = sampleLow(lowPoints, f);
    const b = sampleHigh(highPoints, f);
    if (a === null || b === null) continue;
    const diff = a - b;
    if (allowApproximate && Math.abs(diff) < bestAbsDiff) {
      bestAbsDiff = Math.abs(diff);
      bestF = f;
    }
    if (diff === 0) {
      return {
        fcHz: Math.round(f),
        // Flag checked at the true frequency, not the rounded one: rounding could hop
        // across a curve's own data edge right at the boundary.
        extrapolated: isExtrapolatedAt(lowPoints, highPoints, f),
        approximated: false,
      };
    }
    if (prevDiff !== undefined && prevF !== undefined && Math.sign(diff) !== Math.sign(prevDiff)) {
      // Linear interpolation of the diff between the bracketing grid points, in
      // log-frequency space (matches interpDb's own log-linear convention).
      const t = prevDiff / (prevDiff - diff);
      const fc = 10 ** (Math.log10(prevF) + t * (Math.log10(f) - Math.log10(prevF)));
      return {
        fcHz: Math.round(fc),
        extrapolated: isExtrapolatedAt(lowPoints, highPoints, fc),
        approximated: false,
      };
    }
    prevF = f;
    prevDiff = diff;
  }
  if (allowApproximate && bestF !== undefined && bestAbsDiff <= MAX_APPROX_DIFF_DB) {
    return {
      fcHz: Math.round(bestF),
      extrapolated: isExtrapolatedAt(lowPoints, highPoints, bestF),
      approximated: true,
    };
  }
  return undefined;
}

// First frequency where the two curves' own SPL values are equal, or the closest approach.
//
// When the curves share real data, the search extends only the LOW curve past its own edge
// (the "does the box above eventually overtake it" question), matched against the high
// curve's real data. Deliberately asymmetric: extrapolating the high curve backward here
// pits the low curve's unrelated far-low behavior (subsonic rolloff) against a guess, which
// found misleading crossings in testing rather than a real handoff. When the curves share no
// real data, that bias is gone, so both get a bounded symmetric reach to bridge the gap.
//
// undefined only when they're too far apart to reach at all (frequency, or MAX_APPROX_DIFF_DB
// in level), never invented past that.
export function findCrossingHz(
  lowPoints: [number, number][],
  highPoints: [number, number][]
): XoCrossing | undefined {
  if (lowPoints.length === 0 || highPoints.length === 0) return undefined;
  const reach = 2 ** EXTRAPOLATION_OCTAVES;
  const realLo = Math.max(lowPoints[0][0], highPoints[0][0]);
  const realHi = Math.min(lowPoints[lowPoints.length - 1][0], highPoints[highPoints.length - 1][0]);

  if (realLo < realHi) {
    return scanForCrossing(
      lowPoints,
      highPoints,
      realLo,
      realHi * reach,
      extrapolatedDb,
      interpDb,
      true
    );
  }

  const lo = realLo / reach;
  const hi = realHi * reach;
  if (lo >= hi) return undefined;
  return scanForCrossing(lowPoints, highPoints, lo, hi, extrapolatedDb, extrapolatedDb, true);
}

export interface XoSuggestion {
  id: string;
  name: string;
  lowHz: number | undefined; // suggested highpass corner (undefined = no lower neighbor)
  highHz: number | undefined; // suggested lowpass corner (undefined = no upper neighbor)
  // true when a lower/upper neighbor exists but even the closest-approach fallback (see
  // findCrossingHz) couldn't be computed, i.e. the two curves are too far apart to reach
  // at all, as opposed to simply having no neighbor on that side (edge of the stack). Rare
  // in practice now that a close-but-not-crossing pair still gets an approximated corner.
  lowGap: boolean;
  highGap: boolean;
  // true when the corner needed extrapolating past a curve's own real data (see
  // findCrossingHz), a wider margin for error worth flagging separately from a gap.
  lowExtrapolated: boolean;
  highExtrapolated: boolean;
  // true when this isn't an actual equal-SPL crossing, just the closest the two curves
  // get within reach (see findCrossingHz): weaker than extrapolated, worth a stronger
  // "verify this" flag since the curves may never actually meet.
  lowApproximated: boolean;
  highApproximated: boolean;
  // lowHz was raised to this box's own CD protection floor.
  clampedToCdMin: boolean;
  // highHz was raised to follow a CD floor applied in the band above: keeps the handoff
  // aligned (both sides of the pair sit at the floor) instead of leaving a hole where
  // neither box plays full-range between the raw crossing and the floor.
  highClampedToCdMin: boolean;
  cdMinHz: number | undefined;
  // This curve's own data bounds, kept only so a custom override can be sanity-checked.
  floorHz: number;
  ceilingHz: number;
}

// One suggestion per box. Boxes group into bands by category, in band order (CATEGORIES):
// a band's curve is the power-sum composite of its members' (each box's own curve when
// alone), lowHz comes from crossing with the band below's composite, highHz from crossing
// with the band above's. Every box in a band shares the same raw corners. A found lowHz
// is clamped up to this box's own CD protection floor when stated (a hard safety limit,
// not a preference), and the band below's highHz follows the highest floor that actually
// applied, so the pair's handoff stays aligned. Curves with fewer than 2 points can't
// place a crossing and are dropped.
export function suggestCrossovers(curves: XoCurve[]): XoSuggestion[] {
  const usable = curves.filter((c) => c.points.length >= 2);
  const bands = CATEGORIES.flatMap((category) => {
    const members = usable.filter((c) => c.category === category);
    if (members.length === 0) return [];
    const points =
      members.length === 1
        ? members[0].points
        : compositeResponse(members.map((m) => ({ category, qty: 1, points: m.points })));
    return [{ members, points }];
  });

  // crossings[i] sits between bands i-1 and i. handoffHz[i] is that pair's aligned
  // frequency: the raw crossing raised to the highest CD floor actually applied among
  // band i's members, so a clamped highpass drags the matching lowpass up with it.
  const crossings = bands.map((band, i) =>
    i > 0 ? findCrossingHz(bands[i - 1].points, band.points) : undefined
  );
  const handoffHz = crossings.map((crossing, i) => {
    if (!crossing) return undefined;
    const applied = bands[i].members
      .map((m) => m.minCrossoverHz)
      .filter((v): v is number => v !== undefined && crossing.fcHz < v);
    return applied.length > 0 ? Math.round(Math.max(...applied)) : crossing.fcHz;
  });

  return bands.flatMap((band, i) => {
    const lowCrossing = crossings[i];
    const highCrossing = crossings[i + 1];
    const hasBelow = i > 0;
    const hasAbove = i < bands.length - 1;

    return band.members.map((curve) => {
      const cdMinHz = curve.minCrossoverHz;

      let lowHz: number | undefined;
      let lowGap = false;
      let clampedToCdMin = false;
      if (hasBelow) {
        if (lowCrossing === undefined) {
          lowGap = true;
        } else if (cdMinHz !== undefined && lowCrossing.fcHz < cdMinHz) {
          lowHz = Math.round(cdMinHz);
          clampedToCdMin = true;
        } else {
          lowHz = lowCrossing.fcHz;
        }
      }

      let highHz: number | undefined;
      let highGap = false;
      let highClampedToCdMin = false;
      if (hasAbove) {
        if (highCrossing === undefined) {
          highGap = true;
        } else {
          highHz = handoffHz[i + 1];
          highClampedToCdMin = highHz !== highCrossing.fcHz;
        }
      }

      return {
        id: curve.id,
        name: curve.name,
        lowHz,
        highHz,
        lowGap,
        highGap,
        lowExtrapolated: lowCrossing?.extrapolated ?? false,
        highExtrapolated: highCrossing?.extrapolated ?? false,
        lowApproximated: lowCrossing?.approximated ?? false,
        highApproximated: highCrossing?.approximated ?? false,
        clampedToCdMin,
        highClampedToCdMin,
        cdMinHz,
        floorHz: curve.points[0][0],
        ceilingHz: curve.points[curve.points.length - 1][0],
      };
    });
  });
}

export type XoSide = "lo" | "hi";

// Override map key: one box's corner is identified by its id plus which side, since the
// two corners are independent (no more single per-pair key). Shared with resolveCrossovers
// and the UI so both sides of an override always agree on the same encoding.
export function xoOverrideKey(id: string, side: XoSide): string {
  return `${id}:${side}`;
}

// A box's effective crossover corners once user overrides are merged in. Each side
// (low/high) is independently custom or not, out-of-range custom points warn but are
// never blocked or clamped: experts override knowingly, beginners get told why it's a
// bad idea.
export interface XoPoint {
  id: string;
  name: string;
  lowHz: number | undefined;
  highHz: number | undefined;
  lowCustom: boolean;
  highCustom: boolean;
  lowGap: boolean;
  highGap: boolean;
  lowExtrapolated: boolean;
  highExtrapolated: boolean;
  lowApproximated: boolean;
  highApproximated: boolean;
  clampedToCdMin: boolean;
  highClampedToCdMin: boolean;
  lowWarnings: XoWarning[];
  highWarnings: XoWarning[];
}

// Machine-keyed so the UI can localize it. Same shape as FieldError in contribute.ts:
// the key selects the sentence, params fill its placeholders.
export interface XoWarning {
  key: "belowCdFloor" | "belowOwnData" | "aboveOwnData";
  params: Record<string, number>;
}

export function resolveCrossovers(
  suggestions: XoSuggestion[],
  overrides: Partial<Record<string, number>>
): XoPoint[] {
  return suggestions.map((s) => {
    const lowOverride = overrides[xoOverrideKey(s.id, "lo")];
    const lowCustom = lowOverride !== undefined && lowOverride > 0;
    const lowWarnings: XoWarning[] = [];
    if (lowCustom) {
      if (s.cdMinHz !== undefined && lowOverride < s.cdMinHz) {
        lowWarnings.push({ key: "belowCdFloor", params: { hz: s.cdMinHz } });
      }
      if (lowOverride < s.floorHz) {
        lowWarnings.push({ key: "belowOwnData", params: { hz: Math.round(s.floorHz) } });
      }
      if (lowOverride > s.ceilingHz) {
        lowWarnings.push({ key: "aboveOwnData", params: { hz: Math.round(s.ceilingHz) } });
      }
    }

    const highOverride = overrides[xoOverrideKey(s.id, "hi")];
    const highCustom = highOverride !== undefined && highOverride > 0;
    const highWarnings: XoWarning[] = [];
    if (highCustom) {
      if (highOverride < s.floorHz) {
        highWarnings.push({ key: "belowOwnData", params: { hz: Math.round(s.floorHz) } });
      }
      if (highOverride > s.ceilingHz) {
        highWarnings.push({ key: "aboveOwnData", params: { hz: Math.round(s.ceilingHz) } });
      }
    }

    return {
      id: s.id,
      name: s.name,
      lowHz: lowCustom ? Math.round(lowOverride) : s.lowHz,
      highHz: highCustom ? Math.round(highOverride) : s.highHz,
      lowCustom,
      highCustom,
      lowGap: !lowCustom && s.lowGap,
      highGap: !highCustom && s.highGap,
      lowExtrapolated: !lowCustom && s.lowExtrapolated,
      highExtrapolated: !highCustom && s.highExtrapolated,
      lowApproximated: !lowCustom && s.lowApproximated,
      highApproximated: !highCustom && s.highApproximated,
      clampedToCdMin: !lowCustom && s.clampedToCdMin,
      highClampedToCdMin: !highCustom && s.highClampedToCdMin,
      lowWarnings,
      highWarnings,
    };
  });
}

// Linkwitz-Riley 4th-order magnitude in dB (two cascaded 2nd-order Butterworths):
// −6 dB at fc, 24 dB/oct. Closed form, evaluated at each curve's own points, no
// resampling (see csv.ts header).
export function lr4Db(f: number, fcHz: number, type: "lowpass" | "highpass"): number {
  const r = type === "lowpass" ? f / fcHz : fcHz / f;
  return -20 * Math.log10(1 + r ** 4);
}

// Each band filtered by its own resolved corners (matched by id): highpass at lowHz,
// lowpass at highHz, either independently optional. Bands with no matching point (or
// neither corner set) pass through untouched. Generic so callers' extra band props
// (name, colour, qty) survive.
export function applyCrossovers<T extends ResponseBand & { id: string }>(
  bands: T[],
  points: Pick<XoPoint, "id" | "lowHz" | "highHz">[]
): T[] {
  return bands.map((band) => {
    const p = points.find((pt) => pt.id === band.id);
    if (!p || (p.lowHz === undefined && p.highHz === undefined)) return band;
    return {
      ...band,
      points: band.points.map(([f, db]) => {
        let v = db;
        if (p.lowHz !== undefined) v += lr4Db(f, p.lowHz, "highpass");
        if (p.highHz !== undefined) v += lr4Db(f, p.highHz, "lowpass");
        return [f, v] as [number, number];
      }),
    };
  });
}

// A corner can carry several flags at once but only shows one style, so the priority
// gap > clamped > approximated > extrapolated is fixed here for chip and legend alike.
export type XoCornerStatus = "gap" | "clamped" | "approximated" | "extrapolated" | "none";

export function cornerStatus(p: XoPoint, side: XoSide): XoCornerStatus {
  if (side === "lo") {
    if (p.lowCustom) return "none";
    if (p.lowGap) return "gap";
    if (p.clampedToCdMin) return "clamped";
    if (p.lowApproximated) return "approximated";
    if (p.lowExtrapolated) return "extrapolated";
  } else {
    if (p.highCustom) return "none";
    if (p.highGap) return "gap";
    if (p.highClampedToCdMin) return "clamped";
    if (p.highApproximated) return "approximated";
    if (p.highExtrapolated) return "extrapolated";
  }
  return "none";
}

export interface XoMarkLine {
  hz: number;
  lowpassColor?: string;
  highpassColor?: string;
}

// Grouped by frequency, not one entry per corner: two boxes' corners coincide until
// independently edited.
export function xoMarkLines(
  points: XoPoint[],
  colorOf: (id: string) => string | undefined
): XoMarkLine[] {
  const byHz = new Map<number, XoMarkLine>();
  for (const p of points) {
    const color = colorOf(p.id);
    if (!color) continue;
    if (p.lowHz !== undefined) {
      const entry = byHz.get(p.lowHz) ?? { hz: p.lowHz };
      entry.highpassColor = color;
      byHz.set(p.lowHz, entry);
    }
    if (p.highHz !== undefined) {
      const entry = byHz.get(p.highHz) ?? { hz: p.highHz };
      entry.lowpassColor = color;
      byHz.set(p.highHz, entry);
    }
  }
  return [...byHz.values()];
}
