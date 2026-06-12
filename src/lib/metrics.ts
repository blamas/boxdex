import type { Category, CategoryFilter } from "./category";

export type Provenance = "measured" | "sim";

// Derived: a build counts as "measured" once it has at least one measurement.
export function provenanceOf(measurements: readonly unknown[]): Provenance {
  return measurements.length > 0 ? "measured" : "sim";
}

// Numeric, per-enclosure facts derived from frontmatter. Optional fields stay
// undefined when unknown, never defaulted (see CLAUDE.md acoustic-limit rules).
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
  outputPerKg: number | undefined;
}

export type MetricKey = keyof DerivedMetrics;

export interface AxisField {
  key: MetricKey;
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
  { key: "outputPerKg", label: "Output per kg", unit: "dB/kg", better: "max" },
];

export const AXIS_MAP = new Map(AXIS_FIELDS.map((f) => [f.key, f]));

// Narrow an untrusted string (URL param, select value) to a plottable axis key.
export function metricKeyOf(s: string): MetricKey | undefined {
  return AXIS_FIELDS.find((f) => f.key === s)?.key;
}

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

export function deriveMetrics(e: EnclosureInput): DerivedMetrics {
  const footprintCm2 = Math.round((e.dims.wMm * e.dims.dMm) / 100);
  const outputDensity =
    e.specs.maxSplDb !== undefined
      ? Math.round((e.specs.maxSplDb - 10 * Math.log10(e.netVolumeL)) * 10) / 10
      : undefined;
  // Same dB-per-size idea against weight: what a van-constrained crew actually optimises.
  const outputPerKg =
    e.specs.maxSplDb !== undefined && e.weightKg !== undefined
      ? Math.round((e.specs.maxSplDb - 10 * Math.log10(e.weightKg)) * 10) / 10
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
    outputPerKg,
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
  compressionExits: number[];
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
  // Per-cab nominal load: stated in frontmatter, or the driver's nominal when the box
  // carries a single driver. Multi-driver boxes without a stated value stay undefined
  // (internal wiring is unknown, never guessed).
  nominalImpedanceOhm: number | undefined;
  // Protection floor for the box's compression drivers (max of their minCrossoverHz).
  minCrossoverHz: number | undefined;
  sheetCount: number | undefined;
  sheetSizeMm: { wMm: number; hMm: number } | undefined;
  metrics: DerivedMetrics;
}

export function filterByCategory(
  records: EnclosureRecord[],
  category: CategoryFilter
): EnclosureRecord[] {
  return category === "all" ? records : records.filter((r) => r.category === category);
}

// Find-page filter state. "" / "all" / [] mean the criterion is inactive. Numeric
// bounds on optional metrics exclude records missing the metric (an unknown SPL
// cannot satisfy "min SPL").
export interface EnclosureFilters {
  category: CategoryFilter;
  topology: string;
  driverSize: string;
  driverCount: string; // "all" | "1" | "2" | "3" | "4+"
  tags: string[]; // recommendedFor, any-match
  minF3: number | "";
  maxF3: number | "";
  minSpl: number | "";
  minVol: number | "";
  maxVol: number | "";
  measuredOnly: boolean;
  plansOnly: boolean;
  verifiedOnly: boolean;
}

function inBounds(value: number | undefined, min: number | "", max: number | ""): boolean {
  if (min === "" && max === "") return true;
  if (value === undefined) return false;
  return (min === "" || value >= Number(min)) && (max === "" || value <= Number(max));
}

export function filterEnclosures(
  records: EnclosureRecord[],
  f: EnclosureFilters
): EnclosureRecord[] {
  return records.filter((r) => {
    if (f.category !== "all" && r.category !== f.category) return false;
    if (f.topology !== "all" && r.topology !== f.topology) return false;
    if (f.driverSize !== "all" && !r.driverSizes.includes(Number(f.driverSize))) return false;
    if (f.driverCount !== "all") {
      if (f.driverCount === "4+") {
        if (r.driverCount < 4) return false;
      } else if (r.driverCount !== Number(f.driverCount)) return false;
    }
    if (f.tags.length > 0 && !r.recommendedFor.some((t) => f.tags.includes(t))) return false;
    if (!inBounds(r.metrics.f3Hz, f.minF3, f.maxF3)) return false;
    if (!inBounds(r.metrics.maxSplDb, f.minSpl, "")) return false;
    if (!inBounds(r.metrics.volumeL, f.minVol, f.maxVol)) return false;
    if (f.measuredOnly && !r.hasMeasurements) return false;
    if (f.plansOnly && !r.hasPlans) return false;
    if (f.verifiedOnly && !r.verified) return false;
    return true;
  });
}

// Sort by "name" (A-Z) or by a metric key, honouring each axis's better direction.
// Records missing the metric sort last.
export function sortRecords(
  records: EnclosureRecord[],
  sortKey: MetricKey | "name"
): EnclosureRecord[] {
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
export function paretoFront(
  records: EnclosureRecord[],
  xKey: MetricKey,
  yKey: MetricKey
): Set<number> {
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
  xKey: MetricKey
): EnclosureRecord[] {
  return records
    .filter((_, i) => frontierSet.has(i))
    .filter((r) => r.metrics[xKey] !== undefined)
    .sort((a, b) => (a.metrics[xKey] as number) - (b.metrics[xKey] as number));
}
