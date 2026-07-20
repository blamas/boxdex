// Radar-chart comparison model shared by the driver and horn compare pages. Items are
// scored per axis against the maximum across a reference pool (the whole catalogue of
// the same kind), so the scale stays stable as the selection changes.

export interface RadarAxis<T> {
  label: string;
  unit: string;
  // Invert when a *lower* raw value is better (Fs, cutoff…): the chart then shows
  // 100 − normalised so "more area" consistently reads as "better".
  invert: boolean;
  get: (item: T) => number | undefined;
}

// One row of the parameter table next to the radar. `num` feeds CSV export, `fmt`
// the rendered cell; a row is hidden when no selected item formats a value.
export interface CompareRow<T> {
  label: string;
  fmt: (item: T) => string | undefined;
  num: (item: T) => number | undefined;
}

// Minimum shape RadarCompare needs from a comparable catalogue item.
export interface CompareItem {
  id: string;
  brand: string;
  model: string;
  datasheetUrl?: string;
}

// What the compare page shows for the current selection. Drivers branch on the
// selected kind (cone/compression axes are disjoint); horns have a single set.
export interface CompareView<T> {
  axes: RadarAxis<T>[];
  rows: CompareRow<T>[];
  // Normalisation pool: same-kind items across the whole catalogue, so scores are
  // stable regardless of what is selected.
  pool: T[];
  // Caption under the radar explaining the normalisation.
  note: string;
  // Restricts the picker (drivers lock to the selected kind). Default: all.
  selectable?: (item: T) => boolean;
}

export function axisMaxima<T>(pool: T[], axes: RadarAxis<T>[]): number[] {
  return axes.map((ax) => Math.max(0, ...pool.map((item) => ax.get(item) ?? 0)));
}

// Missing yields null, never 0: on an inverted axis 0 would score as 100, best in pool.
export function radarValues<T>(item: T, axes: RadarAxis<T>[], maxima: number[]): (number | null)[] {
  return axes.map((ax, i) => {
    const raw = ax.get(item);
    if (raw === undefined || maxima[i] <= 0) return null;
    const norm = (raw / maxima[i]) * 100;
    return ax.invert ? 100 - norm : norm;
  });
}
