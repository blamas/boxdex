<script lang="ts">
import { onMount } from "svelte";
import { SERIES_COLORS } from "../lib/csv";
import { echarts, getActiveTheme } from "../lib/echarts";
import { downloadBlob, jsonString, toCsv } from "../lib/export";
import { BASE } from "../lib/site";
import ExportMenu from "./ExportMenu.svelte";

interface Horn {
  id: string;
  brand: string;
  model: string;
  exitInch: number;
  coverageHorizontalDeg: number;
  coverageVerticalDeg: number;
  cutoffHz: number;
  mouthWmm: number;
  mouthHmm: number;
  depthMm?: number;
  profile: string;
  constantDirectivity?: boolean;
  material?: string;
  weightKg?: number;
  datasheetUrl?: string;
}

type Axis = { label: string; unit: string; invert: boolean; get: (h: Horn) => number | undefined };
type Row = {
  label: string;
  fmt: (h: Horn) => string | undefined;
  num: (h: Horn) => number | undefined;
};

const mouthCm2 = (h: Horn) => Math.round((h.mouthWmm * h.mouthHmm) / 100);

const AXES: Axis[] = [
  { label: "Coverage H", unit: "°", invert: false, get: (h) => h.coverageHorizontalDeg },
  { label: "Coverage V", unit: "°", invert: false, get: (h) => h.coverageVerticalDeg },
  // lower flare cutoff = lower usable reach; invert so "more" = better extension
  { label: "Cutoff (inv.)", unit: "Hz", invert: true, get: (h) => h.cutoffHz },
  { label: "Mouth", unit: "cm²", invert: false, get: (h) => mouthCm2(h) },
  // shallower is generally desirable for a tidy top; invert
  { label: "Depth (inv.)", unit: "mm", invert: true, get: (h) => h.depthMm },
];

const ROWS: Row[] = [
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

let allHorns: Horn[] = $state([]);
let selectedIds: string[] = $state([]);
let chartEl: HTMLDivElement | undefined = $state();
let chart: ReturnType<typeof echarts.init> | null = null;
let initialized = $state(false);
let copyDone = $state(false);

onMount(async () => {
  const params = new URLSearchParams(window.location.search);
  const ids = (params.get("ids") ?? "").split(",").filter(Boolean);

  const res = await fetch(`${BASE}/api/horns.json`);
  allHorns = await res.json();

  selectedIds = ids.filter((id) => allHorns.some((h) => h.id === id));
  initialized = true;

  document.addEventListener("boxdex:themechange", onThemeChange);
  return () => {
    document.removeEventListener("boxdex:themechange", onThemeChange);
    chart?.dispose();
  };
});

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
  const header = ["id", "brand", "model", ...ROWS.map((r) => r.label), "datasheetUrl"];
  const rows: (string | number)[][] = [header];
  for (const h of selected) {
    rows.push([
      h.id,
      h.brand,
      h.model,
      ...ROWS.map((r) => r.num(h) ?? r.fmt(h) ?? ""),
      h.datasheetUrl ?? "",
    ]);
  }
  downloadBlob("boxdex-horns.csv", "text/csv", toCsv(rows));
}

function exportJson() {
  downloadBlob(
    "boxdex-horns.json",
    "application/json",
    jsonString({ ids: selectedIds, horns: selected })
  );
}

const selected = $derived(
  selectedIds
    .map((id) => allHorns.find((h) => h.id === id))
    .filter((h): h is Horn => h !== undefined)
);

const available = $derived(allHorns.filter((h) => !selectedIds.includes(h.id)));

function addHorn(id: string) {
  if (id && selectedIds.length < 4) selectedIds = [...selectedIds, id];
}

function removeHorn(id: string) {
  selectedIds = selectedIds.filter((x) => x !== id);
}

function buildRadarOption(horns: Horn[]) {
  const { theme } = getActiveTheme();

  const maxVals = AXES.map((ax) => Math.max(...allHorns.map((h) => ax.get(h) ?? 0)));
  const indicator = AXES.map((ax) => ({ name: `${ax.label}\n(${ax.unit})`, max: 100 }));

  const series = horns.map((h, i) => ({
    type: "radar" as const,
    name: h.model,
    data: [
      {
        name: h.model,
        value: AXES.map((ax, j) => {
          const raw = ax.get(h) ?? 0;
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
      data: horns.map((h) => h.model),
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
  <span class="label">Add horn</span>
  <select
    onchange={(e) => {
      const sel = e.target as HTMLSelectElement;
      addHorn(sel.value);
      sel.value = "";
    }}
    disabled={selectedIds.length >= 4}
  >
    <option value="">— select —</option>
    {#each available as h}
      <option value={h.id}>
        {h.brand} {h.model} ({h.exitInch}" exit / {h.coverageHorizontalDeg}°×{h.coverageVerticalDeg}°)
      </option>
    {/each}
  </select>
  <span class="count">{selected.length}/4</span>
  <a href={`${BASE}/drivers?tab=horn`} class="back-link">← all horns</a>
</div>

{#if selected.length === 0}
  <div class="empty-state">
    {#if allHorns.length === 0}
      Loading…
    {:else}
      Select at least one horn from the dropdown above, or go to the
      <a href={`${BASE}/drivers?tab=horn`}>horn list</a> and check boxes to compare.
    {/if}
  </div>
{:else}
  <div class="layout">
    <div class="params-wrap">
      <table>
        <thead>
          <tr>
            <th class="param-col">Parameter</th>
            {#each selected as h, i}
              <th style="color: {SERIES_COLORS[i % SERIES_COLORS.length]}">
                {h.model}
                <button class="remove-btn no-print" onclick={() => removeHorn(h.id)} title="Remove">×</button>
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each ROWS as row}
            {#if selected.some((h) => row.fmt(h) !== undefined)}
              <tr>
                <td class="param-label">{row.label}</td>
                {#each selected as h}
                  <td class="num">{row.fmt(h) ?? "—"}</td>
                {/each}
              </tr>
            {/if}
          {/each}
          <tr>
            <td class="param-label">Datasheet</td>
            {#each selected as h}
              <td>
                {#if h.datasheetUrl}
                  <a href={h.datasheetUrl} target="_blank" rel="noopener">↗ link</a>
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
        All axes normalised to 100 = max across horns in the catalogue. Axes marked “(inv.)”
        are inverted, so a higher score means a lower value (better).
      </p>
    </div>
  </div>
{/if}

<style>
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
