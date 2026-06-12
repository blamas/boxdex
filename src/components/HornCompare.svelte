<script lang="ts">
import { mouthCm2 } from "../lib/catalog";
import type { CompareRow, CompareView, RadarAxis } from "../lib/radar";
import type { Horn } from "../lib/schemas";
import { BASE } from "../lib/site";
import RadarCompare from "./RadarCompare.svelte";

const AXES: RadarAxis<Horn>[] = [
  { label: "Coverage H", unit: "°", invert: false, get: (h) => h.coverageHorizontalDeg },
  { label: "Coverage V", unit: "°", invert: false, get: (h) => h.coverageVerticalDeg },
  // lower flare cutoff = lower usable reach; invert so "more" = better extension
  { label: "Cutoff (inv.)", unit: "Hz", invert: true, get: (h) => h.cutoffHz },
  { label: "Mouth", unit: "cm²", invert: false, get: (h) => mouthCm2(h) },
  // shallower is generally desirable for a tidy top; invert
  { label: "Depth (inv.)", unit: "mm", invert: true, get: (h) => h.depthMm },
];

const ROWS: CompareRow<Horn>[] = [
  { label: "Throat exit", num: (h) => h.exitInch, fmt: (h) => `${h.exitInch}"` },
  {
    label: "Coverage (H×V)",
    num: () => undefined,
    fmt: (h) => `${h.coverageHorizontalDeg}° × ${h.coverageVerticalDeg}°`,
  },
  {
    label: "Directivity",
    num: () => undefined,
    fmt: (h) => (h.constantDirectivity ? "constant (CD)" : "—"),
  },
  { label: "Flare cutoff", num: (h) => h.cutoffHz, fmt: (h) => `${h.cutoffHz} Hz` },
  { label: "Mouth area", num: (h) => mouthCm2(h), fmt: (h) => `${mouthCm2(h)} cm²` },
  {
    label: "Mouth (W×H)",
    num: () => undefined,
    fmt: (h) => `${h.mouthWmm} × ${h.mouthHmm} mm`,
  },
  {
    label: "Depth",
    num: (h) => h.depthMm,
    fmt: (h) => (h.depthMm !== undefined ? `${h.depthMm} mm` : undefined),
  },
  { label: "Profile", num: () => undefined, fmt: (h) => h.profile },
  { label: "Material", num: () => undefined, fmt: (h) => h.material },
  {
    label: "Weight",
    num: (h) => h.weightKg,
    fmt: (h) => (h.weightKg !== undefined ? `${h.weightKg} kg` : undefined),
  },
];

function view(_selected: Horn[], all: Horn[]): CompareView<Horn> {
  return {
    axes: AXES,
    rows: ROWS,
    pool: all,
    note: "All axes normalised to 100 = max across horns in the catalogue. Axes marked “(inv.)” are inverted, so a higher score means a lower value (better).",
  };
}

function optionLabel(h: Horn): string {
  return `${h.brand} ${h.model} (${h.exitInch}" exit / ${h.coverageHorizontalDeg}°×${h.coverageVerticalDeg}°)`;
}
</script>

<RadarCompare
  fetchPath="/api/horns.json"
  exportName="horns"
  addLabel="Add horn"
  backHref={`${BASE}/drivers?tab=horn`}
  backLabel="← all horns"
  listLabel="horn list"
  {optionLabel}
  {view}
/>
