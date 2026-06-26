// Driver substitution: rank catalog drivers by how safely they could replace a given
// driver in an existing box. Parametric hint only, a real swap still needs a sim.
//
// Hard filters first (a candidate that cannot physically mount is noise): same type,
// same nominal size (cone cutout) or throat exit (compression). Ranking is a weighted
// mean of per-parameter deviations measured in octaves (|log2 ratio|, T/S params are
// ratio-scale) or dB/6 for sensitivities (6 dB ≈ one perceptual doubling).

import type { CompressionDriver, ConeDriver, Driver } from "./schemas";

type SubstituteTier = "close" | "usable" | "risky";

interface ParamDelta {
  label: string;
  unit: string;
  target: number;
  candidate: number;
}

export interface SubstituteCandidate {
  driver: Driver;
  // Weighted mean deviation; 0 = identical on all scored parameters.
  score: number;
  tier: SubstituteTier;
  deltas: ParamDelta[];
  flags: string[];
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
function scoreConeOnly(target: ConeDriver, c: ConeDriver): number {
  const xmaxPenalty = c.xmaxMm >= target.xmaxMm ? 0.25 : 1;
  const w0 = 3,
    w1 = 2.5,
    w2 = 2,
    w3 = 1.5,
    w4 = 1;
  const wSum = w0 + w1 + w2 + w3 + w4;
  return (
    (w0 * octaves(c.qts, target.qts) +
      w1 * octaves(c.fsHz, target.fsHz) +
      w2 * octaves(c.vasL, target.vasL) +
      w3 * xmaxPenalty * octaves(c.xmaxMm, target.xmaxMm) +
      (w4 * Math.abs(c.sensitivityDb - target.sensitivityDb)) / 6) /
    wSum
  );
}

function scoreCompressionOnly(target: CompressionDriver, c: CompressionDriver): number {
  const minXoPenalty = c.minCrossoverHz <= target.minCrossoverHz ? 0.25 : 1;
  const w0 = 3,
    w1 = 2,
    w2 = 1.5,
    w3 = 1.5,
    w4 = 1;
  const wSum = w0 + w1 + w2 + w3 + w4;
  return (
    (w0 * minXoPenalty * octaves(c.minCrossoverHz, target.minCrossoverHz) +
      w1 * octaves(c.fLowHz, target.fLowHz) +
      (w2 * Math.abs(c.sensitivityHornDb - target.sensitivityHornDb)) / 6 +
      w3 * octaves(c.voiceCoilMm, target.voiceCoilMm) +
      w4 * octaves(c.fHighHz, target.fHighHz)) /
    wSum
  );
}

function coneDeltas(target: ConeDriver, c: ConeDriver): ParamDelta[] {
  return [
    { label: "Fs", unit: "Hz", target: target.fsHz, candidate: c.fsHz },
    { label: "Qts", unit: "", target: target.qts, candidate: c.qts },
    { label: "Vas", unit: "L", target: target.vasL, candidate: c.vasL },
    { label: "Xmax", unit: "mm", target: target.xmaxMm, candidate: c.xmaxMm },
    { label: "Sens", unit: "dB", target: target.sensitivityDb, candidate: c.sensitivityDb },
  ];
}

function compressionDeltas(target: CompressionDriver, c: CompressionDriver): ParamDelta[] {
  return [
    { label: "Min XO", unit: "Hz", target: target.minCrossoverHz, candidate: c.minCrossoverHz },
    { label: "Range low", unit: "Hz", target: target.fLowHz, candidate: c.fLowHz },
    { label: "Range high", unit: "Hz", target: target.fHighHz, candidate: c.fHighHz },
    { label: "Voice coil", unit: "mm", target: target.voiceCoilMm, candidate: c.voiceCoilMm },
    { label: "Sens", unit: "dB", target: target.sensitivityHornDb, candidate: c.sensitivityHornDb },
  ];
}

function flagsFor(target: Driver, c: Driver): string[] {
  const flags: string[] = [];
  if (c.impedanceOhm !== target.impedanceOhm) {
    flags.push(`${c.impedanceOhm} Ω vs ${target.impedanceOhm} Ω: amp load changes`);
  }
  if (c.peW < 0.8 * target.peW) {
    flags.push(`${c.peW} W vs ${target.peW} W: lower power handling`);
  }
  if (c.type === "cone" && target.type === "cone" && c.xmaxMm < target.xmaxMm) {
    flags.push(`Xmax ${c.xmaxMm} mm < ${target.xmaxMm} mm: lower excursion-limited SPL`);
  }
  if (
    c.type === "compression" &&
    target.type === "compression" &&
    c.minCrossoverHz > target.minCrossoverHz
  ) {
    flags.push(`min crossover ${c.minCrossoverHz} Hz > ${target.minCrossoverHz} Hz: raise the XO`);
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
    const key = groupKey(d);
    let g = groups.get(key);
    if (!g) {
      g = [];
      groups.set(key, g);
    }
    g.push(d);
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
