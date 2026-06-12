<script lang="ts">
import { onMount } from "svelte";
import { CURVE_KINDS, type CurveKind, SERIES_COLORS, toPairs } from "../lib/csv";
import { CURVE_Y_LABELS, type CurvesResponse, initialCurveView } from "../lib/curves";
import { humanize } from "../lib/format";
import { BASE } from "../lib/site";
import CurveChart from "./CurveChart.svelte";

let { slug, name }: { slug: string; name: string } = $props();

let data = $state<CurvesResponse | null>(null);
let error = $state<string | null>(null);
let activeTab = $state<"sim" | "meas">("sim");
let activeDriverIdx = $state(0);
let activeKind = $state<CurveKind>("spl");

onMount(async () => {
  try {
    const res = await fetch(`${BASE}/api/curves/${slug}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
    if (data) {
      const initial = initialCurveView(data);
      activeTab = initial.tab;
      activeKind = initial.kind;
    }
  } catch (e) {
    error = String(e);
  }
});

const activeGroup = $derived(
  data ? (activeTab === "meas" ? data.measurements : data.simulations) : []
);

const activeDriver = $derived(activeGroup[activeDriverIdx] ?? null);

const availableKinds = $derived(
  activeDriver ? CURVE_KINDS.filter((k) => activeDriver.curves[k]) : []
);

const series = $derived.by(() => {
  if (!activeDriver) return [];
  const curve = activeDriver.curves[activeKind];
  if (!curve) return [];
  const dashed = activeTab === "sim";
  const label = dashed ? `${name} (sim)` : `${name} (meas)`;
  return [
    {
      name: label,
      color: SERIES_COLORS[0],
      points: toPairs(curve),
      dashed,
      smooth: true,
    },
  ];
});

function switchTab(tab: "sim" | "meas") {
  activeTab = tab;
  activeDriverIdx = 0;
  const group = tab === "meas" ? data?.measurements : data?.simulations;
  const first = CURVE_KINDS.find((k) => group?.[0]?.curves[k]);
  if (first) activeKind = first;
}
</script>

{#if error}
  <div class="empty-state">Failed to load curves: {error}</div>
{:else if !data}
  <div class="empty-state">Loading…</div>
{:else if data.simulations.length === 0 && data.measurements.length === 0}
  <div class="empty-state">No curve data available for this enclosure.</div>
{:else}
  <div class="box-curves">
    <div class="controls">
      {#if data.simulations.length > 0 && data.measurements.length > 0}
        <div class="tab-group">
          <button class:active={activeTab === "sim"} onclick={() => switchTab("sim")}>
            Simulation
          </button>
          <button class:active={activeTab === "meas"} onclick={() => switchTab("meas")}>
            Measurement
          </button>
        </div>
      {:else}
        <span class="source-label">
          {data.measurements.length > 0 ? "Measurement" : "Simulation"}
        </span>
      {/if}

      {#if activeGroup.length > 1}
        <div class="driver-tabs">
          {#each activeGroup as dc, i}
            <button class:active={activeDriverIdx === i} onclick={() => (activeDriverIdx = i)}>
              {dc.driverId}
            </button>
          {/each}
        </div>
      {:else if activeDriver}
        <span class="driver-label">{activeDriver.driverId}</span>
      {/if}

      <div class="kind-tabs">
        {#each availableKinds as kind}
          <button class:active={activeKind === kind} onclick={() => (activeKind = kind)}>
            {humanize(kind)}
          </button>
        {/each}
      </div>
    </div>

    {#if availableKinds.length > 0}
      <CurveChart series={series} yName={CURVE_Y_LABELS[activeKind]} />
      {#if activeDriver}
        <p class="provenance-note">
          {activeDriver.source} &mdash;
          {activeTab === "sim" ? "simulation (dashed)" : "measured (solid)"}
        </p>
      {/if}
    {:else}
      <div class="empty-state">No {activeKind} curve for this driver.</div>
    {/if}
  </div>
{/if}

<style>
  .box-curves {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .controls {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    align-items: center;
  }

  .tab-group,
  .driver-tabs,
  .kind-tabs {
    display: flex;
    border: 1px solid var(--line);
    border-radius: 4px;
    overflow: hidden;
  }

  .tab-group button,
  .driver-tabs button,
  .kind-tabs button {
    background: var(--panel);
    border: none;
    border-right: 1px solid var(--line);
    color: var(--muted);
    padding: 0.3rem 0.75rem;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    text-transform: capitalize;
  }

  .tab-group button:last-child,
  .driver-tabs button:last-child,
  .kind-tabs button:last-child {
    border-right: none;
  }

  .tab-group button.active,
  .driver-tabs button.active,
  .kind-tabs button.active {
    color: var(--accent);
    background: var(--bg);
  }

  .source-label,
  .driver-label {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    color: var(--muted);
    padding: 0.3rem 0;
  }
</style>
