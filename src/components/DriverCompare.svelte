<script lang="ts">
import type { CompareRow, CompareView, RadarAxis } from "../lib/radar";
import type { Driver } from "../lib/schemas";
import { BASE } from "../lib/site";
import RadarCompare from "./RadarCompare.svelte";

// Cone and compression drivers have disjoint specs, so the radar axes and the parameter
// table are defined per type and chosen from the selected drivers' shared type. Getters
// (rather than keys) sidestep union indexing.

const CONE_AXES: RadarAxis<Driver>[] = [
  {
    label: "Sensitivity",
    unit: "dB",
    invert: false,
    get: (d) => (d.type === "cone" ? d.sensitivityDb : undefined),
  },
  {
    label: "Xmax",
    unit: "mm",
    invert: false,
    get: (d) => (d.type === "cone" ? d.xmaxMm : undefined),
  },
  { label: "Power", unit: "W", invert: false, get: (d) => d.peW },
  {
    label: "Sd",
    unit: "cm²",
    invert: false,
    get: (d) => (d.type === "cone" ? d.sdCm2 : undefined),
  },
  { label: "Vas", unit: "L", invert: false, get: (d) => (d.type === "cone" ? d.vasL : undefined) },
  // lower Fs = better extension; invert so "more" on the chart means better
  {
    label: "Fs (inv.)",
    unit: "Hz",
    invert: true,
    get: (d) => (d.type === "cone" ? d.fsHz : undefined),
  },
];

const COMP_AXES: RadarAxis<Driver>[] = [
  {
    label: "Sensitivity",
    unit: "dB",
    invert: false,
    get: (d) => (d.type === "compression" ? d.sensitivityHornDb : undefined),
  },
  { label: "Power", unit: "W", invert: false, get: (d) => d.peW },
  {
    label: "Top end",
    unit: "Hz",
    invert: false,
    get: (d) => (d.type === "compression" ? d.fHighHz : undefined),
  },
  {
    label: "Voice coil",
    unit: "mm",
    invert: false,
    get: (d) => (d.type === "compression" ? d.voiceCoilMm : undefined),
  },
  // lower min crossover / low end = wider usable band; invert
  {
    label: "Min xover (inv.)",
    unit: "Hz",
    invert: true,
    get: (d) => (d.type === "compression" ? d.minCrossoverHz : undefined),
  },
  {
    label: "Low end (inv.)",
    unit: "Hz",
    invert: true,
    get: (d) => (d.type === "compression" ? d.fLowHz : undefined),
  },
];

const CONE_ROWS: CompareRow<Driver>[] = [
  {
    label: "Size",
    num: (d) => (d.type === "cone" ? d.sizeInch : undefined),
    fmt: (d) => (d.type === "cone" ? `${d.sizeInch}"` : undefined),
  },
  { label: "Impedance", num: (d) => d.impedanceOhm, fmt: (d) => `${d.impedanceOhm} Ω` },
  {
    label: "Fs",
    num: (d) => (d.type === "cone" ? d.fsHz : undefined),
    fmt: (d) => (d.type === "cone" ? `${d.fsHz} Hz` : undefined),
  },
  {
    label: "Qts",
    num: (d) => (d.type === "cone" ? d.qts : undefined),
    fmt: (d) => (d.type === "cone" ? d.qts.toFixed(3) : undefined),
  },
  {
    label: "Qes",
    num: (d) => (d.type === "cone" ? d.qes : undefined),
    fmt: (d) => (d.type === "cone" && d.qes !== undefined ? d.qes.toFixed(3) : undefined),
  },
  {
    label: "Qms",
    num: (d) => (d.type === "cone" ? d.qms : undefined),
    fmt: (d) => (d.type === "cone" && d.qms !== undefined ? d.qms.toFixed(2) : undefined),
  },
  {
    label: "Vas",
    num: (d) => (d.type === "cone" ? d.vasL : undefined),
    fmt: (d) => (d.type === "cone" ? `${d.vasL} L` : undefined),
  },
  {
    label: "Sd",
    num: (d) => (d.type === "cone" ? d.sdCm2 : undefined),
    fmt: (d) => (d.type === "cone" ? `${d.sdCm2} cm²` : undefined),
  },
  {
    label: "Xmax",
    num: (d) => (d.type === "cone" ? d.xmaxMm : undefined),
    fmt: (d) => (d.type === "cone" ? `${d.xmaxMm} mm` : undefined),
  },
  {
    label: "Re",
    num: (d) => (d.type === "cone" ? d.reOhm : undefined),
    fmt: (d) => (d.type === "cone" && d.reOhm !== undefined ? `${d.reOhm} Ω` : undefined),
  },
  {
    label: "BL",
    num: (d) => (d.type === "cone" ? d.bl : undefined),
    fmt: (d) => (d.type === "cone" && d.bl !== undefined ? `${d.bl} T·m` : undefined),
  },
  {
    label: "Mms",
    num: (d) => (d.type === "cone" ? d.mmsG : undefined),
    fmt: (d) => (d.type === "cone" && d.mmsG !== undefined ? `${d.mmsG} g` : undefined),
  },
  { label: "Pe", num: (d) => d.peW, fmt: (d) => `${d.peW} W` },
  {
    label: "Sensitivity",
    num: (d) => (d.type === "cone" ? d.sensitivityDb : undefined),
    fmt: (d) => (d.type === "cone" ? `${d.sensitivityDb} dB` : undefined),
  },
];

