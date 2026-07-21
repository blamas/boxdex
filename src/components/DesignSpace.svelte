<script lang="ts">
import { onMount } from "svelte";
import { type Translations, tt } from "../i18n";
import { type EChartsInstance, getActiveTheme } from "../lib/echarts";
import { downloadBlob, jsonString, recordsToCsv } from "../lib/export";
import { humanize } from "../lib/format";
import {
  AXIS_FIELDS,
  AXIS_MAP,
  axisComboboxItems,
  type EnclosureRecord,
  frontierLine,
  type MetricKey,
  metricKeyOf,
  paretoFront,
} from "../lib/metrics";
import { SERIES_COLORS } from "../lib/palette";
import { fetchJson } from "../lib/site";
import { readParam, writeParams } from "../lib/url-state";
import Combobox from "./Combobox.svelte";
import EChart from "./EChart.svelte";
import ExportMenu from "./ExportMenu.svelte";
import PageActions from "./PageActions.svelte";

interface Props {
  t: Translations["designSpace"];
  localeBase: string;
  categoryLabels: Translations["categoryLabels"];
  axisLabels: Translations["axisLabels"];
}

const { t, localeBase, categoryLabels, axisLabels }: Props = $props();

let records = $state<EnclosureRecord[]>([]);
let xKey = $state<MetricKey>("volumeL");
let yKey = $state<MetricKey>("maxSplDb");
let colorKey = $state<"topology" | "category">("topology");
let onlyPareto = $state(false);
let initialized = $state(false);
let error = $state<string | null>(null);

const axisItems = $derived(axisComboboxItems(axisLabels));

const colorByItems = $derived([
  { id: "topology", label: t.topology },
  { id: "category", label: t.category },
]);

// Clicking a point opens the enclosure's plan page.
function onChartInit(chart: EChartsInstance) {
  chart.on("click", (p: { data?: { slug?: string } }) => {
    const slug = p.data?.slug;
    if (slug) location.href = `${localeBase}/enclosures/${slug}`;
  });
}

onMount(async () => {
  try {
    const px = metricKeyOf(readParam("x") ?? "");
    const py = metricKeyOf(readParam("y") ?? "");
    const pc = readParam("color");
    if (px) xKey = px;
    if (py) yKey = py;
    if (pc === "topology" || pc === "category") colorKey = pc;
    if (readParam("pareto") === "1") onlyPareto = true;

    records = await fetchJson("/api/manifest.json");
  } catch (e) {
    error = String(e);
  } finally {
    initialized = true;
  }
});

// Records currently plotted: eligible on both axes, optionally pareto-only.
function exportRecords(): EnclosureRecord[] {
  const eligible = records.filter(
    (r) => r.metrics[xKey] !== undefined && r.metrics[yKey] !== undefined
  );
  if (!onlyPareto) return eligible;
  const frontierSet = paretoFront(records, xKey, yKey);
  const recordIndex = new Map(records.map((r, i) => [r, i]));
  return eligible.filter((r) => frontierSet.has(recordIndex.get(r) ?? -1));
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
  const xLabel = axisLabels[xKey as keyof typeof axisLabels] ?? xField.label;
  const yLabel = axisLabels[yKey as keyof typeof axisLabels] ?? yField.label;

  const recordIndex = new Map(records.map((r, i) => [r, i]));
  const colorGroups = new Map<string, EnclosureRecord[]>();
  for (const rec of eligible) {
    const key = rec[colorKey];
    if (!colorGroups.has(key)) colorGroups.set(key, []);
    if (!onlyPareto || frontierSet.has(recordIndex.get(rec) ?? -1)) {
      colorGroups.get(key)?.push(rec);
    }
  }

  // Live accent (theme-aware) for the first group, shared palette for the rest.
  const groupColors = [accent, ...SERIES_COLORS.slice(1)];
  const groupEntries = [...colorGroups.entries()];

  const scatterSeries = groupEntries.map(([gKey, recs], i) => ({
    name:
      colorKey === "category"
        ? (categoryLabels[gKey as keyof typeof categoryLabels] ?? humanize(gKey))
        : humanize(gKey),
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
          `${t.provenance}: ${p.data.provenance}`,
          `${xLabel}: ${xVal} ${xField.unit}`,
          `${yLabel}: ${yVal} ${yField.unit}`,
        ].join("<br/>");
      },
    },
    // Pushed down from the canvas edge so the topology items aren't cramped
    // against the controls above the chart.
    legend: { top: 16 },
    dataZoom: [
      { type: "inside", xAxisIndex: 0 },
      { type: "inside", yAxisIndex: 0 },
    ],
    toolbox: { feature: { saveAsImage: {}, brush: { type: ["rect", "clear"] } } },
    brush: { brushLink: "all" },
    // Extra top clearance keeps the plot clear of the legend above it.
    grid: { left: 70, right: 20, top: 72, bottom: 50 },
    xAxis: {
      type: "value",
      scale: true,
      name: `${xLabel} (${xField.unit})`,
      nameLocation: "center",
      nameGap: 30,
    },
    yAxis: {
      type: "value",
      scale: true,
      name: `${yLabel} (${yField.unit})`,
    },
    series: [
      ...scatterSeries,
      {
        name: t.paretoFrontier,
        type: "line",
        data: frontierLineData,
        showSymbol: false,
        lineStyle: { color: accent, type: "dashed", width: 1, opacity: 0.5 },
        z: 1,
      },
      {
        name: t.paretoLabel,
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
      <span>{t.xAxis}</span>
      <Combobox
        items={axisItems}
        getId={(i) => i.id}
        getLabel={(i) => i.label}
        value={xKey}
        searchable={false}
        onselect={(v) => {
          const key = metricKeyOf(v);
          if (key) xKey = key;
        }}
      />
    </label>
    <label>
      <span>{t.yAxis}</span>
      <Combobox
        items={axisItems}
        getId={(i) => i.id}
        getLabel={(i) => i.label}
        value={yKey}
        searchable={false}
        onselect={(v) => {
          const key = metricKeyOf(v);
          if (key) yKey = key;
        }}
      />
    </label>
    <label>
      <span>{t.colorBy}</span>
      <Combobox
        items={colorByItems}
        getId={(i) => i.id}
        getLabel={(i) => i.label}
        value={colorKey}
        searchable={false}
        onselect={(v) => {
          if (v === "topology" || v === "category") colorKey = v;
        }}
      />
    </label>
    <label class="check-label">
      <input type="checkbox" bind:checked={onlyPareto} />
      {t.paretoOnly}
    </label>
  </div>

  {#if error}
    <div class="empty-state">{t.failedToLoad}</div>
  {:else if records.length > 0}
    <EChart
      option={buildOption}
      ariaLabel={tt(t.chartAriaLabel, {
        x: axisLabels[xKey as keyof typeof axisLabels],
        y: axisLabels[yKey as keyof typeof axisLabels],
      })}
      height={500}
      onInit={onChartInit}
    />
  {:else}
    <div class="chart-placeholder skeleton" aria-hidden="true"></div>
  {/if}

  <p class="note">{t.note}</p>
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
    text-align: center;
    margin: 0;
  }
</style>
