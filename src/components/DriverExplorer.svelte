<script lang="ts">
import { onMount } from "svelte";
import { type Translations, tt } from "../i18n";
import { filterDrivers, filterHorns, mouthCm2, sortDrivers, sortHorns } from "../lib/catalog";
import { withAll } from "../lib/combobox-items";
import { ebp } from "../lib/driver";
import type { CompressionDriver, ConeDriver, Driver, Horn } from "../lib/schemas";
import { BASE } from "../lib/site";
import { readParam } from "../lib/url-state";
import Combobox from "./Combobox.svelte";
import LoadMore, { ROW_LIMIT } from "./LoadMore.svelte";

// Tabs select which catalog (and column/filter set) is active. Cone and compression are
// the two driver branches; horns are a separate collection rendered in the same page.
type Tab = "cone" | "compression" | "horn";
type SortKey = string;

let {
  t,
  localeBase,
}: {
  t: Translations["driverExplorer"];
  localeBase: string;
} = $props();

let drivers: Driver[] = $state([]);
let horns: Horn[] = $state([]);
let loading = $state(true);
let error = $state<string | null>(null);
let tab = $state<Tab>("cone");
let filterBrand = $state("all");
let filterSize = $state("all"); // size (cone) | exit (compression, horn)
let filterImpedance = $state("all");
let nameFilter = $state("");
// cone advanced
let maxFs = $state<number | "">("");
let minQts = $state<number | "">("");
let maxQts = $state<number | "">("");
let minXmax = $state<number | "">("");
let minPe = $state<number | "">("");
// compression advanced
let maxCrossover = $state<number | "">("");
let minSens = $state<number | "">("");
// horn
let filterProfile = $state("all");
let maxCutoff = $state<number | "">("");
let sortKey = $state<SortKey>("sizeInch");
let sortAsc = $state(true);
let selected = $state<Set<string>>(new Set());
let showAdvanced = $state(false);

onMount(async () => {
  const initial = readParam("tab");
  if (initial === "compression" || initial === "horn") {
    tab = initial;
    sortKey = "exitInch";
  }

  try {
    const [dRes, hRes] = await Promise.all([
      fetch(`${BASE}/api/drivers.json`),
      fetch(`${BASE}/api/horns.json`),
    ]);
    if (!dRes.ok) throw new Error(`HTTP ${dRes.status}`);
    if (!hRes.ok) throw new Error(`HTTP ${hRes.status}`);
    drivers = await dRes.json();
    horns = await hRes.json();
  } catch (e) {
    error = String(e);
  } finally {
    loading = false;
  }
});

const isCone = $derived(tab === "cone");
const isHorn = $derived(tab === "horn");

const ofType = $derived(isHorn ? [] : drivers.filter((d) => d.type === tab));

const brands = $derived(
  isHorn
    ? [...new Set(horns.map((h) => h.brand))].sort()
    : [...new Set(ofType.map((d) => d.brand))].sort()
);
const sizes = $derived(
  [
    ...new Set(ofType.filter((d): d is ConeDriver => d.type === "cone").map((d) => d.sizeInch)),
  ].sort((a, b) => a - b)
);
const exits = $derived(
  isHorn
    ? [...new Set(horns.map((h) => h.exitInch))].sort((a, b) => a - b)
    : [
        ...new Set(
          ofType
            .filter((d): d is CompressionDriver => d.type === "compression")
            .map((d) => d.exitInch)
        ),
      ].sort((a, b) => a - b)
);
const impedances = $derived([...new Set(ofType.map((d) => d.impedanceOhm))].sort((a, b) => a - b));
const profiles = $derived([...new Set(horns.map((h) => h.profile))].sort());

const brandItems = $derived(withAll(brands, (b) => ({ id: b, label: b }), t.all));
const sizeItems = $derived(withAll(sizes, (s) => ({ id: String(s), label: `${s}"` }), t.all));
const exitItems = $derived(withAll(exits, (s) => ({ id: String(s), label: `${s}"` }), t.all));
const profileItems = $derived(withAll(profiles, (p) => ({ id: p, label: p }), t.all));
const impedanceItems = $derived(
  withAll(impedances, (z) => ({ id: String(z), label: `${z} Ω` }), t.all)
);

