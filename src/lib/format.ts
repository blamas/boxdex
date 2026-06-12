// Presentation helpers: pure, no DOM, safe to import anywhere.

// Turn a snake_case enum value (topology, curve kind, group key…) into a label.
export function humanize(s: string): string {
  return s.replace(/_/g, " ");
}

// Format an optional number with a unit, or undefined when absent.
export function withUnit(value: number | undefined, unit: string): string | undefined {
  return value === undefined ? undefined : `${value} ${unit}`;
}

export function fmtW(w: number): string {
  return w >= 1000 ? `${(w / 1000).toFixed(1)} kW` : `${w} W`;
}

export function fmtOhm(ohm: number): string {
  return Number.isInteger(ohm) ? String(ohm) : ohm.toFixed(1);
}

export function fmtHz(hz: number): string {
  return hz >= 1000 ? `${(hz / 1000).toFixed(hz % 1000 === 0 ? 0 : 1)}k` : `${Math.round(hz)}`;
}
