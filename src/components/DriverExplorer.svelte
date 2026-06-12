<script lang="ts">
import { onMount } from "svelte";
import { ebp } from "../lib/driver";
import { BASE } from "../lib/site";

interface BaseDriver {
  id: string;
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
  vasL: number;
  sdCm2: number;
  xmaxMm: number;
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

// Tabs select which catalog (and column/filter set) is active. Cone and compression are
// the two driver branches; horns are a separate collection rendered in the same page.
type Tab = "cone" | "compression" | "horn";
type SortKey = string;

let drivers: Driver[] = $state([]);
let horns: Horn[] = $state([]);
let tab = $state<Tab>("cone");
let filterBrand = $state("all");
let filterSize = $state("all"); // size (cone) | exit (compression, horn)
let filterImpedance = $state("all");
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
  const initial = new URLSearchParams(window.location.search).get("tab");
  if (initial === "compression" || initial === "horn") {
    tab = initial;
    sortKey = "exitInch";
  }

  const [dRes, hRes] = await Promise.all([
    fetch(`${BASE}/api/drivers.json`),
    fetch(`${BASE}/api/horns.json`),
  ]);
  drivers = await dRes.json();
  horns = await hRes.json();
});

const isCone = $derived(tab === "cone");
const isHorn = $derived(tab === "horn");
const mouthCm2 = (h: Horn) => Math.round((h.mouthWmm * h.mouthHmm) / 100);

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

// Per-column value getters so sorting works across the disjoint field sets.
function sortValue(d: Driver, key: SortKey): number | string | undefined {
  if (key === "brand") return d.brand;
  if (key === "model") return d.model;
  if (key === "impedanceOhm") return d.impedanceOhm;
  if (key === "peW") return d.peW;
  if (d.type === "cone") {
    if (key === "sizeInch") return d.sizeInch;
    if (key === "fsHz") return d.fsHz;
    if (key === "qts") return d.qts;
    if (key === "vasL") return d.vasL;
    if (key === "xmaxMm") return d.xmaxMm;
    if (key === "sensitivityDb") return d.sensitivityDb;
  } else {
    if (key === "exitInch") return d.exitInch;
    if (key === "voiceCoilMm") return d.voiceCoilMm;
    if (key === "fLowHz") return d.fLowHz;
    if (key === "fHighHz") return d.fHighHz;
    if (key === "minCrossoverHz") return d.minCrossoverHz;
    if (key === "sensitivityHornDb") return d.sensitivityHornDb;
  }
  return undefined;
}

function hornSortValue(h: Horn, key: SortKey): number | string {
  if (key === "brand") return h.brand;
  if (key === "mouthCm2") return mouthCm2(h);
  if (key === "depthMm") return h.depthMm ?? 0;
  if (key === "exitInch") return h.exitInch;
  if (key === "coverageHorizontalDeg") return h.coverageHorizontalDeg;
  if (key === "coverageVerticalDeg") return h.coverageVerticalDeg;
  if (key === "cutoffHz") return h.cutoffHz;
  return h.brand;
}

const filtered = $derived(
  ofType
    .filter((d) => filterBrand === "all" || d.brand === filterBrand)
    .filter((d) => filterImpedance === "all" || d.impedanceOhm === Number(filterImpedance))
    .filter((d) =>
      d.type === "cone" ? filterSize === "all" || d.sizeInch === Number(filterSize) : true
    )
    .filter((d) =>
      d.type === "compression" ? filterSize === "all" || d.exitInch === Number(filterSize) : true
    )
    .filter((d) => d.type !== "cone" || maxFs === "" || d.fsHz <= Number(maxFs))
    .filter((d) => d.type !== "cone" || minQts === "" || d.qts >= Number(minQts))
    .filter((d) => d.type !== "cone" || maxQts === "" || d.qts <= Number(maxQts))
    .filter((d) => d.type !== "cone" || minXmax === "" || d.xmaxMm >= Number(minXmax))
    .filter((d) => d.type !== "cone" || minPe === "" || d.peW >= Number(minPe))
    .filter(
      (d) =>
        d.type !== "compression" || maxCrossover === "" || d.minCrossoverHz <= Number(maxCrossover)
    )
    .filter(
      (d) => d.type !== "compression" || minSens === "" || d.sensitivityHornDb >= Number(minSens)
    )
    .sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      if (va === undefined || vb === undefined) return 0;
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortAsc ? cmp : -cmp;
    })
);

