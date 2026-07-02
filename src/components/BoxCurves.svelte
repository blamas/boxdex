<script lang="ts">
import { onMount } from "svelte";
import type { Translations } from "../i18n";
import { tt } from "../i18n";
import { CURVE_KINDS, type CurveKind, type ParsedCurve, toPairs } from "../lib/csv";
import {
  availSplCounts,
  type CurvesResponse,
  DISPLAY_KINDS,
  initialCurveView,
} from "../lib/curves";
import { SERIES_COLORS } from "../lib/echarts";

import { BASE } from "../lib/site";
import CurveChart from "./CurveChart.svelte";

interface Props {
  slug: string;
  name: string;
  t: Translations["boxCurves"];
  curveLabels: Translations["curveLabels"];
}

let { slug, name, t, curveLabels }: Props = $props();

let data = $state<CurvesResponse | null>(null);
let error = $state<string | null>(null);
let activeTab = $state<"sim" | "meas">("sim");
let activeDriverIdx = $state(0);
let activeKind = $state<CurveKind>("spl");
let activeStackCount = $state<number | null>(null);

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
  activeDriver
    ? DISPLAY_KINDS.filter((k) => {
        if (k === "spl")
          return !!(activeDriver.curves.spl || Object.keys(activeDriver.stacked).length > 0);
        return !!activeDriver.curves[k];
      })
    : []
);

// Count options shown under the SPL tab: 1× (plain) if a plain curve exists, then stacked counts.
const splCounts = $derived(
  activeKind === "spl" && activeDriver ? availSplCounts(activeDriver) : []
);

// The resolved count to display: use activeStackCount if valid, else first available.
const resolvedCount = $derived(
  activeKind === "spl" && splCounts.length > 0
    ? activeStackCount !== null && splCounts.includes(activeStackCount)
      ? activeStackCount
      : splCounts[0]
    : null
);

const series = $derived.by(() => {
  if (!activeDriver) return [];
  const dashed = activeTab === "sim";
  const label = dashed ? `${name} (sim)` : `${name} (meas)`;

  let curve: ParsedCurve | undefined;
  if (activeKind === "spl" && resolvedCount !== null && resolvedCount > 1) {
    curve = activeDriver.stacked[resolvedCount]?.curve;
  } else {
    curve = activeDriver.curves[activeKind];
  }
  if (!curve) return [];

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

const provenanceNote = $derived(
  activeDriver
    ? activeKind === "spl" && resolvedCount !== null && resolvedCount > 1
      ? (activeDriver.stacked[resolvedCount]?.note ?? null)
      : (activeDriver.notes[activeKind] ?? null)
    : null
);

function switchTab(tab: "sim" | "meas") {
  activeTab = tab;
  activeDriverIdx = 0;
  activeStackCount = null;
  const group = tab === "meas" ? data?.measurements : data?.simulations;
  activeKind = DISPLAY_KINDS.find((k) => group?.[0]?.curves[k]) ?? "spl";
}

function switchDriver(idx: number) {
  activeDriverIdx = idx;
  activeStackCount = null;
}

function switchKind(kind: CurveKind) {
  activeKind = kind;
  activeStackCount = null;
}
</script>

{#if error}
  <div class="empty-state">{tt(t.failedToLoad, { error })}</div>
{:else if !data}
  <div class="empty-state">{t.loading}</div>
{:else if data.simulations.length === 0 && data.measurements.length === 0}
  <div class="empty-state">{t.noData}</div>
{:else}
  <div class="box-curves">
    <div class="controls">
      <div class="tab-group">
        {#if data.measurements.length > 0}
          <button class:active={activeTab === "meas"} onclick={() => switchTab("meas")}>
            {t.measurement}
          </button>
        {/if}
        {#if data.simulations.length > 0}
          <button class:active={activeTab === "sim"} onclick={() => switchTab("sim")}>
            {t.simulation}
          </button>
        {/if}
      </div>

      {#if activeGroup.length > 1}
        <div class="tab-group">
          {#each activeGroup as dc, i}
            <button class:active={activeDriverIdx === i} onclick={() => switchDriver(i)}>
              {dc.driverId}
            </button>
          {/each}
        </div>
      {/if}

      <div class="tab-group">
        {#each availableKinds as kind}
          <button class:active={activeKind === kind} onclick={() => switchKind(kind)}>
            {curveLabels[kind]}
          </button>
        {/each}
      </div>

      {#if activeKind === "spl" && splCounts.length > 0}
        <div class="tab-group">
          {#each splCounts as cnt}
            <button
              class:active={resolvedCount === cnt}
              onclick={() => (activeStackCount = cnt)}
            >{cnt}×</button>
          {/each}
        </div>
      {/if}
    </div>

    {#if availableKinds.length > 0}
      <CurveChart series={series} yName={curveLabels[activeKind]} />
      {#if activeDriver}
        <p class="provenance-note">
          {activeDriver.source} &mdash;
          {activeTab === "sim" ? t.simulationDashed : t.measuredSolid}{provenanceNote ? ` · ${provenanceNote}` : ""}
        </p>
      {/if}
    {:else}
      <div class="empty-state">{tt(t.noKindCurve, { kind: activeKind })}</div>
    {/if}
  </div>
{/if}

<style>
  .box-curves {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  /* Chart-tip variant of the global note: centred under the graph. */
  .provenance-note {
    text-align: center;
  }

  .controls {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    align-items: center;
  }

</style>
