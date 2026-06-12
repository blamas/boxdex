import type { Category, CategoryFilter } from "./category";

export type Provenance = "measured" | "sim";

// Derived: a build counts as "measured" once it has at least one measurement.
export function provenanceOf(measurements: readonly unknown[]): Provenance {
  return measurements.length > 0 ? "measured" : "sim";
}

export interface AxisField {
  key: string;
  label: string;
  unit: string;
  better: "min" | "max";
}

export const AXIS_FIELDS: AxisField[] = [
  { key: "volumeL", label: "Net volume", unit: "L", better: "min" },
  { key: "footprintCm2", label: "Footprint", unit: "cm²", better: "min" },
  { key: "heightMm", label: "Height", unit: "mm", better: "min" },
  { key: "weightKg", label: "Weight", unit: "kg", better: "min" },
  { key: "f3Hz", label: "F3 low", unit: "Hz", better: "min" },
  { key: "f3HzHigh", label: "F3 high", unit: "Hz", better: "max" },
  { key: "maxSplDb", label: "Max SPL", unit: "dB", better: "max" },
  { key: "sensitivityDb", label: "Sensitivity", unit: "dB", better: "max" },
  { key: "outputDensity", label: "Output density", unit: "dB/size", better: "max" },
];

export const AXIS_MAP = new Map(AXIS_FIELDS.map((f) => [f.key, f]));

export interface EnclosureInput {
  netVolumeL: number;
  dims: { hMm: number; wMm: number; dMm: number };
  weightKg?: number;
  specs: {
    f3Hz: number;
    f3HzHigh?: number;
    maxSplDb?: number;
    maxSplExcursionDb?: number;
    maxSplThermalDb?: number;
    sensitivityDb?: number;
    impedanceMinOhm?: number;
  };
}

export interface DerivedMetrics {
  volumeL: number;
  footprintCm2: number;
  heightMm: number;
  weightKg: number | undefined;
  f3Hz: number;
  f3HzHigh: number | undefined;
  maxSplDb: number | undefined;
  maxSplExcursionDb: number | undefined;
  maxSplThermalDb: number | undefined;
  sensitivityDb: number | undefined;
  impedanceMinOhm: number | undefined;
  outputDensity: number | undefined;
}

export function deriveMetrics(e: EnclosureInput): DerivedMetrics {
  const footprintCm2 = Math.round((e.dims.wMm * e.dims.dMm) / 100);
  const outputDensity =
    e.specs.maxSplDb !== undefined
      ? Math.round((e.specs.maxSplDb - 10 * Math.log10(e.netVolumeL)) * 10) / 10
      : undefined;

  return {
    volumeL: e.netVolumeL,
    footprintCm2,
    heightMm: e.dims.hMm,
    weightKg: e.weightKg,
    f3Hz: e.specs.f3Hz,
    f3HzHigh: e.specs.f3HzHigh,
    maxSplDb: e.specs.maxSplDb,
    maxSplExcursionDb: e.specs.maxSplExcursionDb,
    maxSplThermalDb: e.specs.maxSplThermalDb,
    sensitivityDb: e.specs.sensitivityDb,
    impedanceMinOhm: e.specs.impedanceMinOhm,
    outputDensity,
  };
}

export interface EnclosureRecord {
  slug: string;
  name: string;
  category: Category;
  topology: string;
  topologyVariant: string | undefined;
  driverCount: number;
  drivers: string[];
  driverSizes: number[];
  ways: number | undefined;
  recommendedFor: string[];
  verified: boolean;
  provenance: Provenance;
  buildComplexity: string | undefined;
  hasPlans: boolean;
  hasMeasurements: boolean;
  availableKinds: string[];
  recommendedCrossoverHz: number | undefined;
  coverageAngleDeg: number | undefined;
  recommendedPowerW: number | undefined;
  powerAesW: number | undefined;
  powerProgramW: number | undefined;
  metrics: Record<string, number | undefined>;
}

export function filterByCategory(
  records: EnclosureRecord[],
  category: CategoryFilter
): EnclosureRecord[] {
  return category === "all" ? records : records.filter((r) => r.category === category);
}

// Sort by "name" (A–Z) or by a metric key, honouring each axis's better direction.
// Records missing the metric sort last. Returns a new array; input is not mutated.
export function sortRecords(records: EnclosureRecord[], sortKey: string): EnclosureRecord[] {
  if (sortKey === "name") {
    return [...records].sort((a, b) => a.name.localeCompare(b.name));
  }
  const field = AXIS_MAP.get(sortKey);
  return [...records].sort((a, b) => {
    const av = a.metrics[sortKey];
    const bv = b.metrics[sortKey];
    if (av === undefined && bv === undefined) return 0;
    if (av === undefined) return 1;
    if (bv === undefined) return -1;
    return field?.better === "max" ? bv - av : av - bv;
  });
}

// A record is dominated if another record is at-least-as-good on both axes and strictly better on one.
export function paretoFront(records: EnclosureRecord[], xKey: string, yKey: string): Set<number> {
  const xField = AXIS_MAP.get(xKey);
  const yField = AXIS_MAP.get(yKey);
  if (!xField || !yField) return new Set();

  const eligible = records
    .map((r, i) => ({ i, x: r.metrics[xKey], y: r.metrics[yKey] }))
    .filter(
      (p): p is { i: number; x: number; y: number } => p.x !== undefined && p.y !== undefined
    );

  const frontier = new Set<number>();

  for (const candidate of eligible) {
    let dominated = false;
    for (const other of eligible) {
      if (other.i === candidate.i) continue;
      const xAsGood = xField.better === "min" ? other.x <= candidate.x : other.x >= candidate.x;
      const yAsGood = yField.better === "min" ? other.y <= candidate.y : other.y >= candidate.y;
      const xStrictly = xField.better === "min" ? other.x < candidate.x : other.x > candidate.x;
      const yStrictly = yField.better === "min" ? other.y < candidate.y : other.y > candidate.y;

      if (xAsGood && yAsGood && (xStrictly || yStrictly)) {
        dominated = true;
        break;
      }
    }
    if (!dominated) frontier.add(candidate.i);
  }

  return frontier;
}

export function frontierLine(
  records: EnclosureRecord[],
  frontierSet: Set<number>,
  xKey: string
): EnclosureRecord[] {
  return records
    .filter((_, i) => frontierSet.has(i))
    .filter((r) => r.metrics[xKey] !== undefined)
    .sort((a, b) => (a.metrics[xKey] as number) - (b.metrics[xKey] as number));
}
