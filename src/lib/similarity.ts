// Driver substitution: rank catalog drivers by how safely they could replace a given
// driver in an existing box. Parametric hint only, a real swap still needs a sim.
//
// Hard filters first (a candidate that cannot physically mount is noise): same type,
// same nominal size (cone cutout) or throat exit (compression). Ranking is a weighted
// mean of per-parameter deviations measured in octaves (|log2 ratio|, T/S params are
// ratio-scale) or dB/6 for sensitivities (6 dB ≈ one perceptual doubling).

import type { CompressionDriver, ConeDriver, Driver } from "./schemas";

type SubstituteTier = "close" | "usable" | "risky";

// Machine keys, not display text: the UI resolves them per locale.
export type ParamKey =
  | "fs"
  | "qts"
  | "vas"
  | "xmax"
  | "sens"
  | "minXo"
  | "rangeLow"
  | "rangeHigh"
  | "voiceCoil";

interface ParamDelta {
  key: ParamKey;
  unit: string;
  target: number;
  candidate: number;
}

// Why this candidate is not a like-for-like swap. Keyed + parameterised so the
// sentence is built in the UI's language, same shape as XoWarning in crossover.ts.
export type SubstituteFlag =
  | { key: "impedanceDiffers"; params: { candidate: number; target: number } }
  | { key: "lowerPower"; params: { candidate: number; target: number } }
  | { key: "lowerExcursion"; params: { candidate: number; target: number } }
  | { key: "higherMinCrossover"; params: { candidate: number; target: number } };

export interface SubstituteCandidate {
  driver: Driver;
  // Weighted mean deviation; 0 = identical on all scored parameters.
  score: number;
  tier: SubstituteTier;
  deltas: ParamDelta[];
  flags: SubstituteFlag[];
}

// ~±11 % weighted deviation reads as a drop-in; ~±32 % still workable with care.
function tierOf(score: number): SubstituteTier {
  if (score <= 0.15) return "close";
  if (score <= 0.4) return "usable";
  return "risky";
}

const octaves = (a: number, b: number) => Math.abs(Math.log2(a / b));

// Score-only variants: return just a number, no delta object allocation.
// Used in the sort pass of allSubstitutes to avoid allocating deltas for
// every peer before we know which ones make the top-N cutoff.
// The domain judgment in this module. Published in docs/methodology.md, keep in sync.
const CONE_WEIGHTS = { qts: 3, fs: 2.5, vas: 2, xmax: 1.5, sensitivity: 1 } as const;
const COMPRESSION_WEIGHTS = {
  minCrossover: 3,
  fLow: 2,
  sensitivity: 1.5,
  voiceCoil: 1.5,
  fHigh: 1,
} as const;

// Bettering the target is headroom, not a mismatch, so it is discounted not penalised.
const BETTER_THAN_TARGET_PENALTY = 0.25;

const sumWeights = (w: Record<string, number>) => Object.values(w).reduce((a, b) => a + b, 0);

function scoreConeOnly(target: ConeDriver, c: ConeDriver): number {
  const w = CONE_WEIGHTS;
  const xmaxPenalty = c.xmaxMm >= target.xmaxMm ? BETTER_THAN_TARGET_PENALTY : 1;
  return (
    (w.qts * octaves(c.qts, target.qts) +
      w.fs * octaves(c.fsHz, target.fsHz) +
      w.vas * octaves(c.vasL, target.vasL) +
      w.xmax * xmaxPenalty * octaves(c.xmaxMm, target.xmaxMm) +
      (w.sensitivity * Math.abs(c.sensitivityDb - target.sensitivityDb)) / 6) /
    sumWeights(w)
  );
}

function scoreCompressionOnly(target: CompressionDriver, c: CompressionDriver): number {
  const w = COMPRESSION_WEIGHTS;
  const minXoPenalty = c.minCrossoverHz <= target.minCrossoverHz ? BETTER_THAN_TARGET_PENALTY : 1;
  return (
    (w.minCrossover * minXoPenalty * octaves(c.minCrossoverHz, target.minCrossoverHz) +
      w.fLow * octaves(c.fLowHz, target.fLowHz) +
      (w.sensitivity * Math.abs(c.sensitivityHornDb - target.sensitivityHornDb)) / 6 +
      w.voiceCoil * octaves(c.voiceCoilMm, target.voiceCoilMm) +
      w.fHigh * octaves(c.fHighHz, target.fHighHz)) /
    sumWeights(w)
  );
}

