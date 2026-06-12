<script lang="ts">
import { onMount } from "svelte";
import { SERIES_COLORS } from "../lib/csv";
import { echarts, getActiveTheme } from "../lib/echarts";
import { downloadBlob, jsonString, toCsv } from "../lib/export";
import { BASE } from "../lib/site";
import ExportMenu from "./ExportMenu.svelte";

interface BaseDriver {
  id: string;
  type: "cone" | "compression";
  brand: string;
  model: string;
  impedanceOhm: number;
  peW: number;
  datasheetUrl?: string;
}
interface ConeDriver extends BaseDriver {
  type: "cone";
  sizeInch: number;
  fsHz: number;
  qts: number;
  qes?: number;
  qms?: number;
  vasL: number;
  sdCm2: number;
  xmaxMm: number;
  reOhm?: number;
  bl?: number;
  mmsG?: number;
  sensitivityDb: number;
}
interface CompressionDriver extends BaseDriver {
  type: "compression";
  exitInch: number;
  throatMm?: number;
  voiceCoilMm: number;
  fLowHz: number;
  fHighHz: number;
  minCrossoverHz: number;
  crossoverSlopeDbOct?: number;
  sensitivityHornDb: number;
  fsHz?: number;
  magnetMaterial?: string;
  weightKg?: number;
}
type Driver = ConeDriver | CompressionDriver;

// Cone and compression drivers have disjoint specs, so the radar axes and the parameter
// table are defined per type and chosen from the selected drivers' shared type. Getters
// (rather than keys) sidestep union indexing.
type Axis = {
  label: string;
  unit: string;
  invert: boolean;
  get: (d: Driver) => number | undefined;
};
type Row = {
  label: string;
  fmt: (d: Driver) => string | undefined;
  num: (d: Driver) => number | undefined;
};

