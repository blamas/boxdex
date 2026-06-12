<script lang="ts">
import { onMount } from "svelte";
import { SERIES_COLORS } from "../lib/csv";
import { echarts, getActiveTheme } from "../lib/echarts";
import { downloadBlob, jsonString, recordsToCsv } from "../lib/export";
import { humanize } from "../lib/format";
import {
  AXIS_FIELDS,
  AXIS_MAP,
  type EnclosureRecord,
  frontierLine,
  paretoFront,
} from "../lib/metrics";
import { BASE } from "../lib/site";
import ExportMenu from "./ExportMenu.svelte";

let records = $state<EnclosureRecord[]>([]);
let xKey = $state("volumeL");
let yKey = $state("maxSplDb");
let colorKey = $state<"topology" | "category">("topology");
let onlyPareto = $state(false);

let host: HTMLDivElement;
let chart: ReturnType<typeof echarts.init> | null = null;
let initialized = $state(false);
let copyDone = $state(false);

async function copyLink() {
  await navigator.clipboard.writeText(window.location.href);
  copyDone = true;
  setTimeout(() => {
    copyDone = false;
  }, 1500);
}

function initChart() {
  const { theme } = getActiveTheme();
  chart?.dispose();
  chart = echarts.init(host, theme);
  chart.on("click", (p: { data?: { slug?: string } }) => {
    const slug = p.data?.slug;
    if (slug) location.href = `${BASE}/enclosures/${slug}`;
  });
}

onMount(async () => {
  const params = new URLSearchParams(window.location.search);
  const px = params.get("x");
  const py = params.get("y");
  const pc = params.get("color");
  if (px && AXIS_MAP.has(px)) xKey = px;
  if (py && AXIS_MAP.has(py)) yKey = py;
  if (pc === "topology" || pc === "category") colorKey = pc;
  if (params.get("pareto") === "1") onlyPareto = true;

  const res = await fetch(`${BASE}/api/manifest.json`);
  records = await res.json();

  initChart();
  initialized = true;

  const ro = new ResizeObserver(() => chart?.resize());
  ro.observe(host);

  function onThemeChange() {
    initChart();
    const opt = buildOption();
    if (chart && opt) chart.setOption(opt, { notMerge: true });
  }
  document.addEventListener("boxdex:themechange", onThemeChange);

  return () => {
    ro.disconnect();
    document.removeEventListener("boxdex:themechange", onThemeChange);
    chart?.dispose();
    chart = null;
  };
});

// Records currently plotted: eligible on both axes, optionally pareto-only.
function exportRecords(): EnclosureRecord[] {
  const eligible = records.filter(
    (r) => r.metrics[xKey] !== undefined && r.metrics[yKey] !== undefined
  );
  if (!onlyPareto) return eligible;
  const frontierSet = paretoFront(records, xKey, yKey);
  return eligible.filter((r) => frontierSet.has(records.indexOf(r)));
}

function exportCsv() {
  downloadBlob("boxdex-explore.csv", "text/csv", recordsToCsv(exportRecords()));
}

function exportJson() {
  const payload = { xKey, yKey, colorKey, onlyPareto, records: exportRecords() };
  downloadBlob("boxdex-explore.json", "application/json", jsonString(payload));
}

