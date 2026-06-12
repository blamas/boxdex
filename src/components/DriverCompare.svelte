<script lang="ts">
import { type Translations, tt } from "../i18n";
import type { CompareRow, CompareView, RadarAxis } from "../lib/radar";
import type { Driver } from "../lib/schemas";
import RadarCompare from "./RadarCompare.svelte";

// Cone and compression drivers have disjoint specs, so the radar axes and the parameter
// table are defined per type and chosen from the selected drivers' shared type. Getters
// (rather than keys) sidestep union indexing.

let {
  t,
  tRadar,
  localeBase,
}: {
  t: Translations["driverCompare"];
  tRadar: Translations["radarCompare"];
  localeBase: string;
} = $props();

const CONE_AXES: RadarAxis<Driver>[] = $derived([
  {
    label: t.axes.cone.sensitivity,
    unit: "dB",
    invert: false,
    get: (d) => (d.type === "cone" ? d.sensitivityDb : undefined),
  },
  {
    label: t.axes.cone.xmax,
    unit: "mm",
    invert: false,
    get: (d) => (d.type === "cone" ? d.xmaxMm : undefined),
  },
  { label: t.axes.cone.power, unit: "W", invert: false, get: (d) => d.peW },
  {
    label: t.axes.cone.sd,
    unit: "cm²",
    invert: false,
    get: (d) => (d.type === "cone" ? d.sdCm2 : undefined),
  },
  {
    label: t.axes.cone.vas,
    unit: "L",
    invert: false,
    get: (d) => (d.type === "cone" ? d.vasL : undefined),
  },
  // lower Fs = better extension; invert so "more" on the chart means better
  {
    label: t.axes.cone.fsInv,
    unit: "Hz",
    invert: true,
    get: (d) => (d.type === "cone" ? d.fsHz : undefined),
  },
]);

const COMP_AXES: RadarAxis<Driver>[] = $derived([
  {
    label: t.axes.compression.sensitivity,
    unit: "dB",
    invert: false,
    get: (d) => (d.type === "compression" ? d.sensitivityHornDb : undefined),
  },
  { label: t.axes.compression.power, unit: "W", invert: false, get: (d) => d.peW },
  {
    label: t.axes.compression.topEnd,
    unit: "Hz",
    invert: false,
    get: (d) => (d.type === "compression" ? d.fHighHz : undefined),
  },
  {
    label: t.axes.compression.voiceCoil,
    unit: "mm",
    invert: false,
    get: (d) => (d.type === "compression" ? d.voiceCoilMm : undefined),
  },
  // lower min crossover / low end = wider usable band; invert
  {
    label: t.axes.compression.minXoverInv,
    unit: "Hz",
    invert: true,
    get: (d) => (d.type === "compression" ? d.minCrossoverHz : undefined),
  },
  {
    label: t.axes.compression.lowEndInv,
    unit: "Hz",
    invert: true,
    get: (d) => (d.type === "compression" ? d.fLowHz : undefined),
  },
]);

const CONE_ROWS: CompareRow<Driver>[] = $derived([
  {
    label: t.rows.cone.size,
    num: (d) => (d.type === "cone" ? d.sizeInch : undefined),
    fmt: (d) => (d.type === "cone" ? `${d.sizeInch}"` : undefined),
  },
  { label: t.rows.cone.impedance, num: (d) => d.impedanceOhm, fmt: (d) => `${d.impedanceOhm} Ω` },
  {
    label: t.rows.cone.fs,
    num: (d) => (d.type === "cone" ? d.fsHz : undefined),
    fmt: (d) => (d.type === "cone" ? `${d.fsHz} Hz` : undefined),
  },
  {
    label: t.rows.cone.qts,
    num: (d) => (d.type === "cone" ? d.qts : undefined),
    fmt: (d) => (d.type === "cone" ? d.qts.toFixed(3) : undefined),
  },
  {
    label: t.rows.cone.qes,
    num: (d) => (d.type === "cone" ? d.qes : undefined),
    fmt: (d) => (d.type === "cone" && d.qes !== undefined ? d.qes.toFixed(3) : undefined),
  },
  {
    label: t.rows.cone.qms,
    num: (d) => (d.type === "cone" ? d.qms : undefined),
    fmt: (d) => (d.type === "cone" && d.qms !== undefined ? d.qms.toFixed(2) : undefined),
  },
  {
    label: t.rows.cone.vas,
    num: (d) => (d.type === "cone" ? d.vasL : undefined),
    fmt: (d) => (d.type === "cone" ? `${d.vasL} L` : undefined),
  },
  {
    label: t.rows.cone.sd,
    num: (d) => (d.type === "cone" ? d.sdCm2 : undefined),
    fmt: (d) => (d.type === "cone" ? `${d.sdCm2} cm²` : undefined),
  },
  {
    label: t.rows.cone.xmax,
    num: (d) => (d.type === "cone" ? d.xmaxMm : undefined),
    fmt: (d) => (d.type === "cone" ? `${d.xmaxMm} mm` : undefined),
  },
  {
    label: t.rows.cone.re,
    num: (d) => (d.type === "cone" ? d.reOhm : undefined),
    fmt: (d) => (d.type === "cone" && d.reOhm !== undefined ? `${d.reOhm} Ω` : undefined),
  },
  {
    label: t.rows.cone.bl,
    num: (d) => (d.type === "cone" ? d.bl : undefined),
    fmt: (d) => (d.type === "cone" && d.bl !== undefined ? `${d.bl} T·m` : undefined),
  },
  {
    label: t.rows.cone.mms,
    num: (d) => (d.type === "cone" ? d.mmsG : undefined),
    fmt: (d) => (d.type === "cone" && d.mmsG !== undefined ? `${d.mmsG} g` : undefined),
  },
  { label: t.rows.cone.pe, num: (d) => d.peW, fmt: (d) => `${d.peW} W` },
  {
    label: t.rows.cone.sensitivity,
    num: (d) => (d.type === "cone" ? d.sensitivityDb : undefined),
    fmt: (d) => (d.type === "cone" ? `${d.sensitivityDb} dB` : undefined),
  },
]);

