<script lang="ts">
import type { Translations } from "../i18n";
import { mouthCm2 } from "../lib/catalog";
import type { CompareRow, CompareView, RadarAxis } from "../lib/radar";
import type { Horn } from "../lib/schemas";
import RadarCompare from "./RadarCompare.svelte";

let {
  t,
  tRadar,
  localeBase,
}: {
  t: Translations["hornCompare"];
  tRadar: Translations["radarCompare"];
  localeBase: string;
} = $props();

const AXES: RadarAxis<Horn>[] = [
  { label: t.axes.coverageH, unit: "°", invert: false, get: (h) => h.coverageHorizontalDeg },
  { label: t.axes.coverageV, unit: "°", invert: false, get: (h) => h.coverageVerticalDeg },
  { label: t.axes.cutoffInv, unit: "Hz", invert: true, get: (h) => h.cutoffHz },
  { label: t.axes.mouth, unit: "cm²", invert: false, get: (h) => mouthCm2(h) },
  { label: t.axes.depthInv, unit: "mm", invert: true, get: (h) => h.depthMm },
];

const ROWS: CompareRow<Horn>[] = [
  { label: t.rows.throatExit, num: (h) => h.exitInch, fmt: (h) => `${h.exitInch}"` },
  {
    label: t.rows.coverageHV,
    num: () => undefined,
    fmt: (h) => `${h.coverageHorizontalDeg}° × ${h.coverageVerticalDeg}°`,
  },
  {
    label: t.rows.directivity,
    num: () => undefined,
    fmt: (h) => (h.constantDirectivity ? t.rows.constantDirectivity : ""),
  },
  { label: t.rows.flareCutoff, num: (h) => h.cutoffHz, fmt: (h) => `${h.cutoffHz} Hz` },
  { label: t.rows.mouthArea, num: (h) => mouthCm2(h), fmt: (h) => `${mouthCm2(h)} cm²` },
  {
    label: t.rows.mouthWH,
    num: () => undefined,
    fmt: (h) => `${h.mouthWmm} × ${h.mouthHmm} mm`,
  },
  {
    label: t.rows.depth,
    num: (h) => h.depthMm,
    fmt: (h) => (h.depthMm !== undefined ? `${h.depthMm} mm` : undefined),
  },
  { label: t.rows.profile, num: () => undefined, fmt: (h) => h.profile },
  { label: t.rows.material, num: () => undefined, fmt: (h) => h.material },
  {
    label: t.rows.weight,
    num: (h) => h.weightKg,
    fmt: (h) => (h.weightKg !== undefined ? `${h.weightKg} kg` : undefined),
  },
];

function view(_selected: Horn[], all: Horn[]): CompareView<Horn> {
  return {
    axes: AXES,
    rows: ROWS,
    pool: all,
    note: t.note,
  };
}

function optionLabel(h: Horn): string {
  return `${h.brand} ${h.model} (${h.exitInch}" exit / ${h.coverageHorizontalDeg}°×${h.coverageVerticalDeg}°)`;
}
</script>

<RadarCompare
  fetchPath="/api/horns.json"
  exportName="horns"
  addLabel={t.addLabel}
  backHref={`${localeBase}/drivers?tab=horn`}
  backLabel={t.backLabel}
  listLabel={t.listLabel}
  {tRadar}
  {optionLabel}
  {view}
/>
