<script lang="ts">
import { onMount } from "svelte";
import { SERIES_COLORS } from "../lib/csv";
import { type EChartsInstance, getActiveTheme } from "../lib/echarts";
import { downloadBlob, jsonString, recordsToCsv } from "../lib/export";
import { humanize } from "../lib/format";
import {
  AXIS_FIELDS,
  AXIS_MAP,
  type EnclosureRecord,
  frontierLine,
  type MetricKey,
  metricKeyOf,
  paretoFront,
} from "../lib/metrics";
import { BASE } from "../lib/site";
import { readParam, writeParams } from "../lib/url-state";
import EChart from "./EChart.svelte";
import ExportMenu from "./ExportMenu.svelte";
import PageActions from "./PageActions.svelte";

let records = $state<EnclosureRecord[]>([]);
let xKey = $state<MetricKey>("volumeL");
let yKey = $state<MetricKey>("maxSplDb");
let colorKey = $state<"topology" | "category">("topology");
let onlyPareto = $state(false);
let initialized = $state(false);

// Clicking a point opens the enclosure's plan page.
function onChartInit(chart: EChartsInstance) {
  chart.on("click", (p: { data?: { slug?: string } }) => {
    const slug = p.data?.slug;
    if (slug) location.href = `${BASE}/enclosures/${slug}`;
  });
}

onMount(async () => {
  const px = metricKeyOf(readParam("x") ?? "");
  const py = metricKeyOf(readParam("y") ?? "");
  const pc = readParam("color");
  if (px) xKey = px;
  if (py) yKey = py;
  if (pc === "topology" || pc === "category") colorKey = pc;
  if (readParam("pareto") === "1") onlyPareto = true;

  const res = await fetch(`${BASE}/api/manifest.json`);
  records = await res.json();

  initialized = true;
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

// Sync axis/colour/pareto selection to the URL so the share link is reproducible.
$effect(() => {
  if (!initialized) return;
  writeParams({
    x: xKey !== "volumeL" ? xKey : undefined,
    y: yKey !== "maxSplDb" ? yKey : undefined,
    color: colorKey !== "topology" ? colorKey : undefined,
    pareto: onlyPareto ? "1" : undefined,
  });
});
</script>

<div class="design-space">
  <PageActions>
    <ExportMenu
      disabled={records.length === 0}
      onCsv={exportCsv}
      onJson={exportJson}
      onPrint={() => window.print()}
    />
  </PageActions>
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

  {#if records.length > 0}
    <EChart option={buildOption} height={500} onInit={onChartInit} />
  {:else}
    <div class="chart-placeholder">Loading…</div>
  {/if}

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

  .chart-placeholder {
    height: 500px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--muted);
    font-family: var(--font-mono);
  }

  .note {
    font-size: 0.8rem;
    color: var(--muted);
    font-family: var(--font-mono);
    margin: 0;
  }
</style>
