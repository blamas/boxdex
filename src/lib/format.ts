// Presentation helpers: pure, no DOM, safe to import anywhere.

// Turn a snake_case enum value (topology, curve kind, group key…) into a label.
export function humanize(s: string): string {
  return s.replace(/_/g, " ");
}

// Format an optional number with a unit, or undefined when absent. Handy for
// building data-driven spec tables where missing values are simply skipped.
export function withUnit(value: number | undefined, unit: string): string | undefined {
  return value === undefined ? undefined : `${value} ${unit}`;
}
