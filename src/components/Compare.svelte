<script lang="ts">
import { onMount } from "svelte";
import type { Translations } from "../i18n";
import { tt } from "../i18n";
import { CATEGORIES } from "../lib/category";
import { normalisePeak, SERIES_COLORS, toPairs } from "../lib/csv";
import { type CurvesResponse, curveEntries, resolveCurveEntry } from "../lib/curves";
import { curveSeriesToCsv, downloadBlob, jsonString } from "../lib/export";
import { humanize } from "../lib/format";
import type { EnclosureRecord } from "../lib/metrics";
import type { Driver } from "../lib/schemas";
import { BASE } from "../lib/site";
import { readParam, writeParams } from "../lib/url-state";
import Combobox from "./Combobox.svelte";
import CurveChart from "./CurveChart.svelte";
import ExportMenu from "./ExportMenu.svelte";
import PageActions from "./PageActions.svelte";

// The kinds this page lets you overlay (subset of CurveKind).
type Kind = "spl" | "phase" | "impedance";

interface Props {
  t: Translations["compare"];
  curveLabels: Translations["curveLabels"];
}

const { t, curveLabels }: Props = $props();

let records = $state<EnclosureRecord[]>([]);
let driverList = $state<Driver[]>([]);
let driverFilter = $state("all");
let selected = $state<string[]>([]);
let cache = $state<Record<string, CurvesResponse>>({});
let curveSelections = $state<Record<string, string>>({});
const curveSelectionsSnap = $derived(Object.fromEntries(Object.entries(curveSelections)));
let kind = $state<Kind>("spl");
let normalise = $state(false);
let freqMin = $state<number | "">("");
let freqMax = $state<number | "">("");
let loading = $state(true);
let initialized = $state(false);
let showAdvanced = $state(false);
let kindFilter = $state<Kind | "all">("all");
let categoryFilter = $state("all");

onMount(async () => {
  const urlSlugs = (readParam("slugs") ?? "").split(",").filter(Boolean);
  const urlKind = readParam("kind") as Kind | null;

  const [manifestRes, driversRes] = await Promise.all([
    fetch(`${BASE}/api/manifest.json`),
    fetch(`${BASE}/api/drivers.json`),
  ]);
  records = await manifestRes.json();
  driverList = await driversRes.json();

  const validSlugs = records.map((r) => r.slug);
  if (urlSlugs.length > 0) {
    selected = urlSlugs.filter((s) => validSlugs.includes(s));
  } else {
    selected = records.slice(0, 2).map((r) => r.slug);
  }

  if (urlKind && ["spl", "phase", "impedance"].includes(urlKind)) {
    kind = urlKind;
  }

  loading = false;
  initialized = true;
});

// Sync URL when selection or kind changes
$effect(() => {
  if (!initialized) return;
  writeParams({
    slugs: selected.length > 0 ? selected.join(",") : undefined,
    kind: kind !== "spl" ? kind : undefined,
  });
});

$effect(() => {
  for (const slug of selected) {
    if (!cache[slug]) {
      fetch(`${BASE}/api/curves/${slug}.json`)
        .then((r) => r.json())
        .then((d: CurvesResponse) => {
          cache = { ...cache, [slug]: d };
        });
    }
  }
});

