<script lang="ts">
import type { Translations } from "../i18n";
import type { Category } from "../lib/category";
import { applyCrossovers, resolveCrossovers, type XoSuggestion } from "../lib/crossover";
import { fmtHz } from "../lib/format";
import { arrayGainDb, compositeResponse, spectralBalance, type XoState } from "../lib/stack";
import CrossoverStrip from "./CrossoverStrip.svelte";
import CurveChart from "./CurveChart.svelte";

interface SlotBand {
  category: Category;
  qty: number;
  points: [number, number][];
  name: string;
  color: string;
}

interface CrossoverSlot {
  category: Category;
  f3Hz: number;
  upperHz: number;
  name: string;
}

interface ChartSeries {
  name: string;
  color: string;
  points: [number, number][];
  dashed: boolean;
  width?: number;
}

let {
  slotBands,
  crossoverSlots,
  xoSuggestions,
  xoApplied = $bindable(false),
  xoOverrides = $bindable({} as XoState["overrides"]),
  hasSplData,
  curvesLoading,
  t,
}: {
  slotBands: SlotBand[];
  crossoverSlots: CrossoverSlot[];
  xoSuggestions: XoSuggestion[];
  xoApplied?: boolean;
  xoOverrides?: XoState["overrides"];
  hasSplData: boolean;
  curvesLoading: boolean;
  t: Translations["systemResponse"];
} = $props();

const xoPoints = $derived(resolveCrossovers(xoSuggestions, xoOverrides));
const activeBands = $derived(xoApplied ? applyCrossovers(slotBands, xoPoints) : slotBands);

function setXoOverride(low: (typeof xoPoints)[number]["low"], value: string) {
  const n = Number(value);
  if (n > 0 && Number.isFinite(n)) {
    xoOverrides = { ...xoOverrides, [low]: Math.round(n) };
  } else {
    clearXoOverride(low);
  }
}

function clearXoOverride(low: (typeof xoPoints)[number]["low"]) {
  const { [low]: _, ...rest } = xoOverrides;
  xoOverrides = rest;
}

const responseSeries = $derived.by<ChartSeries[]>(() => {
  const bands: ChartSeries[] = activeBands.map((band) => {
    const gain = arrayGainDb(band.category, band.qty);
    return {
      name: band.name,
      color: band.color,
      points: band.points.map(([f, d]) => [f, d + gain] as [number, number]),
      dashed: true,
    };
  });
  const composite = compositeResponse(activeBands, xoApplied ? "coherent" : "power");
  if (composite.length > 0) {
    const textColor =
      getComputedStyle(document.documentElement).getPropertyValue("--text").trim() || "#c9d1d9";
    bands.push({
      name: t.systemPredicted,
      color: textColor,
      points: composite,
      dashed: false,
      width: 3,
    });
  }
  return bands;
});

const xoMarkLines = $derived(
  xoApplied
    ? xoPoints.flatMap((p) =>
        p.fcHz !== undefined ? [{ x: p.fcHz, label: `${fmtHz(p.fcHz)} Hz` }] : []
      )
    : []
);

const balance = $derived(spectralBalance(activeBands));
</script>

