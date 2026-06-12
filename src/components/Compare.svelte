<script lang="ts">
import { onMount } from "svelte";
import { CATEGORIES } from "../lib/category";
import { SERIES_COLORS, normalisePeak, toPairs } from "../lib/csv";
import { curveSeriesToCsv, downloadBlob, jsonString } from "../lib/export";
import { humanize } from "../lib/format";
import type { EnclosureRecord } from "../lib/metrics";
import { BASE } from "../lib/site";
import CurveChart from "./CurveChart.svelte";
import ExportMenu from "./ExportMenu.svelte";

type Kind = "spl" | "phase" | "impedance";
type CurveData = { freq: number[]; value: number[] };

interface DriverCurves {
  driverId: string;
  source: string;
  curves: Partial<Record<Kind, CurveData>>;
}
interface CurvesResponse {
  slug: string;
  name: string;
  simulations: DriverCurves[];
  measurements: DriverCurves[];
}

interface DriverInfo {
  id: string;
  brand: string;
  model: string;
}

let records = $state<EnclosureRecord[]>([]);
let driverList = $state<DriverInfo[]>([]);
let driverFilter = $state("all");
let selected = $state<string[]>([]);
let cache = $state<Record<string, CurvesResponse>>({});
let kind = $state<Kind>("spl");
let normalise = $state(false);
let freqMin = $state<number | "">("");
let freqMax = $state<number | "">("");
let loading = $state(true);
let initialized = $state(false);
let showAdvanced = $state(false);
let kindFilter = $state<Kind | "all">("all");
let categoryFilter = $state("all");

const Y_LABELS: Record<Kind, string> = {
  spl: "SPL (dB)",
  phase: "Phase (°)",
  impedance: "Impedance (Ω)",
};

onMount(async () => {
  const params = new URLSearchParams(window.location.search);
  const urlSlugs = (params.get("slugs") ?? "").split(",").filter(Boolean);
  const urlKind = params.get("kind") as Kind | null;

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
  const params = new URLSearchParams();
  if (selected.length > 0) params.set("slugs", selected.join(","));
  if (kind !== "spl") params.set("kind", kind);
  const qs = params.toString();
  history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
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

function pickCurve(payload: CurvesResponse, k: Kind): { dc: DriverCurves; isMeas: boolean } | null {
  for (const dc of payload.measurements) {
    if (dc.curves[k]) return { dc, isMeas: true };
  }
  for (const dc of payload.simulations) {
    if (dc.curves[k]) return { dc, isMeas: false };
  }
  return null;
}

const series = $derived.by(() => {
  return selected.flatMap((slug, i) => {
    const payload = cache[slug];
    if (!payload) return [];
    const picked = pickCurve(payload, kind);
    if (!picked) return [];

    const { dc, isMeas } = picked;
    const curve = dc.curves[kind];
    if (!curve) return [];

    const dashed = !isMeas;
    const label = isMeas
      ? `${payload.name} (meas · ${dc.driverId})`
      : `${payload.name} (sim · ${dc.driverId})`;
    let values = kind === "spl" && normalise ? normalisePeak(curve.value) : curve.value;

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

let copyDone = $state(false);
async function copyLink() {
  await navigator.clipboard.writeText(window.location.href);
  copyDone = true;
  setTimeout(() => {
    copyDone = false;
  }, 1500);
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
  <div class="page-header no-print">
    <button class="link-btn" onclick={copyLink}>{copyDone ? "copied!" : "⎘ share"}</button>
    <ExportMenu
      disabled={series.length === 0}
      onCsv={exportCsv}
      onJson={exportJson}
      onPrint={() => window.print()}
    />
  </div>
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
        Normalise peak to 0 dB
      </label>
    {/if}
    <button
      class="advanced-toggle"
      class:active={showAdvanced}
      onclick={() => (showAdvanced = !showAdvanced)}
    >
      Advanced {showAdvanced ? "▴" : "▾"}
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
        <span class="muted">Has</span>
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
          <span class="muted">Driver</span>
          <select bind:value={driverFilter}>
            <option value="all">All enclosures</option>
            {#each driverList as d}
              <option value={d.id}>{d.brand} {d.model}</option>
            {/each}
          </select>
        </label>
      </div>
      <div class="adv-row">
        <span class="muted">Freq range</span>
        <input type="number" min="10" max="20000" placeholder="min Hz" bind:value={freqMin} />
        <span class="range-sep">–</span>
        <input type="number" min="10" max="20000" placeholder="max Hz" bind:value={freqMax} />
        <span class="muted">Hz</span>
      </div>
    </div>
  {/if}

  {#if series.length === 0}
    <div class="empty-state">
      Select at least one box below, or the selected boxes have no {kind} data.
    </div>
  {:else}
    <CurveChart series={series} yName={Y_LABELS[kind]} />
  {/if}

  <p class="provenance-note">Solid = measured · Dashed = simulated · Measurements take priority over simulations</p>

  <div class="box-list no-print">
    <h3>Enclosures</h3>
    {#if loading}
      <p class="muted">Loading…</p>
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
            <span class="badge badge-{rec.category}">{rec.category}</span>
            <span class="muted">{humanize(rec.topology)}</span>
          </label>
          <span class="kind-dots">
            {#each ALL_KINDS as k}
              <span
                class="kind-dot"
                class:kind-dot-active={rec.availableKinds.includes(k)}
                class:kind-dot-current={k === kind && rec.availableKinds.includes(k)}
                title={rec.availableKinds.includes(k) ? `${KIND_LABELS[k]} available` : `${KIND_LABELS[k]} missing`}
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
  }

  .link-btn:hover {
    border-color: var(--accent);
    color: var(--accent);
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

  .muted {
    color: var(--muted);
    font-size: 0.8rem;
  }
</style>
