// Shared factories for EnclosureRecord/DerivedMetrics test data. Defaults are a
// minimal valid sub; override what the test cares about.

import type { DerivedMetrics, EnclosureRecord } from "../src/lib/metrics";

export function makeMetrics(partial: Partial<DerivedMetrics> = {}): DerivedMetrics {
  return {
    volumeL: 100,
    footprintCm2: 3000,
    heightMm: 800,
    weightKg: undefined,
    f3Hz: 40,
    f3HzHigh: undefined,
    maxSplDb: undefined,
    maxSplExcursionDb: undefined,
    maxSplThermalDb: undefined,
    sensitivityDb: undefined,
    impedanceMinOhm: undefined,
    outputDensity: undefined,
    outputPerKg: undefined,
    ...partial,
  };
}

export function makeRecord(partial: Partial<EnclosureRecord> & { slug: string }): EnclosureRecord {
  return {
    name: partial.slug,
    category: "sub",
    topology: "sealed",
    topologyVariant: undefined,
    driverCount: 1,
    primaryDrivers: [],
    drivers: [],
    driverSizes: [],
    compressionExits: [],
    ways: undefined,
    recommendedFor: [],
    verified: false,
    provenance: "sim",
    buildComplexity: undefined,
    hasPlans: false,
    hasMeasurements: false,
    availableKinds: [],
    recommendedCrossoverHz: undefined,
    coverageAngleDeg: undefined,
    recommendedPowerW: undefined,
    powerAesW: undefined,
    powerProgramW: undefined,
    nominalImpedanceOhm: undefined,
    minCrossoverHz: undefined,
    sheetCount: undefined,
    sheetSizeMm: undefined,
    metrics: makeMetrics(),
    ...partial,
  };
}