function coneDeltas(target: ConeDriver, c: ConeDriver): ParamDelta[] {
  return [
    { key: "fs", unit: "Hz", target: target.fsHz, candidate: c.fsHz },
    { key: "qts", unit: "", target: target.qts, candidate: c.qts },
    { key: "vas", unit: "L", target: target.vasL, candidate: c.vasL },
    { key: "xmax", unit: "mm", target: target.xmaxMm, candidate: c.xmaxMm },
    { key: "sens", unit: "dB", target: target.sensitivityDb, candidate: c.sensitivityDb },
  ];
}

function compressionDeltas(target: CompressionDriver, c: CompressionDriver): ParamDelta[] {
  return [
    { key: "minXo", unit: "Hz", target: target.minCrossoverHz, candidate: c.minCrossoverHz },
    { key: "rangeLow", unit: "Hz", target: target.fLowHz, candidate: c.fLowHz },
    { key: "rangeHigh", unit: "Hz", target: target.fHighHz, candidate: c.fHighHz },
    { key: "voiceCoil", unit: "mm", target: target.voiceCoilMm, candidate: c.voiceCoilMm },
    { key: "sens", unit: "dB", target: target.sensitivityHornDb, candidate: c.sensitivityHornDb },
  ];
}

function flagsFor(target: Driver, c: Driver): SubstituteFlag[] {
  const flags: SubstituteFlag[] = [];
  if (c.impedanceOhm !== target.impedanceOhm) {
    flags.push({
      key: "impedanceDiffers",
      params: { candidate: c.impedanceOhm, target: target.impedanceOhm },
    });
  }
  if (c.peW < 0.8 * target.peW) {
    flags.push({ key: "lowerPower", params: { candidate: c.peW, target: target.peW } });
  }
  if (c.type === "cone" && target.type === "cone" && c.xmaxMm < target.xmaxMm) {
    flags.push({
      key: "lowerExcursion",
      params: { candidate: c.xmaxMm, target: target.xmaxMm },
    });
  }
  if (
    c.type === "compression" &&
    target.type === "compression" &&
    c.minCrossoverHz > target.minCrossoverHz
  ) {
    flags.push({
      key: "higherMinCrossover",
      params: { candidate: c.minCrossoverHz, target: target.minCrossoverHz },
    });
  }
  return flags;
}

// Returns a numeric similarity score between two drivers (lower = closer match).
// Returns Infinity when the candidate is a different type or size group (not a substitute).
export function scoreDriver(target: Driver, candidate: Driver): number {
  if (candidate.type !== target.type) return Infinity;
  if (groupKey(target) !== groupKey(candidate)) return Infinity;
  return target.type === "cone"
    ? scoreConeOnly(target as ConeDriver, candidate as ConeDriver)
    : scoreCompressionOnly(target as CompressionDriver, candidate as CompressionDriver);
}

function groupKey(d: Driver): string {
  return d.type === "cone"
    ? `cone-${(d as ConeDriver).sizeInch}`
    : `comp-${(d as CompressionDriver).exitInch}`;
}

// Batch variant: groups pool by (type, size) once in O(n), then scores only
// same-group candidates per driver. Use this in getStaticPaths to avoid O(n²) filtering.
export function allSubstitutes(pool: Driver[], limit = 10): Map<string, SubstituteCandidate[]> {
  const groups = new Map<string, Driver[]>();
  for (const d of pool) {
    const k = groupKey(d);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)?.push(d);
  }

  const result = new Map<string, SubstituteCandidate[]>();
  for (const target of pool) {
    const peers = groups.get(groupKey(target)) ?? [];
    const isCone = target.type === "cone";

    // Score-only pass: compute just numbers, no delta object allocation.
    const scored: [Driver, number][] = [];
    for (const c of peers) {
      if (c.id === target.id) continue;
      const score = isCone
        ? scoreConeOnly(target as ConeDriver, c as ConeDriver)
        : scoreCompressionOnly(target as CompressionDriver, c as CompressionDriver);
      scored.push([c, score]);
    }
    scored.sort((a, b) => a[1] - b[1] || a[0].id.localeCompare(b[0].id));

    // Build full candidates only for the top-N survivors.
    const candidates = scored.slice(0, limit).map(([c, score]) => ({
      driver: c,
      score,
      tier: tierOf(score),
      deltas: isCone
        ? coneDeltas(target as ConeDriver, c as ConeDriver)
        : compressionDeltas(target as CompressionDriver, c as CompressionDriver),
      flags: flagsFor(target, c),
    }));

    result.set(target.id, candidates);
  }
  return result;
}