const filtered = $derived(
  sortDrivers(
    filterDrivers(ofType, {
      brand: filterBrand,
      size: filterSize,
      impedance: filterImpedance,
      name: nameFilter,
      maxFs,
      minQts,
      maxQts,
      minXmax,
      minPe,
      maxCrossover,
      minSens,
    }),
    sortKey,
    sortAsc
  )
);

const filteredHorns = $derived(
  sortHorns(
    filterHorns(horns, {
      brand: filterBrand,
      exit: filterSize,
      profile: filterProfile,
      name: nameFilter,
      maxCutoff,
    }),
    sortKey,
    sortAsc
  )
);

const resultCount = $derived(isHorn ? filteredHorns.length : filtered.length);

// The full catalogue is ~800 rows and growing; rendering everything at once makes the
// page sluggish. Render in ROW_LIMIT-row pages extended by the infinite-scroll sentinel;
// filters/sort still see everything.
let limit = $state(ROW_LIMIT);
let tableWrap = $state<HTMLElement | undefined>(undefined);
const visibleDrivers = $derived(filtered.slice(0, limit));
const visibleHorns = $derived(filteredHorns.slice(0, limit));
const hiddenCount = $derived(resultCount - (isHorn ? visibleHorns.length : visibleDrivers.length));

const typeAdvancedFilterCount = $derived(
  isHorn
    ? 0
    : isCone
      ? (maxFs !== "" ? 1 : 0) +
        (minQts !== "" ? 1 : 0) +
        (maxQts !== "" ? 1 : 0) +
        (minXmax !== "" ? 1 : 0) +
        (minPe !== "" ? 1 : 0)
      : (maxCrossover !== "" ? 1 : 0) + (minSens !== "" ? 1 : 0)
);

const advancedFilterCount = $derived((nameFilter !== "" ? 1 : 0) + typeAdvancedFilterCount);

const activeFilterCount = $derived(
  (filterBrand !== "all" ? 1 : 0) +
    (filterSize !== "all" ? 1 : 0) +
    (filterImpedance !== "all" ? 1 : 0) +
    (isHorn ? (filterProfile !== "all" ? 1 : 0) + (maxCutoff !== "" ? 1 : 0) : 0) +
    advancedFilterCount
);

function clearFilters() {
  filterBrand = "all";
  filterSize = "all";
  filterImpedance = "all";
  nameFilter = "";
  maxFs = "";
  minQts = "";
  maxQts = "";
  minXmax = "";
  minPe = "";
  maxCrossover = "";
  minSens = "";
  filterProfile = "all";
  maxCutoff = "";
}

// Switching tab resets tab-specific filters, sort and selection (the catalogs aren't
// comparable on one radar, so a selection must stay within a single tab).
function setTab(nextTab: Tab) {
  if (nextTab === tab) return;
  tab = nextTab;
  clearFilters();
  selected = new Set();
  sortKey = nextTab === "cone" ? "sizeInch" : "exitInch";
  sortAsc = true;
  showAdvanced = false;
  limit = ROW_LIMIT;
}

function toggleSort(key: SortKey) {
  if (sortKey === key) sortAsc = !sortAsc;
  else {
    sortKey = key;
    sortAsc = true;
  }
}

function toggleSelect(id: string) {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else if (next.size < 4) next.add(id);
  selected = next;
}

function goCompare() {
  const ids = [...selected].join(",");
  const base = isHorn ? `${localeBase}/horns/compare` : `${localeBase}/drivers/compare`;
  window.location.href = `${base}?ids=${encodeURIComponent(ids)}`;
}

function sortIndicator(key: SortKey) {
  if (sortKey !== key) return "";
  return sortAsc ? " ↑" : " ↓";
}

function ariaSort(key: SortKey): "ascending" | "descending" | "none" {
  if (sortKey !== key) return "none";
  return sortAsc ? "ascending" : "descending";
}
</script>

