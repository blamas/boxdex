// Filtering and sorting for the driver/horn catalogue tables. Pure: the explorer
// island binds its inputs to a filter object and delegates here.

import type { Driver, Horn } from "./schemas";
import { compareValues, sortByValueMissingLast } from "./sort";
import { matchesName } from "./text";

// Numeric bound from an <input type="number">: "" = filter inactive.
type NumBound = number | "";

export interface DriverFilters {
  brand: string; // "all" or exact brand
  size: string; // "all" or cone sizeInch / compression exitInch as string
  impedance: string; // "all" or Ω as string
  name: string; // free-text match against "brand model", "" = inactive
  // cone bounds
  maxFs: NumBound;
  minQts: NumBound;
  maxQts: NumBound;
  minXmax: NumBound;
  minPe: NumBound;
  // compression bounds
  maxCrossover: NumBound;
  minSens: NumBound;
}

export interface HornFilters {
  brand: string;
  exit: string;
  profile: string;
  name: string; // free-text match against "brand model", "" = inactive
  maxCutoff: NumBound;
}

export const mouthCm2 = (h: Horn): number => Math.round((h.mouthWmm * h.mouthHmm) / 100);

export function filterDrivers(drivers: Driver[], f: DriverFilters): Driver[] {
  return drivers.filter((d) => {
    if (f.brand !== "all" && d.brand !== f.brand) return false;
    if (f.impedance !== "all" && d.impedanceOhm !== Number(f.impedance)) return false;
    if (!matchesName(`${d.brand} ${d.model}`, f.name)) return false;
    if (d.type === "cone") {
      if (f.size !== "all" && d.sizeInch !== Number(f.size)) return false;
      if (f.maxFs !== "" && d.fsHz > Number(f.maxFs)) return false;
      if (f.minQts !== "" && d.qts < Number(f.minQts)) return false;
      if (f.maxQts !== "" && d.qts > Number(f.maxQts)) return false;
      if (f.minXmax !== "" && d.xmaxMm < Number(f.minXmax)) return false;
      if (f.minPe !== "" && d.peW < Number(f.minPe)) return false;
    } else {
      if (f.size !== "all" && d.exitInch !== Number(f.size)) return false;
      if (f.maxCrossover !== "" && d.minCrossoverHz > Number(f.maxCrossover)) return false;
      if (f.minSens !== "" && d.sensitivityHornDb < Number(f.minSens)) return false;
    }
    return true;
  });
}

export function filterHorns(horns: Horn[], f: HornFilters): Horn[] {
  return horns.filter((h) => {
    if (f.brand !== "all" && h.brand !== f.brand) return false;
    if (f.exit !== "all" && h.exitInch !== Number(f.exit)) return false;
    if (f.profile !== "all" && h.profile !== f.profile) return false;
    if (!matchesName(`${h.brand} ${h.model}`, f.name)) return false;
    if (f.maxCutoff !== "" && h.cutoffHz > Number(f.maxCutoff)) return false;
    return true;
  });
}

// Per-column value getters so sorting works across the disjoint cone/compression
// field sets. Unknown keys (the other type's columns) keep the current order.
export function driverSortValue(d: Driver, key: string): number | string | undefined {
  if (key === "brand") return d.brand;
  if (key === "model") return d.model;
  if (key === "impedanceOhm") return d.impedanceOhm;
  if (key === "peW") return d.peW;
  if (d.type === "cone") {
    if (key === "sizeInch") return d.sizeInch;
    if (key === "fsHz") return d.fsHz;
    if (key === "qts") return d.qts;
    if (key === "vasL") return d.vasL;
    if (key === "xmaxMm") return d.xmaxMm;
    if (key === "sensitivityDb") return d.sensitivityDb;
  } else {
    if (key === "exitInch") return d.exitInch;
    if (key === "voiceCoilMm") return d.voiceCoilMm;
    if (key === "fLowHz") return d.fLowHz;
    if (key === "fHighHz") return d.fHighHz;
    if (key === "minCrossoverHz") return d.minCrossoverHz;
    if (key === "sensitivityHornDb") return d.sensitivityHornDb;
  }
  return undefined;
}

export function hornSortValue(h: Horn, key: string): number | string | undefined {
  if (key === "mouthCm2") return mouthCm2(h);
  if (key === "depthMm") return h.depthMm;
  if (key === "exitInch") return h.exitInch;
  if (key === "coverageHorizontalDeg") return h.coverageHorizontalDeg;
  if (key === "coverageVerticalDeg") return h.coverageVerticalDeg;
  if (key === "cutoffHz") return h.cutoffHz;
  return h.brand;
}

export function sortDrivers(drivers: Driver[], key: string, asc: boolean): Driver[] {
  return [...drivers].sort((a, b) => {
    const cmp = compareValues(driverSortValue(a, key), driverSortValue(b, key));
    return asc ? cmp : -cmp;
  });
}

// Horns missing the sorted value (optional depthMm) go last regardless of direction,
// matching sortRecords' missing-metric behaviour.
export function sortHorns(horns: Horn[], key: string, asc: boolean): Horn[] {
  return sortByValueMissingLast(horns, (h) => hornSortValue(h, key), asc);
}