const filteredHorns = $derived(
  horns
    .filter((h) => filterBrand === "all" || h.brand === filterBrand)
    .filter((h) => filterSize === "all" || h.exitInch === Number(filterSize))
    .filter((h) => filterProfile === "all" || h.profile === filterProfile)
    .filter((h) => maxCutoff === "" || h.cutoffHz <= Number(maxCutoff))
    .sort((a, b) => {
      const va = hornSortValue(a, sortKey);
      const vb = hornSortValue(b, sortKey);
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortAsc ? cmp : -cmp;
    })
);

const resultCount = $derived(isHorn ? filteredHorns.length : filtered.length);

const advancedFilterCount = $derived(
  isCone
    ? (maxFs !== "" ? 1 : 0) +
        (minQts !== "" ? 1 : 0) +
        (maxQts !== "" ? 1 : 0) +
        (minXmax !== "" ? 1 : 0) +
        (minPe !== "" ? 1 : 0)
    : (maxCrossover !== "" ? 1 : 0) + (minSens !== "" ? 1 : 0)
);

const activeFilterCount = $derived(
  (filterBrand !== "all" ? 1 : 0) +
    (filterSize !== "all" ? 1 : 0) +
    (filterImpedance !== "all" ? 1 : 0) +
    (isHorn ? (filterProfile !== "all" ? 1 : 0) + (maxCutoff !== "" ? 1 : 0) : advancedFilterCount)
);

