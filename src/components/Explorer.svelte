<script lang="ts">
import { onMount } from "svelte";
import { type Translations, tt } from "../i18n";
import { CATEGORIES, type CategoryFilter } from "../lib/category";
import { withAll } from "../lib/combobox-items";
import { humanize } from "../lib/format";
import {
  axisComboboxItems,
  type EnclosureRecord,
  filterEnclosures,
  type MetricKey,
  metricKeyOf,
  sortRecords,
} from "../lib/metrics";
import { BASE } from "../lib/site";
import Combobox from "./Combobox.svelte";
import LoadMore, { ROW_LIMIT } from "./LoadMore.svelte";

let {
  t,
  localeBase,
  axisLabels,
}: {
  t: Translations["explorer"];
  localeBase: string;
  axisLabels: Translations["axisLabels"];
} = $props();

let records = $state<EnclosureRecord[]>([]);
let loading = $state(true);
let error = $state<string | null>(null);
let category = $state<CategoryFilter>("all");
let topology = $state("all");
let driverSize = $state("all");
let selectedTags = $state<string[]>([]);
let maxF3 = $state<number | "">("");
let minF3 = $state<number | "">("");
let minSpl = $state<number | "">("");
let minVol = $state<number | "">("");
let maxVol = $state<number | "">("");
let driverCountFilter = $state("all");
let hasMeasurementsOnly = $state(false);
let hasPlansOnly = $state(false);
let verifiedOnly = $state(false);
// Default sort: tops rank better by HF extension; everything else by volume. A writable
// $derived: switching category resets it, but the sort combobox can still override in between
// (Svelte discards the override the next time `category` actually changes).
const defaultSortKey = (cat: CategoryFilter): MetricKey => (cat === "top" ? "f3HzHigh" : "volumeL");
let sortKey: MetricKey = $derived(defaultSortKey(category));

const allTopologies = $derived([...new Set(records.map((r) => r.topology))].sort());

const allSizes = $derived(
  [...new Set(records.flatMap((r) => r.driverSizes))].sort((a, b) => a - b)
);

const allTags = $derived([...new Set(records.flatMap((r) => r.recommendedFor))].sort());

const categoryItems = $derived(
  withAll(CATEGORIES, (c) => ({ id: c, label: c[0].toUpperCase() + c.slice(1) }), t.all)
);

const topologyItems = $derived(
  withAll(allTopologies, (topo) => ({ id: topo, label: humanize(topo) }), t.all)
);

const driverSizeItems = $derived(
  withAll(allSizes, (s) => ({ id: String(s), label: `${s}"` }), t.all)
);

const sortKeyItems = $derived(axisComboboxItems(axisLabels));

const driverCountItems = $derived(
  withAll(["1", "2", "3", "4+"], (v) => ({ id: v, label: `${v}×` }), t.all)
);

