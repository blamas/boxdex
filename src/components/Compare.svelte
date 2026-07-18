<script lang="ts">
import { onMount } from "svelte";
import type { Translations } from "../i18n";
import { tt } from "../i18n";
import { CATEGORIES } from "../lib/category";
import { normalisePeak, type ParsedCurve, toPairs } from "../lib/csv";
import {
  availSplCounts,
  type CurvesResponse,
  curveEntries,
  curveLabel,
  type DriverCurves,
  resolveCurveEntry,
} from "../lib/curves";
import { curveSeriesToCsv, downloadBlob, jsonString } from "../lib/export";
import { humanize } from "../lib/format";
import type { EnclosureRecord } from "../lib/metrics";
import { SERIES_COLORS } from "../lib/palette";
import type { DriverOption } from "../lib/schemas";
import { BASE } from "../lib/site";
import { readParam, writeParams } from "../lib/url-state";
import Combobox from "./Combobox.svelte";
import CurveChart from "./CurveChart.svelte";
import ExportMenu from "./ExportMenu.svelte";
import LoadMore, { ROW_LIMIT } from "./LoadMore.svelte";
import PageActions from "./PageActions.svelte";

// The kinds this page lets you overlay (subset of CurveKind).
type Kind = "spl" | "phase" | "impedance";

interface Props {
  t: Translations["compare"];
  curveLabels: Translations["curveLabels"];
}

const { t, curveLabels }: Props = $props();

let records = $state<EnclosureRecord[]>([]);
let driverList = $state<DriverOption[]>([]);
let driverFilter = $state("all");
let selected = $state<string[]>([]);
let cache = $state<Record<string, CurvesResponse>>({});
// The *Snap deriveds re-snapshot the selection records into plain objects on any key
// write, so `series` and the table read stable non-proxy values and track the map as a
// whole (the same Svelte 5 proxy-tracking caveat documented on slotBands in StackBuilder).
let curveSelections = $state<Record<string, string>>({});
const curveSelectionsSnap = $derived(Object.fromEntries(Object.entries(curveSelections)));
let stackCountSelections = $state<Record<string, number>>({});
const stackCountSelectionsSnap = $derived(Object.fromEntries(Object.entries(stackCountSelections)));
let kind = $state<Kind>("spl");
let normalise = $state(false);
let freqMin = $state<number | "">("");
let freqMax = $state<number | "">("");
let loading = $state(true);
let error = $state<string | null>(null);
let initialized = $state(false);
let showAdvanced = $state(false);
let kindFilter = $state<Kind | "all">("all");
let categoryFilter = $state("all");
let nameFilter = $state("");

onMount(async () => {
  try {
    const urlSlugs = (readParam("slugs") ?? "").split(",").filter(Boolean);
    const urlKind = readParam("kind");

    const [manifestRes, driversRes] = await Promise.all([
      fetch(`${BASE}/api/manifest.json`),
      fetch(`${BASE}/api/driver-options.json`),
    ]);
    if (!manifestRes.ok) throw new Error(`HTTP ${manifestRes.status}`);
    if (!driversRes.ok) throw new Error(`HTTP ${driversRes.status}`);
    records = await manifestRes.json();
    driverList = await driversRes.json();

    const validSlugs = records.map((r) => r.slug);
    selected = urlSlugs.filter((s) => validSlugs.includes(s));

    if (urlKind === "spl" || urlKind === "phase" || urlKind === "impedance") {
      kind = urlKind;
    }
  } catch (e) {
    error = String(e);
  } finally {
    loading = false;
    initialized = true;
  }
});

// Sync URL when selection or kind changes
$effect(() => {
  if (!initialized) return;
  writeParams({
    slugs: selected.length > 0 ? selected.join(",") : undefined,
    kind: kind !== "spl" ? kind : undefined,
  });
});

