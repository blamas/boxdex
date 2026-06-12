// Crossover suggestions between the adjacent bands of a stack, and ideal LR4 filter
// application to predicted response curves. Suggestions are starting points for a
// real alignment, not DSP presets.

import { CATEGORIES, type Category } from "./category";
import { CATEGORY_UPPER_HZ, type ResponseBand } from "./stack";

export interface XoBand {
  category: Category;
  f3Hz: number;
  // Box's stated upper crossover, when the plan gives one.
  recommendedXoHz?: number;
  // Compression-driver protection floor (crossing lower risks the diaphragm).
  minCrossoverHz?: number;
}

// Shape expected by applyCrossovers.
export interface XoFilter {
  low: Category;
  high: Category;
  fcHz: number | undefined;
}

export interface XoSuggestion extends XoFilter {
  // fcHz undefined = no valid point exists (spectral gap between the two bands).
  source: "recommended" | "geometric";
  clampedToCdMin: boolean;
  // Constraints kept so custom overrides can be validated against them.
  bandFloorHz: number; // upper band's F3
  cdMinHz: number | undefined; // upper band's CD protection floor
  hardCeilingHz: number; // lower band's usable top
}

interface BandAgg {
  category: Category;
  f3Hz: number; // most restrictive (highest) bottom among the band's boxes
  recommendedXoHz: number | undefined; // most restrictive (lowest) stated upper
  cdMinHz: number | undefined; // most restrictive (highest) CD floor
}

function aggregate(bands: XoBand[]): BandAgg[] {
  const byCat = new Map<Category, XoBand[]>();
  for (const b of bands) {
    byCat.set(b.category, [...(byCat.get(b.category) ?? []), b]);
  }
  return CATEGORIES.flatMap((category) => {
    const group = byCat.get(category);
    if (!group) return [];
    const recs = group.map((b) => b.recommendedXoHz).filter((v): v is number => v !== undefined);
    const mins = group.map((b) => b.minCrossoverHz).filter((v): v is number => v !== undefined);
    return [
      {
        category,
        f3Hz: Math.max(...group.map((b) => b.f3Hz)),
        recommendedXoHz: recs.length > 0 ? Math.min(...recs) : undefined,
        cdMinHz: mins.length > 0 ? Math.max(...mins) : undefined,
      },
    ];
  });
}

// One suggestion per adjacent pair of categories present in the stack. Prefers the
// lower box's stated crossover; otherwise the geometric mean of the usable overlap.
// Clamped up to the upper band's CD floor. No overlap = no point (never invented).
export function suggestCrossovers(bands: XoBand[]): XoSuggestion[] {
  const aggs = aggregate(bands);
  const out: XoSuggestion[] = [];
  for (let i = 1; i < aggs.length; i++) {
    const low = aggs[i - 1];
    const high = aggs[i];
    // A stated crossover is a recommendation, not the box's upper limit: clamping past
    // it (warned) is fine, past the category's hard ceiling is a real gap.
    const softCeiling = low.recommendedXoHz ?? CATEGORY_UPPER_HZ[low.category];
    const hardCeiling = Math.max(softCeiling, CATEGORY_UPPER_HZ[low.category]);
    const floor = Math.max(high.f3Hz, high.cdMinHz ?? 0);
    const constraints = {
      bandFloorHz: high.f3Hz,
      cdMinHz: high.cdMinHz,
      hardCeilingHz: hardCeiling,
    };
    if (floor > hardCeiling) {
      out.push({
        low: low.category,
        high: high.category,
        fcHz: undefined,
        source: "geometric",
        clampedToCdMin: false,
        ...constraints,
      });
      continue;
    }
    const candidate =
      low.recommendedXoHz ?? (floor < softCeiling ? Math.sqrt(floor * softCeiling) : floor);
    const fcHz = Math.round(Math.max(candidate, floor));
    out.push({
      low: low.category,
      high: high.category,
      fcHz,
      source: low.recommendedXoHz !== undefined ? "recommended" : "geometric",
      clampedToCdMin: high.cdMinHz !== undefined && candidate < high.cdMinHz,
      ...constraints,
    });
  }
  return out;
}

// A pair's effective crossover once user overrides are merged in. Overrides are keyed
// by the pair's low category (unique per adjacent pair). Out-of-range custom points
// warn but are never blocked or clamped: experts override knowingly, beginners get
// told why it's a bad idea.
export interface XoPoint extends XoFilter {
  custom: boolean;
  source: "recommended" | "geometric" | "custom";
  clampedToCdMin: boolean;
  gap: boolean;
  warnings: string[];
}

export function resolveCrossovers(
  suggestions: XoSuggestion[],
  overrides: Partial<Record<Category, number>>
): XoPoint[] {
  return suggestions.map((s) => {
    const fc = overrides[s.low];
    if (fc === undefined || fc <= 0) {
      return {
        low: s.low,
        high: s.high,
        fcHz: s.fcHz,
        custom: false,
        source: s.source,
        clampedToCdMin: s.clampedToCdMin,
        gap: s.fcHz === undefined,
        warnings: [],
      };
    }
    const warnings: string[] = [];
    if (s.cdMinHz !== undefined && fc < s.cdMinHz) {
      warnings.push(`below the CD protection floor (≥ ${s.cdMinHz} Hz): diaphragm risk`);
    }
    if (fc < s.bandFloorHz) {
      warnings.push(`below the ${s.high} band's F3 (${s.bandFloorHz} Hz)`);
    }
    if (fc > s.hardCeilingHz) {
      warnings.push(`above the ${s.low} band's usable top (${s.hardCeilingHz} Hz)`);
    }
    return {
      low: s.low,
      high: s.high,
      fcHz: Math.round(fc),
      custom: true,
      source: "custom",
      clampedToCdMin: false,
      gap: false,
      warnings,
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

// Each band filtered by the suggested crossovers around it: highpass at the fc below
// its category, lowpass at the fc above. Bands outside any suggested pair pass through.
// Generic so callers' extra band props (name, colour) survive.
export function applyCrossovers<T extends ResponseBand>(bands: T[], points: XoFilter[]): T[] {
  return bands.map((band) => {
    const hpFc = points.find((s) => s.high === band.category && s.fcHz !== undefined)?.fcHz;
    const lpFc = points.find((s) => s.low === band.category && s.fcHz !== undefined)?.fcHz;
    if (hpFc === undefined && lpFc === undefined) return band;
    return {
      ...band,
      points: band.points.map(([f, db]) => {
        let v = db;
        if (hpFc !== undefined) v += lr4Db(f, hpFc, "highpass");
        if (lpFc !== undefined) v += lr4Db(f, lpFc, "lowpass");
        return [f, v] as [number, number];
      }),
    };
  });
}
