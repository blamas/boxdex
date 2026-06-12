<script lang="ts">
import { onMount } from "svelte";
import { CATEGORIES, type CategoryFilter } from "../lib/category";
import { humanize } from "../lib/format";
import {
  AXIS_FIELDS,
  type EnclosureRecord,
  filterEnclosures,
  type MetricKey,
  sortRecords,
} from "../lib/metrics";
import { BASE } from "../lib/site";

let records = $state<EnclosureRecord[]>([]);
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
let sortKey = $state<MetricKey>("volumeL");

const allTopologies = $derived([...new Set(records.map((r) => r.topology))].sort());

const allSizes = $derived(
  [...new Set(records.flatMap((r) => r.driverSizes))].sort((a, b) => a - b)
);

const allTags = $derived([...new Set(records.flatMap((r) => r.recommendedFor))].sort());

onMount(async () => {
  const res = await fetch(`${BASE}/api/manifest.json`);
  records = await res.json();
});

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
  if (v === undefined) return "—";
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
        <span>Category</span>
        <select bind:value={category}>
          <option value="all">All</option>
          {#each CATEGORIES as c}
            <option value={c}>{c[0].toUpperCase() + c.slice(1)}</option>
          {/each}
        </select>
      </label>
      <label>
        <span>Topology</span>
        <select bind:value={topology}>
          <option value="all">All</option>
          {#each allTopologies as t}
            <option value={t}>{humanize(t)}</option>
          {/each}
        </select>
      </label>
      <label>
        <span>Driver size</span>
        <select bind:value={driverSize}>
          <option value="all">All</option>
          {#each allSizes as s}
            <option value={s}>{s}"</option>
          {/each}
        </select>
      </label>
      <label>
        <span>Sort by</span>
        <select bind:value={sortKey}>
          {#each AXIS_FIELDS as f}
            <option value={f.key}>{f.label} ({f.unit})</option>
          {/each}
        </select>
      </label>
      <button
        class="advanced-toggle"
        class:active={showAdvanced}
        onclick={() => (showAdvanced = !showAdvanced)}
      >
        Advanced {showAdvanced ? "▴" : "▾"}
        {#if !showAdvanced && advancedFilterCount > 0}
          <span class="adv-badge">{advancedFilterCount}</span>
        {/if}
      </button>
      {#if activeFilterCount > 0}
        <button class="clear-btn" onclick={clearFilters}>Clear {activeFilterCount}</button>
      {/if}
    </div>

    {#if showAdvanced}
      <div class="filter-row adv-row">
        <label>
          <span>Driver count</span>
          <select bind:value={driverCountFilter}>
            <option value="all">All</option>
            <option value="1">1×</option>
            <option value="2">2×</option>
            <option value="3">3×</option>
            <option value="4+">4+×</option>
          </select>
        </label>
        <label>
          <span>F3 min (Hz)</span>
          <input type="number" min="10" max="500" placeholder="e.g. 30" bind:value={minF3} />
        </label>
        <label>
          <span>F3 max (Hz)</span>
          <input type="number" min="10" max="500" placeholder="e.g. 80" bind:value={maxF3} />
        </label>
        <label>
          <span>Min SPL (dB)</span>
          <input type="number" min="80" max="160" placeholder="e.g. 130" bind:value={minSpl} />
        </label>
        <label>
          <span>Vol min (L)</span>
          <input type="number" min="1" max="2000" placeholder="e.g. 50" bind:value={minVol} />
        </label>
        <label>
          <span>Vol max (L)</span>
          <input type="number" min="1" max="2000" placeholder="e.g. 300" bind:value={maxVol} />
        </label>
      </div>

      <div class="filter-row adv-row chips-row">
        <button class="chip" class:chip-active={hasMeasurementsOnly} onclick={() => (hasMeasurementsOnly = !hasMeasurementsOnly)}>Measured only</button>
        <button class="chip" class:chip-active={hasPlansOnly} onclick={() => (hasPlansOnly = !hasPlansOnly)}>Has plans</button>
        <button class="chip" class:chip-active={verifiedOnly} onclick={() => (verifiedOnly = !verifiedOnly)}>Verified only</button>
      </div>

      {#if allTags.length > 0}
        <div class="filter-row adv-row chips-row">
          {#each allTags as t}
            <button
              class="chip"
              class:chip-active={selectedTags.includes(t)}
              onclick={() => {
                selectedTags = selectedTags.includes(t)
                  ? selectedTags.filter((x) => x !== t)
                  : [...selectedTags, t];
              }}
            >{t}</button>
          {/each}
        </div>
      {/if}
    {/if}
  </div>

  {#if results.length === 0}
    <div class="empty-state">No enclosures match these constraints. Try loosening a filter.</div>
  {:else}
    <p class="count">{results.length} enclosure{results.length === 1 ? "" : "s"} found</p>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Cat</th>
            <th>Topology</th>
            <th>Drivers</th>
            <th>Volume (L)</th>
            <th>F3 (Hz)</th>
            <th>Max SPL (dB)</th>
            <th>Provenance</th>
            <th>Tags</th>
          </tr>
        </thead>
        <tbody>
          {#each results as rec}
            <tr>
              <td>
                <a href="{BASE}/enclosures/{rec.slug}">{rec.name}</a>
                {#if rec.verified}<span class="badge badge-verified ml">✓</span>{/if}
                {#if rec.hasPlans}<span class="plans-icon" title="Plans available">📐</span>{/if}
              </td>
              <td><span class="badge badge-{rec.category}">{rec.category}</span></td>
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
              <td class="tags">
                {#each rec.recommendedFor as t}
                  <span class="tag">{t}</span>
                {/each}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
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
    background: none;
    border: 1px solid var(--line);
    color: var(--muted);
    border-radius: 4px;
    padding: 0.3rem 0.7rem;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    align-self: flex-end;
  }

  .advanced-toggle:hover,
  .advanced-toggle.active {
    border-color: var(--accent);
    color: var(--accent);
  }

  .adv-badge {
    background: var(--accent);
    color: var(--bg);
    border-radius: 3px;
    padding: 0 0.3rem;
    font-size: 0.7rem;
    font-weight: 700;
    line-height: 1.4;
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

  .chips-section-label {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--muted);
    margin-right: 0.25rem;
    white-space: nowrap;
  }

  .chip {
    background: none;
    border: 1px solid var(--line);
    color: var(--muted);
    border-radius: 3px;
    padding: 0.2rem 0.55rem;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    cursor: pointer;
    transition: border-color 0.1s, color 0.1s;
  }

  .chip:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .chip-active {
    border-color: var(--accent);
    color: var(--accent);
    background: rgba(57, 255, 20, 0.07);
  }

  :global([data-theme="light"]) .chip-active {
    background: rgba(26, 127, 55, 0.07);
  }

  .clear-btn {
    align-self: flex-end;
    margin-left: auto;
    background: none;
    border: 1px solid var(--line);
    color: var(--muted);
    border-radius: 4px;
    padding: 0.3rem 0.75rem;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    cursor: pointer;
  }

  .clear-btn:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .count {
    font-family: var(--font-mono);
    font-size: 0.875rem;
    color: var(--muted);
    margin: 0;
  }

  .table-wrap {
    overflow-x: auto;
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

  .plans-icon {
    font-size: 0.75rem;
    margin-left: 0.3rem;
    opacity: 0.6;
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
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
</style>