const CONE_AXES: Axis[] = [
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

const COMP_AXES: Axis[] = [
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

const CONE_ROWS: Row[] = [
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

const COMP_ROWS: Row[] = [
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

let allDrivers: Driver[] = $state([]);
let selectedIds: string[] = $state([]);
let chartEl: HTMLDivElement | undefined = $state();
let chart: ReturnType<typeof echarts.init> | null = null;
let initialized = $state(false);
let copyDone = $state(false);

onMount(async () => {
  const params = new URLSearchParams(window.location.search);
  const ids = (params.get("ids") ?? "").split(",").filter(Boolean);

  const res = await fetch(`${BASE}/api/drivers.json`);
  allDrivers = await res.json();

  // A radar can only compare one driver kind; if a shared URL mixes types, keep the first.
  const valid = ids.filter((id) => allDrivers.some((d) => d.id === id));
  const firstType = allDrivers.find((d) => d.id === valid[0])?.type;
  selectedIds = valid.filter((id) => allDrivers.find((d) => d.id === id)?.type === firstType);
  initialized = true;

  document.addEventListener("boxdex:themechange", onThemeChange);
  return () => {
    document.removeEventListener("boxdex:themechange", onThemeChange);
    chart?.dispose();
  };
});

// Keep the selection in the URL so the share link is reproducible.
$effect(() => {
  if (!initialized) return;
  const qs = selectedIds.length > 0 ? `?ids=${selectedIds.join(",")}` : location.pathname;
  history.replaceState(null, "", qs);
});

async function copyLink() {
  await navigator.clipboard.writeText(window.location.href);
  copyDone = true;
  setTimeout(() => {
    copyDone = false;
  }, 1500);
}

function exportCsv() {
  const header = ["id", "type", "brand", "model", ...paramRows.map((r) => r.label), "datasheetUrl"];
  const rows: (string | number)[][] = [header];
  for (const d of selected) {
    rows.push([
      d.id,
      d.type,
      d.brand,
      d.model,
      ...paramRows.map((r) => r.num(d) ?? r.fmt(d) ?? ""),
      d.datasheetUrl ?? "",
    ]);
  }
  downloadBlob("boxdex-drivers.csv", "text/csv", toCsv(rows));
}

function exportJson() {
  downloadBlob(
    "boxdex-drivers.json",
    "application/json",
    jsonString({ ids: selectedIds, drivers: selected })
  );
}

const selected = $derived(
  selectedIds
    .map((id) => allDrivers.find((d) => d.id === id))
    .filter((d): d is Driver => d !== undefined)
);

// Axes and rows follow the selected kind; the picker locks to that kind once one is chosen.
const activeType = $derived(selected[0]?.type ?? "cone");
const axes = $derived(activeType === "cone" ? CONE_AXES : COMP_AXES);
const paramRows = $derived(activeType === "cone" ? CONE_ROWS : COMP_ROWS);

const available = $derived(
  allDrivers.filter(
    (d) => !selectedIds.includes(d.id) && (selected.length === 0 || d.type === activeType)
  )
);

function addDriver(id: string) {
  if (id && selectedIds.length < 4) selectedIds = [...selectedIds, id];
}

function removeDriver(id: string) {
  selectedIds = selectedIds.filter((x) => x !== id);
}

function buildRadarOption(drivers: Driver[]) {
  const { theme } = getActiveTheme();

  // Normalise against same-type drivers in the catalogue for a stable scale
  const pool = allDrivers.filter((d) => d.type === activeType);
  const maxVals = axes.map((ax) => Math.max(...pool.map((d) => ax.get(d) ?? 0)));

  const indicator = axes.map((ax) => ({ name: `${ax.label}\n(${ax.unit})`, max: 100 }));

  const series = drivers.map((d, i) => ({
    type: "radar" as const,
    name: d.model,
    data: [
      {
        name: d.model,
        value: axes.map((ax, j) => {
          const raw = ax.get(d) ?? 0;
          const norm = maxVals[j] > 0 ? (raw / maxVals[j]) * 100 : 0;
          return ax.invert ? 100 - norm : norm;
        }),
      },
    ],
    lineStyle: { color: SERIES_COLORS[i % SERIES_COLORS.length], width: 2 },
    areaStyle: { color: SERIES_COLORS[i % SERIES_COLORS.length], opacity: 0.08 },
    symbol: "circle",
    symbolSize: 5,
    itemStyle: { color: SERIES_COLORS[i % SERIES_COLORS.length] },
  }));

  return {
    ...theme,
    tooltip: { trigger: "item" },
    legend: {
      data: drivers.map((d) => d.model),
      bottom: 0,
      textStyle: { fontFamily: "var(--font-mono)", fontSize: 12 },
    },
    radar: {
      indicator,
      shape: "polygon",
      splitNumber: 4,
      axisName: { fontFamily: "var(--font-mono)", fontSize: 11 },
      splitLine: { lineStyle: { color: "rgba(128,128,128,0.2)" } },
      splitArea: { show: false },
      axisLine: { lineStyle: { color: "rgba(128,128,128,0.3)" } },
    },
    series,
  };
}

function onThemeChange() {
  if (!chartEl || selected.length === 0) return;
  chart?.dispose();
  const { theme } = getActiveTheme();
  chart = echarts.init(chartEl, theme);
  chart.setOption(buildRadarOption(selected), { notMerge: true });
}

$effect(() => {
  const el = chartEl;
  if (!el) return;
  const ro = new ResizeObserver(() => chart?.resize());
  ro.observe(el);
  return () => ro.disconnect();
});

$effect(() => {
  if (!chartEl || selected.length === 0) {
    chart?.dispose();
    chart = null;
    return;
  }
  if (!chart) {
    const { theme } = getActiveTheme();
    chart = echarts.init(chartEl, theme);
  }
  chart.setOption(buildRadarOption(selected), { notMerge: true });
});
</script>

<div class="page-header no-print">
  <button class="link-btn" onclick={copyLink}>{copyDone ? "copied!" : "⎘ share"}</button>
  <ExportMenu
    disabled={selected.length === 0}
    onCsv={exportCsv}
    onJson={exportJson}
    onPrint={() => window.print()}
  />
</div>

<div class="add-bar no-print">
  <span class="label">Add driver</span>
  <select
    onchange={(e) => {
      const sel = e.target as HTMLSelectElement;
      addDriver(sel.value);
      sel.value = "";
    }}
    disabled={selectedIds.length >= 4}
  >
    <option value="">— select —</option>
    {#each available as d}
      <option value={d.id}>
        {d.brand} {d.model} ({d.type === "cone" ? `${d.sizeInch}"` : `${d.exitInch}" exit`} / {d.impedanceOhm} Ω)
      </option>
    {/each}
  </select>
  <span class="count">{selected.length}/4</span>
  <a href={`${BASE}/drivers`} class="back-link">← all drivers</a>
</div>

{#if selected.length === 0}
  <div class="empty-state">
    {#if allDrivers.length === 0}
      Loading…
    {:else}
      Select at least one driver from the dropdown above, or go to the
      <a href={`${BASE}/drivers`}>driver list</a> and check boxes to compare.
    {/if}
  </div>
{:else}
  <div class="layout">
    <div class="params-wrap">
      <table>
        <thead>
          <tr>
            <th class="param-col">Parameter</th>
            {#each selected as d, i}
              <th style="color: {SERIES_COLORS[i % SERIES_COLORS.length]}">
                {d.model}
                <button class="remove-btn no-print" onclick={() => removeDriver(d.id)} title="Remove">×</button>
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each paramRows as row}
            {#if selected.some((d) => row.fmt(d) !== undefined)}
              <tr>
                <td class="param-label">{row.label}</td>
                {#each selected as d}
                  <td class="num">{row.fmt(d) ?? "—"}</td>
                {/each}
              </tr>
            {/if}
          {/each}
          <tr>
            <td class="param-label">Datasheet</td>
            {#each selected as d}
              <td>
                {#if d.datasheetUrl}
                  <a href={d.datasheetUrl} target="_blank" rel="noopener">↗ link</a>
                {:else}
                  —
                {/if}
              </td>
            {/each}
          </tr>
        </tbody>
      </table>
    </div>

    <div class="radar-wrap">
      <div bind:this={chartEl} class="radar-chart"></div>
      <p class="radar-note">
        All axes normalised to 100 = max across {activeType} drivers in the catalogue. Axes
        marked “(inv.)” are inverted, so a higher score means a lower value (better).
      </p>
    </div>
  </div>
{/if}

<style>
  /* Pin the action buttons to the top-right of the page, level with the <h1>
     (which the .astro page renders above this island). */
  .page-header {
    position: absolute;
    top: 0;
    right: 0;
    display: flex;
    gap: 0.5rem;
  }

  .link-btn {
    background: none;
    border: 1px solid var(--line);
    color: var(--muted);
    border-radius: 4px;
    padding: 0.3rem 0.75rem;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    cursor: pointer;
  }

  .link-btn:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .add-bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-bottom: 1.5rem;
    font-family: var(--font-mono);
    font-size: 0.875rem;
  }

  .label {
    color: var(--muted);
  }

  .count {
    color: var(--muted);
  }

  .back-link {
    margin-left: auto;
    color: var(--muted);
    font-size: 0.8rem;
    text-decoration: none;
  }

  .back-link:hover {
    color: var(--accent);
  }

  .layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
    align-items: start;
  }

  @media (max-width: 860px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }

  .params-wrap {
    overflow-x: auto;
  }

  .param-col {
    min-width: 7rem;
  }

  .param-label {
    color: var(--muted);
  }

  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .remove-btn {
    background: none;
    border: none;
    color: var(--muted);
    font-size: 1rem;
    padding: 0 0.2rem;
    margin-left: 0.25rem;
    line-height: 1;
    cursor: pointer;
  }

  .remove-btn:hover {
    color: var(--text);
  }

  .radar-wrap {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .radar-chart {
    width: 100%;
    height: 420px;
  }

  .radar-note {
    font-size: 0.75rem;
    color: var(--muted);
    font-family: var(--font-mono);
    margin: 0;
  }

  .empty-state {
    text-align: center;
    padding: 3rem;
    color: var(--muted);
    font-family: var(--font-mono);
    border: 1px dashed var(--line);
    border-radius: 6px;
  }
</style>