onMount(async () => {
  try {
    const res = await fetch(`${BASE}/api/manifest.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    records = await res.json();
  } catch (e) {
    error = String(e);
  } finally {
    loading = false;
  }
});

// Render in ROW_LIMIT-row pages extended by the infinite-scroll sentinel; the catalog
// keeps growing and a single huge table render makes the page sluggish.
let limit = $state(ROW_LIMIT);
let tableWrap = $state<HTMLElement | undefined>(undefined);

const results = $derived(
  sortRecords(
    filterEnclosures(records, {
      category,
      topology,
      driverSize,
      driverCount: driverCountFilter,
      tags: selectedTags,
      minF3,
      maxF3,
      minSpl,
      minVol,
      maxVol,
      measuredOnly: hasMeasurementsOnly,
      plansOnly: hasPlansOnly,
      verifiedOnly,
    }),
    sortKey
  )
);

const visibleResults = $derived(results.slice(0, limit));

function clearFilters() {
  category = "all";
  topology = "all";
  driverSize = "all";
  driverCountFilter = "all";
  selectedTags = [];
  maxF3 = "";
  minF3 = "";
  minSpl = "";
  minVol = "";
  maxVol = "";
  hasMeasurementsOnly = false;
  hasPlansOnly = false;
  verifiedOnly = false;
}

function fmt(v: number | undefined, unit: string) {
  if (v === undefined) return "";
  return `${v} ${unit}`;
}

let showAdvanced = $state(false);

const basicFilterCount = $derived(
  (category !== "all" ? 1 : 0) + (topology !== "all" ? 1 : 0) + (driverSize !== "all" ? 1 : 0)
);

const advancedFilterCount = $derived(
  (driverCountFilter !== "all" ? 1 : 0) +
    selectedTags.length +
    (maxF3 !== "" ? 1 : 0) +
    (minF3 !== "" ? 1 : 0) +
    (minSpl !== "" ? 1 : 0) +
    (minVol !== "" ? 1 : 0) +
    (maxVol !== "" ? 1 : 0) +
    (hasMeasurementsOnly ? 1 : 0) +
    (hasPlansOnly ? 1 : 0) +
    (verifiedOnly ? 1 : 0)
);

const activeFilterCount = $derived(basicFilterCount + advancedFilterCount);
</script>

<div class="explorer">
  <div class="filters">
    <div class="filter-row">
      <label>
        <span>{t.category}</span>
        <Combobox
          items={categoryItems}
          getId={(i) => i.id}
          getLabel={(i) => i.label}
          value={category}
          searchable={false}
          onselect={(v) => (category = v as CategoryFilter)}
        />
      </label>
      <label>
        <span>{t.topology}</span>
        <Combobox
          items={topologyItems}
          getId={(i) => i.id}
          getLabel={(i) => i.label}
          value={topology}
          searchable={false}
          onselect={(v) => (topology = v)}
        />
      </label>
      <label>
        <span>{t.driverSize}</span>
        <Combobox
          items={driverSizeItems}
          getId={(i) => i.id}
          getLabel={(i) => i.label}
          value={driverSize}
          searchable={false}
          onselect={(v) => (driverSize = v)}
        />
      </label>
      <label>
        <span>{t.sortBy}</span>
        <Combobox
          items={sortKeyItems}
          getId={(i) => i.id}
          getLabel={(i) => i.label}
          value={sortKey}
          searchable={false}
          onselect={(v) => {
            const key = metricKeyOf(v);
            if (key) sortKey = key;
          }}
        />
      </label>
      <button
        class="advanced-toggle"
        class:active={showAdvanced}
        onclick={() => (showAdvanced = !showAdvanced)}
      >
        {t.advanced} {showAdvanced ? "▴" : "▾"}
        {#if !showAdvanced && advancedFilterCount > 0}
          <span class="advanced-toggle-count">{advancedFilterCount}</span>
        {/if}
      </button>
      {#if activeFilterCount > 0}
        <button class="clear-btn btn-ghost" onclick={clearFilters}>{tt(t.clearN, { n: activeFilterCount })}</button>
      {/if}
    </div>

    {#if showAdvanced}
      <div class="filter-row adv-row">
        <label>
          <span>{t.driverCount}</span>
          <Combobox
            items={driverCountItems}
            getId={(i) => i.id}
            getLabel={(i) => i.label}
            value={driverCountFilter}
            searchable={false}
            onselect={(v) => (driverCountFilter = v)}
          />
        </label>
        <label>
          <span>{t.f3Min}</span>
          <input type="number" min="10" max="500" placeholder="e.g. 30" bind:value={minF3} />
        </label>
        <label>
          <span>{t.f3Max}</span>
          <input type="number" min="10" max="500" placeholder="e.g. 80" bind:value={maxF3} />
        </label>
        <label>
          <span>{t.minSpl}</span>
          <input type="number" min="80" max="160" placeholder="e.g. 130" bind:value={minSpl} />
        </label>
        <label>
          <span>{t.volMin}</span>
          <input type="number" min="1" max="2000" placeholder="e.g. 50" bind:value={minVol} />
        </label>
        <label>
          <span>{t.volMax}</span>
          <input type="number" min="1" max="2000" placeholder="e.g. 300" bind:value={maxVol} />
        </label>
      </div>

      <div class="filter-row adv-row chips-row">
        <button class="chip" class:chip-active={hasMeasurementsOnly} aria-pressed={hasMeasurementsOnly} onclick={() => (hasMeasurementsOnly = !hasMeasurementsOnly)}>{t.measuredOnly}</button>
        <button class="chip" class:chip-active={hasPlansOnly} aria-pressed={hasPlansOnly} onclick={() => (hasPlansOnly = !hasPlansOnly)}>{t.hasPlans}</button>
        <button class="chip" class:chip-active={verifiedOnly} aria-pressed={verifiedOnly} onclick={() => (verifiedOnly = !verifiedOnly)}>{t.verifiedOnly}</button>
      </div>

      {#if allTags.length > 0}
        <div class="filter-row adv-row chips-row">
          {#each allTags as tag}
            <button
              class="chip"
              class:chip-active={selectedTags.includes(tag)}
              aria-pressed={selectedTags.includes(tag)}
              onclick={() => {
                selectedTags = selectedTags.includes(tag)
                  ? selectedTags.filter((x) => x !== tag)
                  : [...selectedTags, tag];
              }}
            >{tag}</button>
          {/each}
        </div>
      {/if}
    {/if}
  </div>

  {#if error}
    <div class="empty-state">{t.failedToLoad}</div>
  {:else if loading}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{t.columns.name}</th>
            <th>{t.columns.cat}</th>
            <th>{t.columns.plans}</th>
            <th>{t.columns.topology}</th>
            <th>{t.columns.drivers}</th>
            <th>{t.columns.volume}</th>
            <th>{t.columns.f3}</th>
            <th>{t.columns.maxSpl}</th>
            <th>{t.columns.provenance}</th>
            <th>{t.columns.tags}</th>
          </tr>
        </thead>
        <tbody>
          {#each { length: 8 } as _}
            <tr>
              {#each { length: 10 } as _}
                <td><div class="skeleton skel-cell"></div></td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else if results.length === 0}
    <div class="empty-state">{t.emptyState}</div>
  {:else}
    <p class="result-count" aria-live="polite" aria-atomic="true">{results.length} {results.length === 1 ? t.enclosure : t.enclosures} {t.found}</p>
    <div class="table-wrap" bind:this={tableWrap}>
      <table>
        <thead>
          <tr>
            <th>{t.columns.name}</th>
            <th>{t.columns.cat}</th>
            <th>{t.columns.plans}</th>
            <th>{t.columns.topology}</th>
            <th>{t.columns.drivers}</th>
            <th>{t.columns.volume}</th>
            <th>{t.columns.f3}</th>
            <th>{t.columns.maxSpl}</th>
            <th>{t.columns.provenance}</th>
            <th>{t.columns.tags}</th>
          </tr>
        </thead>
        <tbody>
          {#each visibleResults as rec (rec.slug)}
            <tr>
              <td>
                <a href="{localeBase}/enclosures/{rec.slug}">{rec.name}</a>
                {#if rec.verified}<span class="badge badge-verified ml">✓</span>{/if}
              </td>
              <td><span class="badge badge-{rec.category}">{rec.category}</span></td>
              <td class="plans-cell">
                <span class="plans-tick" class:plans-tick-on={rec.hasPlans} title={rec.hasPlans ? t.plansAvailable : ""}>{rec.hasPlans ? "✓" : ""}</span>
              </td>
              <td class="mono topo-cell">
                {humanize(rec.topology)}
                {#if rec.topologyVariant}<span class="muted"> · {rec.topologyVariant}</span>{/if}
              </td>
              <td class="mono">
                {rec.driverCount}×
                {#if rec.driverSizes.length > 0}
                  <span class="muted">{rec.driverSizes.map((s) => `${s}"`).join("+")}</span>
                {/if}
              </td>
              <td class="mono">{fmt(rec.metrics.volumeL, "")}</td>
              <td class="mono">{fmt(rec.metrics.f3Hz, "")}</td>
              <td class="mono">{fmt(rec.metrics.maxSplDb, "")}</td>
              <td>
                <span class="badge badge-{rec.provenance}">{rec.provenance}</span>
              </td>
              <td>
                <div class="tags">
                  {#each rec.recommendedFor.slice(0, 2) as tag}
                    <span class="tag">{tag}</span>
                  {/each}
                  {#if rec.recommendedFor.length > 2}
                    <button
                      type="button"
                      class="tag tag-more"
                      data-tip={rec.recommendedFor.slice(2).join(", ")}
                      aria-label={rec.recommendedFor.slice(2).join(", ")}
                    >+{rec.recommendedFor.length - 2}</button>
                  {/if}
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      <LoadMore
        remaining={results.length - visibleResults.length}
        onmore={() => (limit += ROW_LIMIT)}
        root={tableWrap}
      />
    </div>
  {/if}
</div>

<style>
  .explorer {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .filters {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 1rem;
  }

  .filter-row {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    align-items: flex-end;
  }

  .adv-row {
    padding-top: 0.5rem;
    border-top: 1px solid var(--line);
  }

  .advanced-toggle {
    align-self: flex-end;
  }

  .filters label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    color: var(--muted);
  }

  .filters input {
    width: 110px;
  }

  .chips-row {
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
  }

  .clear-btn {
    align-self: flex-end;
    margin-left: auto;
    padding: 0.3rem 0.75rem;
  }

  .table-wrap {
    overflow-x: auto;
    overflow-y: auto;
    max-height: 65vh;
    scrollbar-gutter: stable;
  }

  thead th {
    position: sticky;
    top: 0;
    background: var(--panel);
    z-index: 1;
    white-space: nowrap;
  }

  table td {
    vertical-align: top;
  }

  .mono {
    font-family: var(--font-mono);
  }

  .topo-cell {
    text-transform: capitalize;
    white-space: nowrap;
  }

  .muted {
    color: var(--muted);
  }

  .ml {
    margin-left: 0.3rem;
  }

  .plans-cell {
    text-align: center;
  }

  .plans-tick {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    border: 1px solid var(--line);
    border-radius: 3px;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    font-weight: 600;
    color: transparent;
    line-height: 1;
  }

  .plans-tick.plans-tick-on {
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    border-color: color-mix(in srgb, var(--accent) 50%, transparent);
    color: var(--accent);
    font-size: 0.85rem;
  }

  .tags {
    display: flex;
    flex-wrap: nowrap;
    gap: 0.25rem;
  }

  .tag {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
    background: var(--surface-subtle);
    border: 1px solid var(--line);
    color: var(--muted);
    white-space: nowrap;
  }

  /* No opacity dimming: it blended the already-tuned .tag text toward the page
     background and dropped contrast to ~2.3:1. Renders identically to a plain .tag. */
  .tag-more {
    position: relative;
    cursor: default;
    font: inherit;
    appearance: none;
    margin: 0;
  }

  .tag-more::after {
    content: attr(data-tip);
    position: absolute;
    bottom: calc(100% + 5px);
    right: 0;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 3px;
    padding: 0.2rem 0.5rem;
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--muted);
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.1s;
    z-index: 10;
  }

  .tag-more:hover::after,
  .tag-more:focus-visible::after {
    opacity: 1;
  }

  .skel-cell {
    height: 1rem;
    width: 100%;
  }
</style>