<div class="tab-pills">
  <button class:active={tab === "cone"} onclick={() => setTab("cone")}>{t.tabs.cone}</button>
  <button class:active={tab === "compression"} onclick={() => setTab("compression")}>
    {t.tabs.compression}
  </button>
  <button class:active={tab === "horn"} onclick={() => setTab("horn")}>{t.tabs.horn}</button>
</div>

<div class="filters">
  <div class="filter-row">
    <label>
      {t.brand}
      <Combobox
        items={brandItems}
        getId={(i) => i.id}
        getLabel={(i) => i.label}
        value={filterBrand}
        searchable={false}
        maxVisible={brandItems.length}
        onselect={(v) => (filterBrand = v)}
      />
    </label>
    {#if isCone}
      <label>
        {t.size}
        <Combobox
          items={sizeItems}
          getId={(i) => i.id}
          getLabel={(i) => i.label}
          value={filterSize}
          searchable={false}
          onselect={(v) => (filterSize = v)}
        />
      </label>
    {:else}
      <label>
        {t.exit}
        <Combobox
          items={exitItems}
          getId={(i) => i.id}
          getLabel={(i) => i.label}
          value={filterSize}
          searchable={false}
          onselect={(v) => (filterSize = v)}
        />
      </label>
    {/if}
    {#if isHorn}
      <label>
        {t.profile}
        <Combobox
          items={profileItems}
          getId={(i) => i.id}
          getLabel={(i) => i.label}
          value={filterProfile}
          searchable={false}
          onselect={(v) => (filterProfile = v)}
        />
      </label>
      <label>
        {t.maxCutoff}
        <input type="number" min="100" max="5000" placeholder="e.g. 1000" bind:value={maxCutoff} />
      </label>
    {:else}
      <label>
        {t.impedance}
        <Combobox
          items={impedanceItems}
          getId={(i) => i.id}
          getLabel={(i) => i.label}
          value={filterImpedance}
          searchable={false}
          onselect={(v) => (filterImpedance = v)}
        />
      </label>
    {/if}
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
      <button class="clear-btn btn-ghost" onclick={clearFilters}>
        {tt(t.clearN, { n: activeFilterCount })}
      </button>
    {/if}
  </div>

  {#if showAdvanced}
    <div class="filter-row adv-row">
      <input
        type="text"
        class="name-filter-input"
        placeholder={t.search}
        aria-label={t.search}
        bind:value={nameFilter}
      />
    </div>
  {/if}

  {#if showAdvanced && !isHorn}
    <div class="filter-row adv-row">
      {#if isCone}
        <label>
          {t.advancedCone.maxFs}
          <input type="number" min="10" max="200" placeholder="e.g. 40" bind:value={maxFs} />
        </label>
        <label>
          {t.advancedCone.qtsMin}
          <input type="number" min="0" max="2" step="0.01" placeholder="e.g. 0.2" bind:value={minQts} />
        </label>
        <label>
          {t.advancedCone.qtsMax}
          <input type="number" min="0" max="2" step="0.01" placeholder="e.g. 0.7" bind:value={maxQts} />
        </label>
        <label>
          {t.advancedCone.minXmax}
          <input type="number" min="1" max="100" placeholder="e.g. 10" bind:value={minXmax} />
        </label>
        <label>
          {t.advancedCone.minPe}
          <input type="number" min="1" max="5000" placeholder="e.g. 500" bind:value={minPe} />
        </label>
      {:else}
        <label>
          {t.advancedComp.maxCrossover}
          <input type="number" min="100" max="5000" placeholder="e.g. 1200" bind:value={maxCrossover} />
        </label>
        <label>
          {t.advancedComp.minSens}
          <input type="number" min="90" max="120" placeholder="e.g. 108" bind:value={minSens} />
        </label>
      {/if}
    </div>
  {/if}

  <div class="filter-footer">
    {#if !loading}
      <span class="result-count" aria-live="polite" aria-atomic="true">
        {resultCount}
        {isHorn ? (resultCount === 1 ? t.horn : t.horns) : (resultCount === 1 ? t.driver : t.drivers)}
      </span>
    {/if}
    {#if selected.size > 0}
      <button class="compare-btn" onclick={goCompare}>
        {tt(t.compare, { n: selected.size })}
      </button>
    {/if}
  </div>
</div>

<div class="table-wrap" bind:this={tableWrap}>
  {#if error}
    <div class="empty-state">{t.failedToLoad}</div>
  {:else if loading}
    <div class="skel-table">
      {#each { length: 8 } as _}
        <div class="skel-row-wrap">
          <div class="skeleton skel-cell skel-cell-wide"></div>
          <div class="skeleton skel-cell"></div>
          <div class="skeleton skel-cell"></div>
          <div class="skeleton skel-cell"></div>
          <div class="skeleton skel-cell"></div>
        </div>
      {/each}
    </div>
  {:else if isHorn}
    <table>
      <thead>
        <tr>
          <th class="check-col"><span class="sr-only">{t.columns.select}</span></th>
          <th class="sortable" aria-sort={ariaSort("brand")}>
            <button type="button" onclick={() => toggleSort("brand")}>{t.columns.brandModel}{sortIndicator("brand")}</button>
          </th>
          <th class="sortable num" aria-sort={ariaSort("exitInch")}>
            <button type="button" onclick={() => toggleSort("exitInch")}>{t.columns.exit}{sortIndicator("exitInch")}</button>
          </th>
          <th class="sortable num" aria-sort={ariaSort("coverageHorizontalDeg")}>
            <button type="button" onclick={() => toggleSort("coverageHorizontalDeg")}>{t.columns.hDeg}{sortIndicator("coverageHorizontalDeg")}</button>
          </th>
          <th class="sortable num" aria-sort={ariaSort("coverageVerticalDeg")}>
            <button type="button" onclick={() => toggleSort("coverageVerticalDeg")}>{t.columns.vDeg}{sortIndicator("coverageVerticalDeg")}</button>
          </th>
          <th class="sortable num" aria-sort={ariaSort("cutoffHz")}>
            <button type="button" onclick={() => toggleSort("cutoffHz")}>{t.columns.cutoffHz}{sortIndicator("cutoffHz")}</button>
          </th>
          <th class="sortable num" aria-sort={ariaSort("mouthCm2")}>
            <button type="button" onclick={() => toggleSort("mouthCm2")}>{t.columns.mouthCm2}{sortIndicator("mouthCm2")}</button>
          </th>
          <th class="sortable num" aria-sort={ariaSort("depthMm")}>
            <button type="button" onclick={() => toggleSort("depthMm")}>{t.columns.depthMm}{sortIndicator("depthMm")}</button>
          </th>
          <th>{t.columns.profile}</th>
          <th>{t.columns.ds}</th>
        </tr>
      </thead>
      <tbody>
        {#each visibleHorns as h (h.id)}
          <tr class:row-selected={selected.has(h.id)}>
            <td class="check-col">
              <input
                type="checkbox"
                aria-label={tt(t.selectRow, { name: `${h.brand} ${h.model}` })}
                checked={selected.has(h.id)}
                disabled={!selected.has(h.id) && selected.size >= 4}
                onchange={() => toggleSelect(h.id)}
              />
            </td>
            <td class="name-cell">
              <a class="model" href="{localeBase}/horns/{h.id}"><span class="brand">{h.brand}</span> {h.model}</a>
            </td>
            <td class="num">{h.exitInch}"</td>
            <td class="num">{h.coverageHorizontalDeg}°</td>
            <td class="num">{h.coverageVerticalDeg}°</td>
            <td class="num">{h.cutoffHz}</td>
            <td class="num">{mouthCm2(h)}</td>
            <td class="num">{h.depthMm ?? ""}</td>
            <td>{h.profile}</td>
            <td>{#if h.datasheetUrl}<a href={h.datasheetUrl} target="_blank" rel="noopener" class="ds-link">↗</a>{/if}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {:else}
    <table>
      <thead>
        <tr>
          <th class="check-col"><span class="sr-only">{t.columns.select}</span></th>
          <th class="sortable" aria-sort={ariaSort("brand")}>
            <button type="button" onclick={() => toggleSort("brand")}>{t.columns.brandModel}{sortIndicator("brand")}</button>
          </th>
          {#if isCone}
            <th class="sortable num" aria-sort={ariaSort("sizeInch")}>
              <button type="button" onclick={() => toggleSort("sizeInch")}>{t.columns.size}{sortIndicator("sizeInch")}</button>
            </th>
            <th class="sortable num" aria-sort={ariaSort("impedanceOhm")}>
              <button type="button" onclick={() => toggleSort("impedanceOhm")}>{t.columns.impedanceOhm}{sortIndicator("impedanceOhm")}</button>
            </th>
            <th class="sortable num" aria-sort={ariaSort("fsHz")}>
              <button type="button" onclick={() => toggleSort("fsHz")}>{t.columns.fs}{sortIndicator("fsHz")}</button>
            </th>
            <th class="sortable num" aria-sort={ariaSort("qts")}>
              <button type="button" onclick={() => toggleSort("qts")}>{t.columns.qts}{sortIndicator("qts")}</button>
            </th>
            <th class="num" title={t.columns.ebpTitle}>{t.columns.ebp}</th>
            <th class="sortable num" aria-sort={ariaSort("vasL")}>
              <button type="button" onclick={() => toggleSort("vasL")}>{t.columns.vas}{sortIndicator("vasL")}</button>
            </th>
            <th class="sortable num" aria-sort={ariaSort("xmaxMm")}>
              <button type="button" onclick={() => toggleSort("xmaxMm")}>{t.columns.xmax}{sortIndicator("xmaxMm")}</button>
            </th>
            <th class="sortable num" aria-sort={ariaSort("peW")}>
              <button type="button" onclick={() => toggleSort("peW")}>{t.columns.pe}{sortIndicator("peW")}</button>
            </th>
            <th class="sortable num" aria-sort={ariaSort("sensitivityDb")}>
              <button type="button" onclick={() => toggleSort("sensitivityDb")}>{t.columns.sens}{sortIndicator("sensitivityDb")}</button>
            </th>
          {:else}
            <th class="sortable num" aria-sort={ariaSort("exitInch")}>
              <button type="button" onclick={() => toggleSort("exitInch")}>{t.columns.exit}{sortIndicator("exitInch")}</button>
            </th>
            <th class="sortable num" aria-sort={ariaSort("impedanceOhm")}>
              <button type="button" onclick={() => toggleSort("impedanceOhm")}>{t.columns.impedanceOhm}{sortIndicator("impedanceOhm")}</button>
            </th>
            <th class="sortable num" aria-sort={ariaSort("voiceCoilMm")}>
              <button type="button" onclick={() => toggleSort("voiceCoilMm")}>{t.columns.vcMm}{sortIndicator("voiceCoilMm")}</button>
            </th>
            <th class="sortable num" aria-sort={ariaSort("fLowHz")}>
              <button type="button" onclick={() => toggleSort("fLowHz")}>{t.columns.lowHz}{sortIndicator("fLowHz")}</button>
            </th>
            <th class="sortable num" aria-sort={ariaSort("fHighHz")}>
              <button type="button" onclick={() => toggleSort("fHighHz")}>{t.columns.highHz}{sortIndicator("fHighHz")}</button>
            </th>
            <th class="sortable num" aria-sort={ariaSort("minCrossoverHz")}>
              <button type="button" onclick={() => toggleSort("minCrossoverHz")}>{t.columns.minXover}{sortIndicator("minCrossoverHz")}</button>
            </th>
            <th class="sortable num" aria-sort={ariaSort("peW")}>
              <button type="button" onclick={() => toggleSort("peW")}>{t.columns.aesW}{sortIndicator("peW")}</button>
            </th>
            <th class="sortable num" aria-sort={ariaSort("sensitivityHornDb")}>
              <button type="button" onclick={() => toggleSort("sensitivityHornDb")}>{t.columns.sens}{sortIndicator("sensitivityHornDb")}</button>
            </th>
          {/if}
          <th>{t.columns.ds}</th>
        </tr>
      </thead>
      <tbody>
        {#each visibleDrivers as d (d.id)}
          <tr class:row-selected={selected.has(d.id)}>
            <td class="check-col">
              <input
                type="checkbox"
                aria-label={tt(t.selectRow, { name: `${d.brand} ${d.model}` })}
                checked={selected.has(d.id)}
                disabled={!selected.has(d.id) && selected.size >= 4}
                onchange={() => toggleSelect(d.id)}
              />
            </td>
            <td class="name-cell">
              <a class="model" href="{localeBase}/drivers/{d.id}"><span class="brand">{d.brand}</span> {d.model}</a>
            </td>
            {#if d.type === "cone"}
              <td class="num">{d.sizeInch}"</td>
              <td class="num">{d.impedanceOhm} Ω</td>
              <td class="num">{d.fsHz}</td>
              <td class="num">{d.qts}</td>
              <td class="num">{ebp(d.fsHz, d.qes) ?? ""}</td>
              <td class="num">{d.vasL}</td>
              <td class="num">{d.xmaxMm}</td>
              <td class="num">{d.peW}</td>
              <td class="num">{d.sensitivityDb}</td>
            {:else}
              <td class="num">{d.exitInch}"</td>
              <td class="num">{d.impedanceOhm} Ω</td>
              <td class="num">{d.voiceCoilMm}</td>
              <td class="num">{d.fLowHz}</td>
              <td class="num">{d.fHighHz}</td>
              <td class="num">{d.minCrossoverHz}</td>
              <td class="num">{d.peW}</td>
              <td class="num">{d.sensitivityHornDb}</td>
            {/if}
            <td>{#if d.datasheetUrl}<a href={d.datasheetUrl} target="_blank" rel="noopener" class="ds-link">↗</a>{/if}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
  <LoadMore remaining={hiddenCount} onmore={() => (limit += ROW_LIMIT)} root={tableWrap} />
</div>

{#if selected.size > 0}
  <p class="hint">{tt(t.maxComparers, { type: isHorn ? t.horns : t.drivers })}</p>
{/if}

<style>
  .tab-pills {
    margin-bottom: 1rem;
  }

  .filters {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 1rem;
    margin-bottom: 1rem;
  }

  .filter-row {
    display: flex;
    align-items: flex-end;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .filter-row:not(.adv-row) + .filter-row.adv-row {
    padding-top: 0.75rem;
    border-top: 1px solid var(--line);
  }

  .filter-row label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    color: var(--muted);
  }

  .filter-row input[type="number"] {
    width: 100px;
  }

  .adv-row input.name-filter-input {
    width: 100%;
    max-width: 440px;
    padding: 0.4rem 0.6rem;
    font-size: 0.9rem;
  }

  .filter-footer {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-family: var(--font-mono);
    font-size: 0.875rem;
  }

  .compare-btn {
    background: var(--accent);
    color: var(--bg);
    border: none;
    border-radius: 4px;
    padding: 0.35rem 0.9rem;
    font-family: var(--font-mono);
    font-size: 0.875rem;
    font-weight: 600;
  }

  .compare-btn:hover {
    opacity: 0.85;
  }


  .advanced-toggle {
    align-self: flex-end;
  }

  .clear-btn {
    align-self: flex-end;
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
  }

  th.sortable {
    white-space: nowrap;
  }

  th.sortable button {
    all: unset;
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
  }

  th.sortable button:hover,
  th.sortable button:focus-visible {
    color: var(--text);
  }

  th.sortable button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .check-col {
    width: 2rem;
    text-align: center;
  }

  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .row-selected td {
    background: var(--accent-subtle);
  }

  .name-cell {
    white-space: nowrap;
  }

  .brand {
    color: var(--muted);
  }

  .model {
    color: var(--text);
    font-weight: 500;
  }

  .ds-link {
    color: var(--muted);
    font-size: 0.75rem;
    text-decoration: none;
  }

  .ds-link:hover {
    color: var(--accent);
  }


  .hint {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    color: var(--muted);
    margin-top: 0.5rem;
  }

  .skel-table {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.5rem 0;
  }

  .skel-row-wrap {
    display: flex;
    gap: 1rem;
    align-items: center;
  }

  .skel-cell {
    flex: 1;
    height: 0.9rem;
  }
  .skel-cell-wide { flex: 3; }
</style>
