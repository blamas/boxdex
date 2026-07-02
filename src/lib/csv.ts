// Curves are discrete measured/simulated points. Do not interpolate phase (no unwrap)
// for anything other than display. No common-grid resampling here. ECharts plots each
// series from its own native points on a shared log x-axis, so no resampling is needed.

export const CURVE_KINDS = [
  "spl",
  "spl_stacked",
  "phase",
  "impedance",
  "group_delay",
  "distortion",
  "power_compression",
] as const;
export type CurveKind = (typeof CURVE_KINDS)[number];

export interface ParsedCurve {
  freq: number[];
  value: number[];
}

export function parseCurveCsv(text: string): ParsedCurve {
  const freq: number[] = [];
  const value: number[] = [];

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    const parts = line.split(/[,;\t]+/);
    if (parts.length < 2) continue;

    const f = Number(parts[0]);
    const v = Number(parts[1]);
    if (!Number.isFinite(f) || !Number.isFinite(v)) continue;

    freq.push(f);
    value.push(v);
  }

  return { freq, value };
}

export function toPairs(curve: ParsedCurve): [number, number][] {
  return curve.freq.map((f, i) => [f, curve.value[i]]);
}

export function normalisePeak(values: number[]): number[] {
  if (values.length === 0) return [];
  const peak = Math.max(...values);
  return values.map((v) => v - peak);
}