{#snippet infoTip(text: string)}
  <button type="button" class="tip" aria-label={text}>
    ⓘ<span class="tip-bubble">{text}</span>
  </button>
{/snippet}

<CrossoverStrip slots={crossoverSlots} />
{#if xoPoints.length > 0}
  <div class="xo-row">
    <span class="xo-label">
      {t.crossovers}
      {@render infoTip(t.crossoversTip)}
    </span>
    {#each xoPoints as p}
      <span
        class="xo-chip"
        class:xo-clamped={p.clampedToCdMin}
        class:xo-warn={p.warnings.length > 0}
        class:xo-gap={p.gap}
      >
        {p.low}/{p.high}
        <input
          class="xo-input"
          type="number"
          min="20"
          max="20000"
          value={p.fcHz ?? ""}
          placeholder=""
          onchange={(e) => setXoOverride(p.low, (e.target as HTMLInputElement).value)}
        />
        Hz
        {#if p.custom}
          <button class="xo-reset" onclick={() => clearXoOverride(p.low)} title={t.resetToSuggested}>↺</button>
        {:else if p.gap}
          · {t.spectralGap}
        {:else if p.clampedToCdMin}
          · {t.raisedToCdFloor}
        {:else if p.source === "recommended"}
          · {t.stated}
        {/if}
      </span>
    {/each}
    <label class="xo-toggle">
      <input type="checkbox" bind:checked={xoApplied} />
      {t.applyToPrediction}
    </label>
  </div>
  {#each xoPoints as p}
    {#each p.warnings as w}
      <p class="xo-warning">⚠ {p.low}/{p.high} at {p.fcHz} Hz: {w}</p>
    {/each}
  {/each}
{/if}
{#if balance}
  {@const [balancePre, balancePost] = t.spectralBalance.split("{tilt}")}
  {@const tiltLabel = `${balance.tiltDb >= 0 ? "+" : ""}${balance.tiltDb.toFixed(1)} dB`}
  <p class="balance">
    {balancePre}<strong>{tiltLabel}</strong>{balancePost ?? ""}
    <span class="muted">({balance.subAvgDb.toFixed(0)} / {balance.topAvgDb.toFixed(0)} dB {t.spectralBalanceSuffix})</span>
  </p>
{/if}
{#if responseSeries.length > 0}
  <CurveChart series={responseSeries} yName="SPL (dB)" markLines={xoMarkLines} />
  <p class="chart-note">
    {xoApplied ? t.chartNoteXo : t.chartNoteNoXo}
  </p>
{:else if curvesLoading}
  <p class="muted">{t.loading}</p>
{:else if hasSplData}
  <p class="muted">{t.noSplYet}</p>
{:else}
  <p class="muted">{t.noSplAvailable}</p>
{/if}

<style>
  .xo-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin: 0.75rem 0;
    font-family: var(--font-mono);
    font-size: 0.8rem;
  }

  .xo-label {
    color: var(--muted);
    text-transform: uppercase;
    font-size: 0.65rem;
    letter-spacing: 0.08em;
  }

  .xo-chip {
    padding: 0.1rem 0.45rem;
    border: 1px solid var(--line);
    border-radius: 3px;
    color: var(--text);
  }

  .xo-input {
    width: 4.2rem;
    background: var(--bg);
    border: 1px solid var(--line);
    color: var(--accent);
    font-family: var(--font-mono);
    font-size: 0.8rem;
    font-weight: 700;
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
    text-align: right;
  }

  .xo-input::-webkit-inner-spin-button,
  .xo-input::-webkit-outer-spin-button {
    -webkit-appearance: none;
  }

  .xo-reset {
    background: none;
    border: 1px solid var(--danger);
    border-radius: 3px;
    color: var(--danger);
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 700;
    padding: 0.05rem 0.3rem;
    line-height: 1;
  }

  .xo-reset:hover {
    background: color-mix(in srgb, var(--danger) 15%, transparent);
  }

  .xo-clamped {
    border-color: var(--accent-2);
  }

  .xo-warn {
    border-color: var(--danger);
  }

  .xo-warn .xo-input {
    color: var(--danger);
    border-color: var(--danger);
  }

  .xo-gap {
    border-color: var(--danger);
    color: var(--danger);
  }

  .xo-warning {
    margin: 0.25rem 0 0;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--danger);
  }

  .xo-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    margin-left: auto;
    cursor: pointer;
    color: var(--text);
    line-height: 1;
  }

  .xo-toggle input {
    margin: 0;
  }

  .balance {
    margin: 0.75rem 0;
    font-family: var(--font-mono);
    font-size: 0.85rem;
    color: var(--text);
  }

  .balance strong {
    color: var(--accent);
  }

  .chart-note {
    margin: 0.5rem 0 0;
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--muted);
    text-align: center;
  }

  .tip {
    position: relative;
    display: inline;
    padding: 0;
    background: none;
    border: none;
    border-bottom: 1px dotted var(--muted);
    font: inherit;
    cursor: help;
    color: var(--muted);
    outline: none;
  }

  .tip-bubble {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 0;
    z-index: 10;
    width: max-content;
    max-width: 260px;
    padding: 0.5rem 0.6rem;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 4px;
    color: var(--text);
    font-size: 0.7rem;
    line-height: 1.4;
    text-transform: none;
    letter-spacing: normal;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.12s;
  }

  .tip:hover .tip-bubble,
  .tip:focus-visible .tip-bubble {
    opacity: 1;
    visibility: visible;
  }

  .muted {
    color: var(--muted);
    font-family: var(--font-mono);
    font-size: 0.875rem;
  }
</style>
