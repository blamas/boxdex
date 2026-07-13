<script lang="ts" generics="T extends CompareItem">
import { onMount } from "svelte";
import { type Translations, tt } from "../i18n";
import { getActiveTheme } from "../lib/echarts";
import { downloadBlob, jsonString, toCsv } from "../lib/export";
import { SERIES_COLORS } from "../lib/palette";
import { axisMaxima, type CompareItem, type CompareView, radarValues } from "../lib/radar";
import { BASE } from "../lib/site";
import { readParam, writeParams } from "../lib/url-state";
import Combobox from "./Combobox.svelte";
import EChart from "./EChart.svelte";
import ExportMenu from "./ExportMenu.svelte";
import PageActions from "./PageActions.svelte";

interface Props {
  fetchPath: string; // BASE-relative JSON endpoint, e.g. "/api/drivers.json"
  exportName: string; // "drivers" → boxdex-drivers.csv/.json and the JSON payload key
  addLabel: string;
  backHref: string; // catalogue page, used by the back link and the empty state
  backLabel: string;
  listLabel: string;
  tRadar: Translations["radarCompare"];
  optionLabel: (item: T) => string;
  view: (selected: T[], all: T[]) => CompareView<T>;
  // Turn ?ids= into the initial selection. Default keeps ids that exist; drivers
  // additionally lock a mixed-type share link to the first item's kind.
  sanitizeIds?: (ids: string[], all: T[]) => string[];
  // Extra identity columns between "id" and "brand" in the CSV export.
  csvExtra?: { label: string; value: (item: T) => string | number }[];
  // Optional: re-order the available pool before it hits the combobox.
  // Receives items not yet selected and the anchor (first selected) item.
  sortPool?: (available: T[], anchor: T) => T[];
  // Optional: produce a detail-page URL for each item; enables the name header link.
  detailHref?: (item: T) => string;
}

const {
  fetchPath,
  exportName,
  addLabel,
  backHref,
  backLabel,
  listLabel,
  tRadar,
  optionLabel,
  view,
  sanitizeIds = (ids, all) => ids.filter((id) => all.some((item) => item.id === id)),
  csvExtra = [],
  sortPool,
  detailHref,
}: Props = $props();

let all = $state<T[]>([]);
let error = $state<string | null>(null);
let selectedIds = $state<string[]>([]);
let initialized = $state(false);