function clearFilters() {
  filterBrand = "all";
  filterSize = "all";
  filterImpedance = "all";
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
function setTab(t: Tab) {
  if (t === tab) return;
  tab = t;
  clearFilters();
  selected = new Set();
  sortKey = t === "cone" ? "sizeInch" : "exitInch";
  sortAsc = true;
  showAdvanced = false;
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
  const base = isHorn ? `${BASE}/horns/compare` : `${BASE}/drivers/compare`;
  window.location.href = `${base}?ids=${encodeURIComponent(ids)}`;
}

function sortIndicator(key: SortKey) {
  if (sortKey !== key) return "";
  return sortAsc ? " ↑" : " ↓";
}
</script>

<div class="type-tabs">
  <button class:active={tab === "cone"} onclick={() => setTab("cone")}>Cone drivers</button>
  <button class:active={tab === "compression"} onclick={() => setTab("compression")}>
    Compression drivers
  </button>
  <button class:active={tab === "horn"} onclick={() => setTab("horn")}>Horns</button>
</div>

<div class="filters">
  <div class="filter-row">
    <label>
      Brand
      <select bind:value={filterBrand}>
        <option value="all">All</option>
        {#each brands as b}
          <option value={b}>{b}</option>
        {/each}
      </select>
    </label>
    {#if isCone}
      <label>
        Size
        <select bind:value={filterSize}>
          <option value="all">All</option>
          {#each sizes as s}
            <option value={s}>{s}"</option>
          {/each}
        </select>
      </label>
    {:else}
      <label>
        Exit
        <select bind:value={filterSize}>
          <option value="all">All</option>
          {#each exits as s}
            <option value={s}>{s}"</option>
          {/each}
        </select>
      </label>
    {/if}
    {#if isHorn}
      <label>
        Profile
        <select bind:value={filterProfile}>
          <option value="all">All</option>
          {#each profiles as p}
            <option value={p}>{p}</option>
          {/each}
        </select>
      </label>
      <label>
        Max cutoff (Hz)
        <input type="number" min="100" max="5000" placeholder="e.g. 1000" bind:value={maxCutoff} />
      </label>
    {:else}
      <label>
        Impedance
        <select bind:value={filterImpedance}>
          <option value="all">All</option>
          {#each impedances as z}
            <option value={z}>{z} Ω</option>
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
    {/if}
    {#if activeFilterCount > 0}
      <button class="clear-btn" onclick={clearFilters}>
        Clear {activeFilterCount}
      </button>
    {/if}
  </div>

  {#if showAdvanced && !isHorn}
    <div class="filter-row adv-row">
      {#if isCone}
        <label>
          Max Fs (Hz)
          <input type="number" min="10" max="200" placeholder="e.g. 40" bind:value={maxFs} />
        </label>
        <label>
          Qts min
          <input type="number" min="0" max="2" step="0.01" placeholder="e.g. 0.2" bind:value={minQts} />
        </label>
        <label>
          Qts max
          <input type="number" min="0" max="2" step="0.01" placeholder="e.g. 0.7" bind:value={maxQts} />
        </label>
        <label>
          Min Xmax (mm)
          <input type="number" min="1" max="100" placeholder="e.g. 10" bind:value={minXmax} />
        </label>
        <label>
          Min Pe (W)
          <input type="number" min="1" max="5000" placeholder="e.g. 500" bind:value={minPe} />
        </label>
      {:else}
        <label>
          Max crossover (Hz)
          <input type="number" min="100" max="5000" placeholder="e.g. 1200" bind:value={maxCrossover} />
        </label>
        <label>
          Min sens (dB)
          <input type="number" min="90" max="120" placeholder="e.g. 108" bind:value={minSens} />
        </label>
      {/if}
    </div>
  {/if}

  <div class="filter-footer">
    <span class="count">
      {resultCount}
      {isHorn ? "horn" : "driver"}{resultCount === 1 ? "" : "s"}
    </span>
    {#if selected.size > 0}
      <button class="compare-btn" onclick={goCompare}>
        Compare {selected.size} →
      </button>
    {/if}
  </div>
</div>

<div class="table-wrap">
  {#if isHorn}
    <table>
      <thead>
        <tr>
          <th class="check-col"></th>
          <th class="sortable" onclick={() => toggleSort("brand")}>Brand / Model{sortIndicator("brand")}</th>
          <th class="sortable num" onclick={() => toggleSort("exitInch")}>Exit{sortIndicator("exitInch")}</th>
          <th class="sortable num" onclick={() => toggleSort("coverageHorizontalDeg")}>H°{sortIndicator("coverageHorizontalDeg")}</th>
          <th class="sortable num" onclick={() => toggleSort("coverageVerticalDeg")}>V°{sortIndicator("coverageVerticalDeg")}</th>
          <th class="sortable num" onclick={() => toggleSort("cutoffHz")}>Cutoff Hz{sortIndicator("cutoffHz")}</th>
          <th class="sortable num" onclick={() => toggleSort("mouthCm2")}>Mouth cm²{sortIndicator("mouthCm2")}</th>
          <th class="sortable num" onclick={() => toggleSort("depthMm")}>Depth mm{sortIndicator("depthMm")}</th>
          <th>Profile</th>
        </tr>
      </thead>
      <tbody>
        {#each filteredHorns as h (h.id)}
          <tr class:row-selected={selected.has(h.id)}>
            <td class="check-col">
              <input
                type="checkbox"
                checked={selected.has(h.id)}
                disabled={!selected.has(h.id) && selected.size >= 4}
                onchange={() => toggleSelect(h.id)}
              />
            </td>
            <td class="name-cell">
              <span class="brand">{h.brand}</span>
              <a class="model" href="{BASE}/horns/{h.id}">{h.model}</a>
              {#if h.datasheetUrl}
                <a href={h.datasheetUrl} target="_blank" rel="noopener" class="ds-link">↗</a>
              {/if}
            </td>
            <td class="num">{h.exitInch}"</td>
            <td class="num">{h.coverageHorizontalDeg}°</td>
            <td class="num">{h.coverageVerticalDeg}°</td>
            <td class="num">{h.cutoffHz}</td>
            <td class="num">{mouthCm2(h)}</td>
            <td class="num">{h.depthMm ?? "—"}</td>
            <td>{h.profile}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {:else}
    <table>
      <thead>
        <tr>
          <th class="check-col"></th>
          <th class="sortable" onclick={() => toggleSort("brand")}>Brand / Model{sortIndicator("brand")}</th>
          {#if isCone}
            <th class="sortable num" onclick={() => toggleSort("sizeInch")}>Size{sortIndicator("sizeInch")}</th>
            <th class="sortable num" onclick={() => toggleSort("impedanceOhm")}>Ω{sortIndicator("impedanceOhm")}</th>
            <th class="sortable num" onclick={() => toggleSort("fsHz")}>Fs Hz{sortIndicator("fsHz")}</th>
            <th class="sortable num" onclick={() => toggleSort("qts")}>Qts{sortIndicator("qts")}</th>
            <th class="num" title="Efficiency Bandwidth Product = Fs/Qes (<50 sealed, >100 ported)">EBP</th>
            <th class="sortable num" onclick={() => toggleSort("vasL")}>Vas L{sortIndicator("vasL")}</th>
            <th class="sortable num" onclick={() => toggleSort("xmaxMm")}>Xmax mm{sortIndicator("xmaxMm")}</th>
            <th class="sortable num" onclick={() => toggleSort("peW")}>Pe W{sortIndicator("peW")}</th>
            <th class="sortable num" onclick={() => toggleSort("sensitivityDb")}>Sens dB{sortIndicator("sensitivityDb")}</th>
          {:else}
            <th class="sortable num" onclick={() => toggleSort("exitInch")}>Exit{sortIndicator("exitInch")}</th>
            <th class="sortable num" onclick={() => toggleSort("impedanceOhm")}>Ω{sortIndicator("impedanceOhm")}</th>
            <th class="sortable num" onclick={() => toggleSort("voiceCoilMm")}>VC mm{sortIndicator("voiceCoilMm")}</th>
            <th class="sortable num" onclick={() => toggleSort("fLowHz")}>Low Hz{sortIndicator("fLowHz")}</th>
            <th class="sortable num" onclick={() => toggleSort("fHighHz")}>High Hz{sortIndicator("fHighHz")}</th>
            <th class="sortable num" onclick={() => toggleSort("minCrossoverHz")}>Min xover{sortIndicator("minCrossoverHz")}</th>
            <th class="sortable num" onclick={() => toggleSort("peW")}>AES W{sortIndicator("peW")}</th>
            <th class="sortable num" onclick={() => toggleSort("sensitivityHornDb")}>Sens dB{sortIndicator("sensitivityHornDb")}</th>
          {/if}
        </tr>
      </thead>
      <tbody>
        {#each filtered as d (d.id)}
          <tr class:row-selected={selected.has(d.id)}>
            <td class="check-col">
              <input
                type="checkbox"
                checked={selected.has(d.id)}
                disabled={!selected.has(d.id) && selected.size >= 4}
                onchange={() => toggleSelect(d.id)}
              />
            </td>
            <td class="name-cell">
              <span class="brand">{d.brand}</span>
              <a class="model" href="{BASE}/drivers/{d.id}">{d.model}</a>
              {#if d.datasheetUrl}
                <a href={d.datasheetUrl} target="_blank" rel="noopener" class="ds-link">↗</a>
              {/if}
            </td>
            {#if d.type === "cone"}
              <td class="num">{d.sizeInch}"</td>
              <td class="num">{d.impedanceOhm} Ω</td>
              <td class="num">{d.fsHz}</td>
              <td class="num">{d.qts}</td>
              <td class="num">{ebp(d.fsHz, d.qes) ?? "—"}</td>
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
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

{#if selected.size > 0}
  <p class="hint">Max 4 {isHorn ? "horns" : "drivers"} can be compared at once.</p>
{/if}

<style>
  .type-tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .type-tabs button {
    background: none;
    border: 1px solid var(--line);
    color: var(--muted);
    border-radius: 4px;
    padding: 0.4rem 0.9rem;
    font-family: var(--font-mono);
    font-size: 0.85rem;
    cursor: pointer;
  }

  .type-tabs button:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .type-tabs button.active {
    border-color: var(--accent);
    color: var(--bg);
    background: var(--accent);
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

  .chip {
    background: none;
    border: 1px solid var(--line);
    color: var(--muted);
    border-radius: 3px;
    padding: 0.2rem 0.55rem;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    cursor: pointer;
    align-self: flex-end;
    white-space: nowrap;
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

  .filter-footer {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-family: var(--font-mono);
    font-size: 0.875rem;
  }

  .count {
    color: var(--muted);
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

  .clear-btn {
    background: none;
    border: 1px solid var(--line);
    color: var(--muted);
    border-radius: 4px;
    padding: 0.3rem 0.75rem;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    align-self: flex-end;
  }

  .clear-btn:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .table-wrap {
    overflow-x: auto;
  }

  th.sortable {
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
  }

  th.sortable:hover {
    color: var(--text);
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
    background: rgba(57, 255, 20, 0.05);
  }

  :global([data-theme="light"]) .row-selected td {
    background: rgba(26, 127, 55, 0.06);
  }

  .name-cell {
    white-space: nowrap;
  }

  .brand {
    color: var(--muted);
    margin-right: 0.35rem;
  }

  .model {
    color: var(--text);
    font-weight: 500;
  }

  .ds-link {
    color: var(--muted);
    font-size: 0.75rem;
    margin-left: 0.3rem;
    text-decoration: none;
  }

  .ds-link:hover {
    color: var(--accent);
  }

  input[type="checkbox"]:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }

  .hint {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    color: var(--muted);
    margin-top: 0.5rem;
  }
</style>