const COMP_ROWS: CompareRow<Driver>[] = [
  {
    label: "Throat exit",
    num: (d) => (d.type === "compression" ? d.exitInch : undefined),
    fmt: (d) => (d.type === "compression" ? `${d.exitInch}"` : undefined),
  },
  {
    label: "Throat",
    num: (d) => (d.type === "compression" ? d.throatMm : undefined),
    fmt: (d) =>
      d.type === "compression" && d.throatMm !== undefined ? `${d.throatMm} mm` : undefined,
  },
  {
    label: "Voice coil",
    num: (d) => (d.type === "compression" ? d.voiceCoilMm : undefined),
    fmt: (d) => (d.type === "compression" ? `${d.voiceCoilMm} mm` : undefined),
  },
  { label: "Impedance", num: (d) => d.impedanceOhm, fmt: (d) => `${d.impedanceOhm} Ω` },
  {
    label: "Low end",
    num: (d) => (d.type === "compression" ? d.fLowHz : undefined),
    fmt: (d) => (d.type === "compression" ? `${d.fLowHz} Hz` : undefined),
  },
  {
    label: "Top end",
    num: (d) => (d.type === "compression" ? d.fHighHz : undefined),
    fmt: (d) => (d.type === "compression" ? `${d.fHighHz} Hz` : undefined),
  },
  {
    label: "Min crossover",
    num: (d) => (d.type === "compression" ? d.minCrossoverHz : undefined),
    fmt: (d) => (d.type === "compression" ? `${d.minCrossoverHz} Hz` : undefined),
  },
  {
    label: "Crossover slope",
    num: (d) => (d.type === "compression" ? d.crossoverSlopeDbOct : undefined),
    fmt: (d) =>
      d.type === "compression" && d.crossoverSlopeDbOct !== undefined
        ? `${d.crossoverSlopeDbOct} dB/oct`
        : undefined,
  },
  {
    label: "Sensitivity (horn)",
    num: (d) => (d.type === "compression" ? d.sensitivityHornDb : undefined),
    fmt: (d) => (d.type === "compression" ? `${d.sensitivityHornDb} dB` : undefined),
  },
  {
    label: "Fs",
    num: (d) => (d.type === "compression" ? d.fsHz : undefined),
    fmt: (d) => (d.type === "compression" && d.fsHz !== undefined ? `${d.fsHz} Hz` : undefined),
  },
  {
    label: "Magnet",
    num: () => undefined,
    fmt: (d) => (d.type === "compression" ? d.magnetMaterial : undefined),
  },
  {
    label: "Weight",
    num: (d) => (d.type === "compression" ? d.weightKg : undefined),
    fmt: (d) =>
      d.type === "compression" && d.weightKg !== undefined ? `${d.weightKg} kg` : undefined,
  },
  { label: "Power (AES)", num: (d) => d.peW, fmt: (d) => `${d.peW} W` },
];

// Axes and rows follow the selected kind; the picker locks to that kind once one is chosen.
function view(selected: Driver[], all: Driver[]): CompareView<Driver> {
  const activeType = selected[0]?.type ?? "cone";
  return {
    axes: activeType === "cone" ? CONE_AXES : COMP_AXES,
    rows: activeType === "cone" ? CONE_ROWS : COMP_ROWS,
    pool: all.filter((d) => d.type === activeType),
    note: `All axes normalised to 100 = max across ${activeType} drivers in the catalogue. Axes marked “(inv.)” are inverted, so a higher score means a lower value (better).`,
    selectable: (d) => selected.length === 0 || d.type === activeType,
  };
}

// A radar can only compare one driver kind; if a shared URL mixes types, keep the first.
function sanitizeIds(ids: string[], all: Driver[]): string[] {
  const valid = ids.filter((id) => all.some((d) => d.id === id));
  const firstType = all.find((d) => d.id === valid[0])?.type;
  return valid.filter((id) => all.find((d) => d.id === id)?.type === firstType);
}

function optionLabel(d: Driver): string {
  const size = d.type === "cone" ? `${d.sizeInch}"` : `${d.exitInch}" exit`;
  return `${d.brand} ${d.model} (${size} / ${d.impedanceOhm} Ω)`;
}
</script>

<RadarCompare
  fetchPath="/api/drivers.json"
  exportName="drivers"
  addLabel="Add driver"
  backHref={`${BASE}/drivers`}
  backLabel="← all drivers"
  listLabel="driver list"
  {optionLabel}
  {view}
  {sanitizeIds}
  csvExtra={[{ label: "type", value: (d) => d.type }]}
/>