onMount(async () => {
  try {
    const ids = (readParam("ids") ?? "").split(",").filter(Boolean);
    const res = await fetch(`${BASE}${fetchPath}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    all = await res.json();
    selectedIds = sanitizeIds(ids, all);
  } catch (e) {
    error = String(e);
  } finally {
    initialized = true;
  }
});

// Keep the selection in the URL so the share link is reproducible.
$effect(() => {
  if (!initialized) return;
  writeParams({
    ids: selectedIds.length > 0 ? selectedIds.join(",") : undefined,
  });
});

const selected = $derived(
  selectedIds.map((id) => all.find((item) => item.id === id)).filter((item) => item !== undefined)
);

const v = $derived(view(selected, all));

const available = $derived.by(() => {
  const pool = all.filter(
    (item) => !selectedIds.includes(item.id) && (v.selectable?.(item) ?? true)
  );
  return sortPool && selected.length > 0 ? sortPool(pool, selected[0]) : pool;
});

function addItem(id: string) {
  if (id && selectedIds.length < 4) selectedIds = [...selectedIds, id];
}

function removeItem(id: string) {
  selectedIds = selectedIds.filter((x) => x !== id);
}

function exportCsv() {
  const header = [
    "id",
    ...csvExtra.map((c) => c.label),
    "brand",
    "model",
    ...v.rows.map((r) => r.label),
    "datasheetUrl",
  ];
  const rows: (string | number)[][] = [header];
  for (const item of selected) {
    rows.push([
      item.id,
      ...csvExtra.map((c) => c.value(item)),
      item.brand,
      item.model,
      ...v.rows.map((r) => r.num(item) ?? r.fmt(item) ?? ""),
      item.datasheetUrl ?? "",
    ]);
  }
  downloadBlob(`boxdex-${exportName}.csv`, "text/csv", toCsv(rows));
}

function exportJson() {
  downloadBlob(
    `boxdex-${exportName}.json`,
    "application/json",
    jsonString({ ids: selectedIds, [exportName]: selected })
  );
}

function buildRadarOption() {
  const { theme } = getActiveTheme();
  const maxima = axisMaxima(v.pool, v.axes);

  return {
    ...theme,
    tooltip: { trigger: "item" },
    legend: {
      data: selected.map((item) => item.model),
      bottom: 0,
      textStyle: { fontFamily: "var(--font-mono)", fontSize: 12 },
    },
    radar: {
      indicator: v.axes.map((ax) => ({
        name: `${ax.label}\n(${ax.unit})`,
        max: 100,
      })),
      shape: "polygon",
      // Fill the taller canvas; centre sits slightly high to clear the bottom legend.
      radius: "72%",
      center: ["50%", "47%"],
      splitNumber: 4,
      axisName: {
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        color: theme.textStyle.color,
      },
      splitLine: {
        lineStyle: { color: theme.tooltip.borderColor },
      },
      splitArea: { show: false },
      axisLine: {
        lineStyle: { color: theme.valueAxis.axisLabel.color },
      },
    },
    series: selected.map((item, i) => ({
      type: "radar" as const,
      name: item.model,
      data: [{ name: item.model, value: radarValues(item, v.axes, maxima) }],
      lineStyle: { color: SERIES_COLORS[i % SERIES_COLORS.length], width: 2 },
      areaStyle: {
        color: SERIES_COLORS[i % SERIES_COLORS.length],
        opacity: 0.08,
      },
      symbol: "circle",
      symbolSize: 5,
      itemStyle: { color: SERIES_COLORS[i % SERIES_COLORS.length] },
    })),
  };
}
</script>

<PageActions>
  <ExportMenu
    disabled={selected.length === 0}
    onCsv={exportCsv}
    onJson={exportJson}
    onPrint={() => window.print()}
  />
</PageActions>

<div class="add-bar no-print">
  <span class="label">{addLabel}</span>
  <div class="combobox-wrap">
    <Combobox
      items={available}
      getId={(item) => item.id}
      getLabel={optionLabel}
      value=""
      placeholder={tRadar.selectPlaceholder}
      disabled={selectedIds.length >= 4}
      onselect={addItem}
    />
  </div>
  <span class="result-count">{selected.length}/4</span>
  <a href={backHref} class="back-link">{backLabel}</a>
</div>

{#if error}
  <div class="empty-state">{tRadar.failedToLoad}</div>
{:else if selected.length === 0}
  <div class="empty-state">
    {#if all.length === 0}
      {tRadar.loading}
    {:else}
      {@const [before, after] = tRadar.selectPrompt.split('{listLabel}')}
      {before}<a href={backHref}>{listLabel}</a>{after ?? ''}
    {/if}
  </div>
{:else}
  <div class="layout">
    <div class="params-wrap">
      <table>
        <thead>
          <tr>
            <th class="param-col">{tRadar.model}</th>
            {#each selected as item, i}
              <th class="item-col" style="color: {SERIES_COLORS[i % SERIES_COLORS.length]}">
                <div class="item-header">
                  {#if detailHref}
                    <a class="item-link" href={detailHref(item)}>{item.model}</a>
                  {:else}
                    {item.model}
                  {/if}
                  <button class="remove-btn no-print" onclick={() => removeItem(item.id)} title={tRadar.remove} aria-label={tt(tRadar.removeItem, { name: item.model })}>×</button>
                </div>
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="param-label">{tRadar.brand}</td>
            {#each selected as item}
              <td class="num">{item.brand}</td>
            {/each}
          </tr>
          {#each v.rows as row}
            {#if selected.some((item) => row.fmt(item) !== undefined)}
              <tr>
                <td class="param-label">{row.label}</td>
                {#each selected as item}
                  <td class="num">{row.fmt(item) ?? ""}</td>
                {/each}
              </tr>
            {/if}
          {/each}
          <tr>
            <td class="param-label">{tRadar.datasheet}</td>
            {#each selected as item}
              <td class="num">
                {#if item.datasheetUrl}
                  <a href={item.datasheetUrl} target="_blank" rel="noopener"
                    >{tRadar.link}</a
                  >
                {/if}
              </td>
            {/each}
          </tr>
        </tbody>
      </table>
    </div>

    <div class="radar-wrap">
      <EChart option={buildRadarOption} height={560} />
      <p class="radar-note">{v.note}</p>
    </div>
  </div>
{/if}

<style>
  .add-bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-bottom: 1.5rem;
    font-family: var(--font-mono);
    font-size: 0.875rem;
  }

  .combobox-wrap {
    min-width: 220px;
  }

  .label {
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

  .item-col {
    text-align: right;
  }

  .item-link {
    color: inherit;
  }

thead {
    border-bottom: 1px solid var(--line);
  }

  .param-label {
    color: var(--muted);
  }

  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .item-header {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .remove-btn {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.4rem;
    height: 1.4rem;
    background: none;
    border: 1px solid var(--line);
    border-radius: 3px;
    color: var(--muted);
    font-size: 0.9rem;
    padding: 0;
    cursor: pointer;
    line-height: 1;
  }

  .remove-btn:hover {
    border-color: var(--text);
    color: var(--text);
  }

  .radar-wrap {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .radar-note {
    font-size: 0.75rem;
    color: var(--muted);
    font-family: var(--font-mono);
    margin: 0;
    text-align: center;
  }
</style>