const COMP_ROWS: CompareRow<Driver>[] = $derived([
  {
    label: t.rows.compression.throatExit,
    num: (d) => (d.type === "compression" ? d.exitInch : undefined),
    fmt: (d) => (d.type === "compression" ? `${d.exitInch}"` : undefined),
  },
  {
    label: t.rows.compression.throat,
    num: (d) => (d.type === "compression" ? d.throatMm : undefined),
    fmt: (d) =>
      d.type === "compression" && d.throatMm !== undefined ? `${d.throatMm} mm` : undefined,
  },
  {
    label: t.rows.compression.voiceCoil,
    num: (d) => (d.type === "compression" ? d.voiceCoilMm : undefined),
    fmt: (d) => (d.type === "compression" ? `${d.voiceCoilMm} mm` : undefined),
  },
  {
    label: t.rows.compression.impedance,
    num: (d) => d.impedanceOhm,
    fmt: (d) => `${d.impedanceOhm} Ω`,
  },
  {
    label: t.rows.compression.lowEnd,
    num: (d) => (d.type === "compression" ? d.fLowHz : undefined),
    fmt: (d) => (d.type === "compression" ? `${d.fLowHz} Hz` : undefined),
  },
  {
    label: t.rows.compression.topEnd,
    num: (d) => (d.type === "compression" ? d.fHighHz : undefined),
    fmt: (d) => (d.type === "compression" ? `${d.fHighHz} Hz` : undefined),
  },
  {
    label: t.rows.compression.minCrossover,
    num: (d) => (d.type === "compression" ? d.minCrossoverHz : undefined),
    fmt: (d) => (d.type === "compression" ? `${d.minCrossoverHz} Hz` : undefined),
  },
  {
    label: t.rows.compression.crossoverSlope,
    num: (d) => (d.type === "compression" ? d.crossoverSlopeDbOct : undefined),
    fmt: (d) =>
      d.type === "compression" && d.crossoverSlopeDbOct !== undefined
        ? `${d.crossoverSlopeDbOct} dB/oct`
        : undefined,
  },
  {
    label: t.rows.compression.sensitivityHorn,
    num: (d) => (d.type === "compression" ? d.sensitivityHornDb : undefined),
    fmt: (d) => (d.type === "compression" ? `${d.sensitivityHornDb} dB` : undefined),
  },
  {
    label: t.rows.compression.fs,
    num: (d) => (d.type === "compression" ? d.fsHz : undefined),
    fmt: (d) => (d.type === "compression" && d.fsHz !== undefined ? `${d.fsHz} Hz` : undefined),
  },
  {
    label: t.rows.compression.magnet,
    num: () => undefined,
    fmt: (d) => (d.type === "compression" ? d.magnetMaterial : undefined),
  },
  {
    label: t.rows.compression.weight,
    num: (d) => (d.type === "compression" ? d.weightKg : undefined),
    fmt: (d) =>
      d.type === "compression" && d.weightKg !== undefined ? `${d.weightKg} kg` : undefined,
  },
  { label: t.rows.compression.powerAes, num: (d) => d.peW, fmt: (d) => `${d.peW} W` },
]);

// Axes and rows follow the selected kind; the picker locks to that kind once one is chosen.
function view(selected: Driver[], all: Driver[]): CompareView<Driver> {
  const activeType = selected[0]?.type ?? "cone";
  return {
    axes: activeType === "cone" ? CONE_AXES : COMP_AXES,
    rows: activeType === "cone" ? CONE_ROWS : COMP_ROWS,
    pool: all.filter((d) => d.type === activeType),
    note: tt(t.noteTemplate, { type: activeType }),
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
  addLabel={t.addLabel}
  backHref={`${localeBase}/drivers`}
  backLabel={t.backLabel}
  listLabel={t.listLabel}
  {tRadar}
  {optionLabel}
  {view}
  {sanitizeIds}
  csvExtra={[{ label: "type", value: (d) => d.type }]}
/>