const series = $derived.by(() => {
  return selected.flatMap((slug, i) => {
    const payload = cache[slug];
    if (!payload) return [];
    const entry = resolveCurveEntry(payload, kind, curveSelectionsSnap[slug]);
    if (!entry) return [];

    const { dc, isMeas } = entry;
    const curve = dc.curves[kind];
    if (!curve) return [];

    const dashed = !isMeas;
    const label = isMeas
      ? `${payload.name} (meas · ${dc.driverId})`
      : `${payload.name} (sim · ${dc.driverId})`;
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

const visibleRecords = $derived(
  records
    .filter((r) => categoryFilter === "all" || r.category === categoryFilter)
    .filter((r) => driverFilter === "all" || r.drivers.includes(driverFilter))
    .filter((r) => kindFilter === "all" || r.availableKinds.includes(kindFilter))
);

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
      {#if !showAdvanced && (freqMin !== "" || freqMax !== "" || driverFilter !== "all" || kindFilter !== "all" || categoryFilter !== "all")}
        <span class="adv-badge">{(freqMin !== "" ? 1 : 0) + (freqMax !== "" ? 1 : 0) + (driverFilter !== "all" ? 1 : 0) + (kindFilter !== "all" ? 1 : 0) + (categoryFilter !== "all" ? 1 : 0)}</span>
      {/if}
    </button>
  </div>

  {#if showAdvanced}
    <div class="adv-controls no-print">
      <div class="adv-row">
        {#each CATEGORIES as cat}
          <button
            class="kind-chip"
            class:kind-chip-active={categoryFilter === cat}
            onclick={() => { categoryFilter = categoryFilter === cat ? "all" : cat; }}
          >{cat}</button>
        {/each}
        <span class="adv-sep"></span>
        <span class="muted">{t.has}</span>
        {#each ALL_KINDS as k}
          <button
            class="kind-chip"
            class:kind-chip-active={kindFilter === k}
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
              emptyLabel={t.allEnclosures}
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

  <div class="box-list no-print">
    <h3>{t.enclosures}</h3>
    {#if loading}
      <p class="muted">{t.loading}</p>
    {:else}
      {#each visibleRecords as rec}
        {@const isSelected = selected.includes(rec.slug)}
        {@const colorIdx = selected.indexOf(rec.slug)}
        <div class="box-item">
          <label class="box-check">
            <input
              type="checkbox"
              checked={isSelected}
              onchange={() => toggleSelect(rec.slug)}
            />
            <span class="box-name" style={isSelected ? `color: ${SERIES_COLORS[colorIdx % SERIES_COLORS.length]}` : ""}>
              {rec.name}
            </span>
            {#if isSelected && cache[rec.slug]}
              {@const entries = curveEntries(cache[rec.slug], kind)}
              {@const effectiveKey = resolveCurveEntry(cache[rec.slug], kind, curveSelectionsSnap[rec.slug])?.key ?? ""}
              {#if entries.length > 1}
                <select
                  class="curve-sel"
                  value={effectiveKey}
                  onchange={(e) => {
                    curveSelections[rec.slug] = (e.target as HTMLSelectElement).value;
                  }}
                >
                  {#each entries as e}
                    <option value={e.key}>{e.label}</option>
                  {/each}
                </select>
              {/if}
            {/if}
            <span class="badge badge-{rec.category}">{rec.category}</span>
            <span class="muted">{humanize(rec.topology)}</span>
          </label>
          <span class="kind-dots">
            {#each ALL_KINDS as k}
              <span
                class="kind-dot"
                class:kind-dot-active={rec.availableKinds.includes(k)}
                class:kind-dot-current={k === kind && rec.availableKinds.includes(k)}
                title={rec.availableKinds.includes(k) ? tt(t.available, { label: KIND_LABELS[k] }) : tt(t.missing, { label: KIND_LABELS[k] })}
              >{rec.availableKinds.includes(k) ? "●" : "○"}</span>
            {/each}
          </span>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
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

  .adv-controls input {
    width: 90px;
  }

  .adv-sep {
    width: 1px;
    height: 1.2em;
    background: var(--line);
    margin: 0 0.25rem;
    flex-shrink: 0;
  }

  .kind-chip {
    background: none;
    border: 1px solid var(--line);
    color: var(--muted);
    border-radius: 3px;
    padding: 0.15rem 0.5rem;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    cursor: pointer;
  }

  .kind-chip:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .kind-chip-active {
    border-color: var(--accent);
    color: var(--accent);
    background: rgba(57, 255, 20, 0.07);
  }

  :global([data-theme="light"]) .kind-chip-active {
    background: rgba(26, 127, 55, 0.07);
  }

  .range-sep {
    color: var(--muted);
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

  .box-list {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 1rem;
  }

  .box-list h3 {
    margin: 0 0 0.75rem;
    font-size: 0.875rem;
    color: var(--muted);
  }

  .box-item {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.3rem 0;
    border-bottom: 1px solid var(--line);
  }

  .box-item:last-child {
    border-bottom: none;
  }

  .box-check {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: 0.875rem;
  }

  .box-name {
    flex: 1;
    color: var(--text);
    transition: color 0.1s;
  }

  .kind-dots {
    display: flex;
    gap: 0.25rem;
    margin-left: auto;
    flex-shrink: 0;
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

  .curve-sel {
    background: var(--bg);
    border: 1px solid var(--line);
    color: var(--muted);
    font-family: var(--font-mono);
    font-size: 0.72rem;
    padding: 0.15rem 0.3rem;
    border-radius: 3px;
    width: fit-content;
  }

  .muted {
    color: var(--muted);
    font-size: 0.8rem;
  }
</style>