function buildOption() {
  if (records.length === 0) return null;

  const { accent } = getActiveTheme();

  const eligible = records.filter(
    (r) => r.metrics[xKey] !== undefined && r.metrics[yKey] !== undefined
  );
  const frontierSet = paretoFront(records, xKey, yKey);
  const frontier = frontierLine(records, frontierSet, xKey);

  const xField = AXIS_MAP.get(xKey) ?? AXIS_FIELDS[0];
  const yField = AXIS_MAP.get(yKey) ?? AXIS_FIELDS[0];

  const colorGroups = new Map<string, EnclosureRecord[]>();
  for (const rec of eligible) {
    const key = rec[colorKey];
    if (!colorGroups.has(key)) colorGroups.set(key, []);
    // biome-ignore lint/style/noNonNullAssertion: key was just set above
    const arr = colorGroups.get(key)!;
    if (!onlyPareto || frontierSet.has(records.indexOf(rec))) {
      arr.push(rec);
    }
  }

  // Live accent (theme-aware) for the first group, shared palette for the rest.
  const groupColors = [accent, ...SERIES_COLORS.slice(1)];
  const groupEntries = [...colorGroups.entries()];

  const scatterSeries = groupEntries.map(([gKey, recs], i) => ({
    name: humanize(gKey),
    type: "scatter",
    symbolSize: 12,
    data: recs.map((r) => ({
      value: [r.metrics[xKey], r.metrics[yKey]],
      slug: r.slug,
      name: r.name,
      category: r.category,
      topology: r.topology,
      provenance: r.provenance,
      symbol: r.provenance === "measured" ? "circle" : "triangle",
    })),
    itemStyle: { color: groupColors[i % groupColors.length] },
  }));

  const frontierLineData = frontier.map((r) => [r.metrics[xKey], r.metrics[yKey]]);
  const frontierRingData = frontier.map((r) => ({
    value: [r.metrics[xKey], r.metrics[yKey]],
    slug: r.slug,
  }));

  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      formatter: (p: { data: { name?: string; provenance?: string; value?: number[] } }) => {
        if (!p.data.name) return "";
        const xVal = p.data.value?.[0];
        const yVal = p.data.value?.[1];
        return [
          `<b>${p.data.name}</b>`,
          `Provenance: ${p.data.provenance}`,
          `${xField.label}: ${xVal} ${xField.unit}`,
          `${yField.label}: ${yVal} ${yField.unit}`,
        ].join("<br/>");
      },
    },
    legend: {},
    dataZoom: [
      { type: "inside", xAxisIndex: 0 },
      { type: "inside", yAxisIndex: 0 },
    ],
    toolbox: { feature: { saveAsImage: {}, brush: { type: ["rect", "clear"] } } },
    brush: { brushLink: "all" },
    grid: { left: 70, right: 20, top: 40, bottom: 50 },
    xAxis: {
      type: "value",
      scale: true,
      name: `${xField.label} (${xField.unit})`,
      nameLocation: "center",
      nameGap: 30,
    },
    yAxis: {
      type: "value",
      scale: true,
      name: `${yField.label} (${yField.unit})`,
    },
    series: [
      ...scatterSeries,
      {
        name: "Pareto frontier",
        type: "line",
        data: frontierLineData,
        showSymbol: false,
        lineStyle: { color: accent, type: "dashed", width: 1, opacity: 0.5 },
        z: 1,
      },
      {
        name: "Pareto",
        type: "scatter",
        data: frontierRingData,
        symbolSize: 20,
        itemStyle: { color: "transparent", borderColor: accent, borderWidth: 2 },
        z: 3,
        tooltip: { show: false },
        legend: { show: false },
      },
    ],
  };
}

$effect(() => {
  // Track reactive state so $effect re-runs on changes
  [records, xKey, yKey, colorKey, onlyPareto];
  const opt = buildOption();
  if (chart && opt) {
    chart.setOption(opt, { notMerge: true });
  }
});

// Sync axis/colour/pareto selection to the URL so the share link is reproducible.
$effect(() => {
  if (!initialized) return;
  const params = new URLSearchParams();
  if (xKey !== "volumeL") params.set("x", xKey);
  if (yKey !== "maxSplDb") params.set("y", yKey);
  if (colorKey !== "topology") params.set("color", colorKey);
  if (onlyPareto) params.set("pareto", "1");
  const qs = params.toString();
  history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
});
</script>

<div class="design-space">
  <div class="page-header no-print">
    <button class="link-btn" onclick={copyLink}>{copyDone ? "copied!" : "⎘ share"}</button>
    <ExportMenu
      disabled={records.length === 0}
      onCsv={exportCsv}
      onJson={exportJson}
      onPrint={() => window.print()}
    />
  </div>
  <div class="controls no-print">
    <label>
      <span>X axis</span>
      <select bind:value={xKey}>
        {#each AXIS_FIELDS as f}
          <option value={f.key}>{f.label} ({f.unit})</option>
        {/each}
      </select>
    </label>
    <label>
      <span>Y axis</span>
      <select bind:value={yKey}>
        {#each AXIS_FIELDS as f}
          <option value={f.key}>{f.label} ({f.unit})</option>
        {/each}
      </select>
    </label>
    <label>
      <span>Color by</span>
      <select bind:value={colorKey}>
        <option value="topology">Topology</option>
        <option value="category">Category</option>
      </select>
    </label>
    <label class="check-label">
      <input type="checkbox" bind:checked={onlyPareto} />
      Pareto frontier only
    </label>
  </div>

  <div bind:this={host} class="chart-host"></div>

  <p class="note">
    Ringed points are Pareto-optimal &mdash; circle = measured, triangle = simulated.
    Click a point to open its plan.
  </p>
</div>

<style>
  .design-space {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .controls {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    align-items: flex-end;
  }

  .controls label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    color: var(--muted);
  }

  .check-label {
    flex-direction: row !important;
    align-items: center;
    gap: 0.4rem;
    cursor: pointer;
    color: var(--text) !important;
    padding-top: 1.2rem;
  }

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

  .chart-host {
    width: 100%;
    height: 500px;
  }

  .note {
    font-size: 0.8rem;
    color: var(--muted);
    font-family: var(--font-mono);
    margin: 0;
  }
</style>