// Non-reactive: guards against a re-run re-fetching a slug whose request is still in flight.
const pendingCurves = new Set<string>();
$effect(() => {
  for (const slug of selected) {
    if (cache[slug] || pendingCurves.has(slug)) continue;
    pendingCurves.add(slug);
    fetch(`${BASE}/api/curves/${slug}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: CurvesResponse) => {
        cache = { ...cache, [slug]: d };
      })
      .catch(() => {})
      .finally(() => pendingCurves.delete(slug));
  }
});

const series = $derived.by(() => {
  return selected.flatMap((slug, i) => {
    const payload = cache[slug];
    if (!payload) return [];
    const entry = resolveCurveEntry(payload, kind, curveSelectionsSnap[slug]);
    if (!entry) return [];

    const { dc, isMeas } = entry;

    let curve: ParsedCurve | undefined;
    let countSuffix = "";

    if (kind === "spl") {
      const counts = availSplCounts(dc);
      const selCount = stackCountSelectionsSnap[slug];
      const count =
        selCount !== undefined && counts.includes(selCount) ? selCount : (counts[0] ?? 1);
      if (count > 1) {
        curve = dc.stacked[count]?.curve;
        countSuffix = ` ${count}×`;
      } else {
        curve = dc.curves.spl;
        if (counts.length > 1) countSuffix = " 1×";
      }
    } else {
      curve = dc.curves[kind];
    }

    if (!curve) return [];

    const dashed = !isMeas;
    const provenance = isMeas ? "meas" : "sim";
    const label = `${payload.name} (${provenance} · ${curveLabel(dc)}${countSuffix})`;
    const values = kind === "spl" && normalise ? normalisePeak(curve.value) : curve.value;

    let pairs = toPairs({ freq: curve.freq, value: values });
    if (freqMin !== "") pairs = pairs.filter(([f]) => f >= Number(freqMin));
    if (freqMax !== "") pairs = pairs.filter(([f]) => f <= Number(freqMax));

    return [
      {
        name: label,
        slug,
        source: dc.source,
        color: SERIES_COLORS[i % SERIES_COLORS.length],
        points: pairs,
        dashed,
        smooth: true,
      },
    ];
  });
});

function toggleSelect(slug: string) {
  if (selected.includes(slug)) {
    selected = selected.filter((s) => s !== slug);
  } else {
    selected = [...selected, slug];
  }
}

function exportCsv() {
  downloadBlob(`boxdex-compare-${kind}.csv`, "text/csv", curveSeriesToCsv(series, kind));
}

function exportJson() {
  const payload = {
    kind,
    normalised: kind === "spl" && normalise,
    series: series.map((s) => ({
      name: s.name,
      slug: s.slug,
      source: s.source,
      points: s.points,
    })),
  };
  downloadBlob(`boxdex-compare-${kind}.json`, "application/json", jsonString(payload));
}

const filteredRecords = $derived(
  records
    .filter((r) => categoryFilter === "all" || r.category === categoryFilter)
    .filter((r) => driverFilter === "all" || r.drivers.includes(driverFilter))
    .filter((r) => kindFilter === "all" || r.availableKinds.includes(kindFilter))
    .filter(
      (r) =>
        nameFilter.trim() === "" || r.name.toLowerCase().includes(nameFilter.trim().toLowerCase())
    )
);

// Writable $derived: filtering resets the limit, but a LoadMore override survives until the
// next actual filter change (same idiom as Explorer's sortKey). The unused arg exists only to
// make the dependency on filteredRecords.length explicit.
function resetLimit(_filteredCount: number): number {
  return ROW_LIMIT;
}
let limit: number = $derived(resetLimit(filteredRecords.length));
let tableWrap = $state<HTMLElement | undefined>(undefined);

// Selected items are always pinned at the top so they remain visible regardless of limit.
const displayedRecords = $derived.by(() => {
  const sel = new Set(selected);
  const pinned = filteredRecords.filter((r) => sel.has(r.slug));
  const rest = filteredRecords.filter((r) => !sel.has(r.slug));
  return [...pinned, ...rest.slice(0, limit)];
});

const remaining = $derived.by(() => {
  const sel = new Set(selected);
  return Math.max(0, filteredRecords.filter((r) => !sel.has(r.slug)).length - limit);
});

const KIND_LABELS: Record<Kind, string> = { spl: "SPL", phase: "pha", impedance: "imp" };
const ALL_KINDS: Kind[] = ["spl", "phase", "impedance"];
</script>

<div class="compare">
  <PageActions>
    <ExportMenu
      disabled={series.length === 0}
      onCsv={exportCsv}
      onJson={exportJson}
      onPrint={() => window.print()}
    />
  </PageActions>
  <div class="controls no-print">
    <div class="segmented">
      {#each (["spl", "phase", "impedance"] as Kind[]) as k}
        <button class:active={kind === k} onclick={() => (kind = k)}>
          {k.toUpperCase()}
        </button>
      {/each}
    </div>
    {#if kind === "spl"}
      <label class="check-label">
        <input type="checkbox" bind:checked={normalise} />
        {t.normalise}
      </label>
    {/if}
    <button
      class="advanced-toggle"
      class:active={showAdvanced}
      onclick={() => (showAdvanced = !showAdvanced)}
    >
      {t.advanced} {showAdvanced ? "▴" : "▾"}
      {#if !showAdvanced && (freqMin !== "" || freqMax !== "" || driverFilter !== "all" || kindFilter !== "all" || categoryFilter !== "all" || nameFilter !== "")}
        <span class="advanced-toggle-count">{(freqMin !== "" ? 1 : 0) + (freqMax !== "" ? 1 : 0) + (driverFilter !== "all" ? 1 : 0) + (kindFilter !== "all" ? 1 : 0) + (categoryFilter !== "all" ? 1 : 0) + (nameFilter !== "" ? 1 : 0)}</span>
      {/if}
    </button>
  </div>

  {#if showAdvanced}
    <div class="adv-controls no-print">
      <div class="adv-row">
        <input
          type="text"
          class="name-filter-input"
          placeholder={t.search}
          bind:value={nameFilter}
        />
      </div>
      <div class="adv-row">
        {#each CATEGORIES as cat}
          <button
            class="chip"
            class:chip-active={categoryFilter === cat}
            aria-pressed={categoryFilter === cat}
            onclick={() => { categoryFilter = categoryFilter === cat ? "all" : cat; }}
          >{cat}</button>
        {/each}
        <span class="adv-sep"></span>
        <span class="muted">{t.has}</span>
        {#each ALL_KINDS as k}
          <button
            class="chip"
            class:chip-active={kindFilter === k}
            aria-pressed={kindFilter === k}
            onclick={() => { kindFilter = kindFilter === k ? "all" : k; }}
          >{KIND_LABELS[k]}</button>
        {/each}
      </div>
      <div class="adv-row">
        <label class="driver-filter-label">
          <span class="muted">{t.driver}</span>
          <div class="driver-combobox">
            <Combobox
              items={driverList}
              getId={(d) => d.id}
              getLabel={(d) => `${d.brand} ${d.model}`}
              value={driverFilter === "all" ? "" : driverFilter}
              emptyLabel={t.allDrivers}
              placeholder={t.search}
              onselect={(id) => { driverFilter = id || "all"; }}
            />
          </div>
        </label>
      </div>
      <div class="adv-row">
        <span class="muted">{t.freqRange}</span>
        <input type="number" min="10" max="20000" placeholder={t.minHz} bind:value={freqMin} />
        <span class="range-sep">-</span>
        <input type="number" min="10" max="20000" placeholder={t.maxHz} bind:value={freqMax} />
        <span class="muted">Hz</span>
      </div>
    </div>
  {/if}

  {#if series.length === 0}
    <div class="empty-state">
      {tt(t.emptyState, { kind })}
    </div>
  {:else}
    <CurveChart series={series} yName={curveLabels[kind]} />
  {/if}

  <p class="provenance-note">{t.provenanceNote}</p>

  <hr class="section-rule no-print" />

  <div class="box-list no-print">
    {#if error}
      <div class="empty-state">{t.failedToLoad}</div>
    {:else if loading}
      <div class="skel-table" aria-hidden="true">
        {#each { length: 6 } as _}
          <div class="skel-row-wrap">
            <div class="skeleton skel-cell skel-cell-wide"></div>
            <div class="skeleton skel-cell"></div>
            <div class="skeleton skel-cell"></div>
            <div class="skeleton skel-cell"></div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="table-wrap" bind:this={tableWrap}>
        <table>
          <thead>
            <tr>
              <th class="check-col"><span class="sr-only">{t.columns.select}</span></th>
              <th class="name-col">{t.columns.name}</th>
              <th class="cat-col">{t.columns.cat}</th>
              <th class="topo-col">{t.columns.topology}</th>
              <th class="source-col">{t.columns.source}</th>
              {#each ALL_KINDS as k}
                <th class="kind-col">{KIND_LABELS[k]}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each displayedRecords as rec (rec.slug)}
              {@const isSelected = selected.includes(rec.slug)}
              <tr class:row-selected={isSelected}>
                <td class="check-col">
                  <input
                    type="checkbox"
                    aria-label={tt(t.selectRow, { name: rec.name })}
                    checked={isSelected}
                    onchange={() => toggleSelect(rec.slug)}
                  />
                </td>
                <td class="name-cell">{rec.name}</td>
                <td><span class="badge badge-{rec.category}">{rec.category}</span></td>
                <td class="topo-cell muted">{humanize(rec.topology)}</td>
                <td class="source-cell">
                  {#if isSelected && cache[rec.slug]}
                    {@const entries = curveEntries(cache[rec.slug], kind)}
                    {@const resolved = resolveCurveEntry(cache[rec.slug], kind, curveSelectionsSnap[rec.slug])}
                    <div class="source-controls">
                      {#if entries.length === 1}
                        <span class="curve-label">{entries[0].label}</span>
                      {:else if entries.length > 1}
                        <Combobox
                          items={entries}
                          getId={(e) => e.key}
                          getLabel={(e) => e.label}
                          value={resolved?.key ?? ""}
                          searchable={false}
                          compact
                          onselect={(key) => {
                            curveSelections[rec.slug] = key;
                          }}
                        />
                      {/if}
                      {#if kind === "spl" && resolved}
                        {@const counts = availSplCounts(resolved.dc)}
                        {#if counts.length > 1}
                          {@const selCount = stackCountSelections[rec.slug]}
                          {@const effCount = selCount !== undefined && counts.includes(selCount) ? selCount : counts[0]}
                          <Combobox
                            items={counts}
                            getId={(c) => String(c)}
                            getLabel={(c) => `${c}×`}
                            value={String(effCount)}
                            searchable={false}
                            compact
                            onselect={(v) => {
                              stackCountSelections[rec.slug] = Number(v);
                            }}
                          />
                        {/if}
                      {/if}
                    </div>
                  {/if}
                </td>
                {#each ALL_KINDS as k}
                  {@const has = rec.availableKinds.includes(k)}
                  {@const label = has ? tt(t.available, { label: KIND_LABELS[k] }) : tt(t.missing, { label: KIND_LABELS[k] })}
                  <td class="kind-col">
                    <span
                      class="kind-dot"
                      class:kind-dot-active={has}
                      class:kind-dot-current={k === kind && has}
                      role="img"
                      aria-label={label}
                      title={label}
                    >{has ? "●" : "○"}</span>
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
        <LoadMore {remaining} onmore={() => (limit += ROW_LIMIT)} root={tableWrap} />
      </div>
    {/if}
  </div>
</div>

<style>
  .section-rule {
    border: none;
    border-top: 1px solid var(--line);
    margin: 0;
  }

  .compare {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  /* Chart-tip variant of the global note: centred under the graph. */
  .provenance-note {
    text-align: center;
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .segmented {
    display: flex;
    border: 1px solid var(--line);
    border-radius: 4px;
    overflow: hidden;
  }

  .segmented button {
    background: var(--panel);
    border: none;
    border-right: 1px solid var(--line);
    color: var(--muted);
    padding: 0.35rem 0.9rem;
    font-family: var(--font-mono);
    font-size: 0.8rem;
  }

  .segmented button:last-child {
    border-right: none;
  }

  .segmented button.active {
    background: var(--bg);
    color: var(--accent);
  }

  .check-label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-family: var(--font-mono);
    font-size: 0.875rem;
    color: var(--text);
    cursor: pointer;
  }

  .adv-controls {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.6rem 0.75rem;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 4px;
    font-family: var(--font-mono);
    font-size: 0.8rem;
  }

  .adv-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .adv-controls input[type="number"] {
    width: 90px;
  }

  .adv-controls input.name-filter-input {
    width: 100%;
    max-width: 440px;
    padding: 0.4rem 0.6rem;
    font-size: 0.9rem;
  }

  .adv-sep {
    width: 1px;
    height: 1.2em;
    background: var(--line);
    margin: 0 0.25rem;
    flex-shrink: 0;
  }

  .range-sep {
    color: var(--muted);
  }

  .driver-filter-label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-family: var(--font-mono);
    font-size: 0.8rem;
  }

  .driver-combobox {
    min-width: 200px;
  }

  .table-wrap {
    overflow-x: auto;
    overflow-y: auto;
    max-height: 65vh;
    scrollbar-gutter: stable;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  thead th {
    position: sticky;
    top: 0;
    background: var(--panel);
    z-index: 1;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    font-weight: 400;
    color: var(--muted);
    text-align: left;
    padding: 0.3rem 0.4rem;
    border-bottom: 1px solid var(--line);
    white-space: nowrap;
  }

  tbody td {
    padding: 0.3rem 0.4rem;
    border-bottom: 1px solid var(--line);
    vertical-align: middle;
    font-family: var(--font-mono);
    font-size: 0.875rem;
  }

  tbody tr:last-child td {
    border-bottom: none;
  }

  .row-selected td {
    background: var(--accent-subtle);
  }

  .check-col {
    width: 2rem;
    text-align: center;
  }

  .name-cell {
    color: var(--text);
  }

  .topo-cell {
    white-space: nowrap;
  }

  .source-col {
    white-space: nowrap;
  }

  .source-cell {
    white-space: nowrap;
  }

  .kind-col {
    width: 2.5rem;
    text-align: center;
  }

  .kind-dot {
    font-size: 0.55rem;
    color: var(--line);
    line-height: 1;
  }

  .kind-dot-active {
    color: var(--muted);
  }

  .kind-dot-current {
    color: var(--accent);
  }

  .source-controls {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .curve-label {
    display: inline-block;
    width: fit-content;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 3px;
    color: var(--muted);
    font-family: var(--font-mono);
    font-size: 0.72rem;
    padding: 0.15rem 0.3rem;
  }

  .muted {
    color: var(--muted);
    font-size: 0.8rem;
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

  .skel-cell-wide {
    flex: 3;
  }
</style>
