// Client-side export helpers. Everything is static (output: "static"), so files are
// generated in the browser via Blob downloads. PDF is handled separately via the print
// stylesheet (window.print), not here.

import { AXIS_FIELDS, type EnclosureRecord } from "./metrics";

/* v8 ignore start: DOM-only glue, exercised in the browser not in vitest */
export function downloadBlob(filename: string, mime: string, content: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
/* v8 ignore stop */

// Quote a CSV cell when it contains a delimiter, quote, or newline (RFC 4180).
function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number)[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

export interface CurveSeries {
  name: string;
  slug?: string;
  source?: string;
  points: [number, number][];
}

// Tidy/long format: one row per point. Each series keeps its own native frequency grid.
// Curves are never resampled onto a shared axis (see src/lib/csv.ts, CLAUDE.md).
export function curveSeriesToCsv(series: CurveSeries[], kind: string): string {
  const rows: (string | number)[][] = [["enclosure", "kind", "source", "freq_hz", "value"]];
  for (const s of series) {
    for (const [f, v] of s.points) {
      rows.push([s.name, kind, s.source ?? "", f, v]);
    }
  }
  return toCsv(rows);
}

// One row per enclosure: identity columns + every AXIS_FIELDS metric. Missing metrics
// are left blank (never defaulted: maxSplDb etc. are factual-or-absent).
export function recordsToCsv(records: EnclosureRecord[]): string {
  const metricKeys = AXIS_FIELDS.map((f) => f.key);
  const header = ["slug", "name", "category", "topology", "provenance", ...metricKeys];
  const rows: (string | number)[][] = [header];
  for (const r of records) {
    rows.push([
      r.slug,
      r.name,
      r.category,
      r.topology,
      r.provenance,
      ...metricKeys.map((k) => r.metrics[k] ?? ""),
    ]);
  }
  return toCsv(rows);
}

export function jsonString(obj: unknown): string {
  return JSON.stringify(obj, null, 2);
}
