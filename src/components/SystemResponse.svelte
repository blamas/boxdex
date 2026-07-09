<script lang="ts">
import type { Translations } from "../i18n";
import type { Category } from "../lib/category";
import {
  applyCrossovers,
  resolveCrossovers,
  type XoPoint,
  type XoSide,
  type XoSuggestion,
  xoOverrideKey,
} from "../lib/crossover";
import { cssVar } from "../lib/echarts";
import { fmtHz } from "../lib/format";
import {
  arrayGainDb,
  type CrossoverSlot,
  clampXoFcHz,
  clampXoGainDb,
  compositeResponse,
  type SlotBand,
  spectralBalance,
  XO_FC_MAX_HZ,
  XO_FC_MIN_HZ,
  XO_GAIN_MAX_DB,
  XO_GAIN_MIN_DB,
  type XoState,
} from "../lib/stack";
import CrossoverStrip from "./CrossoverStrip.svelte";
import CurveChart from "./CurveChart.svelte";
import InfoTip from "./InfoTip.svelte";

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
  xoGains = $bindable({} as XoState["gains"]),
  hasSplData,
  curvesLoading,
  t,
}: {
  slotBands: SlotBand[];
  crossoverSlots: CrossoverSlot[];
  xoSuggestions: XoSuggestion[];
  xoApplied?: boolean;
  xoOverrides?: XoState["overrides"];
  xoGains?: XoState["gains"];
  hasSplData: boolean;
  curvesLoading: boolean;
  t: Translations["systemResponse"];
} = $props();

const xoPoints = $derived(resolveCrossovers(xoSuggestions, xoOverrides));

// Gain is a manual level trim, prediction/display only: it never feeds back into where a
// crossover point gets suggested (xoSuggestions/xoPoints are computed from the boxes' own
// raw curves). Mirrors real alignment practice, pick the crossover from driver capability
// first, trim levels for tonal balance after, not the other way around. Gated by the same
// "apply to prediction" toggle as the LR4 filtering, both are part of the same predicted
// alignment, off means off for both. Applied after LR4 filtering, order doesn't matter
// (both are additive in dB).
const activeBands = $derived.by(() => {
  if (!xoApplied) return slotBands;
  const filtered = applyCrossovers(slotBands, xoPoints);
  return filtered.map((band) => {
    const g = xoGains[band.id];
    if (!g) return band;
    return { ...band, points: band.points.map(([f, d]) => [f, d + g] as [number, number]) };
  });
});

// The input min/max attributes only constrain the spinners, not typed values: clamp
// here (and in decodeStack for URL-borne values) with the same shared bounds.
function setXoOverride(id: string, side: XoSide, value: string) {
  const n = Number(value);
  if (n > 0 && Number.isFinite(n)) {
    xoOverrides = { ...xoOverrides, [xoOverrideKey(id, side)]: Math.round(clampXoFcHz(n)) };
  } else {
    clearXoOverride(id, side);
  }
}

function clearXoOverride(id: string, side: XoSide) {
  const key = xoOverrideKey(id, side);
  const { [key]: _, ...rest } = xoOverrides;
  xoOverrides = rest;
}

function setGain(id: string, value: string) {
  const n = Number(value);
  if (Number.isFinite(n) && n !== 0) {
    xoGains = { ...xoGains, [id]: clampXoGainDb(n) };
  } else {
    clearGain(id);
  }
}

function clearGain(id: string) {
  const { [id]: _, ...rest } = xoGains;
  xoGains = rest;
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
    const textColor = cssVar("--text", "#c9d1d9");
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

// A model can appear in several slots with different colors (color is assigned per slot
// position); the first slot's color wins, a simple, deterministic pick. Shared by the
// crossover table (box name) and the mark lines below (so both agree on one color per box).
const bandColorById = $derived.by(() => {
  const map = new Map<string, string>();
  for (const b of slotBands) {
    if (!map.has(b.id)) map.set(b.id, b.color);
  }
  return map;
});

// Grouped by exact frequency, not just pushed one entry per corner: two boxes' corners
// still coincide until independently edited. The line itself stays neutral (see
// CurveChart); the label badge carries the color instead, border = the box being
// lowpassed here (its own highHz landed on this frequency, it plays below this point),
// text = the box being highpassed here (its own lowHz landed here, it plays above it).
// Either side falls back to the other when this frequency only has one contributor.
const xoMarkLines = $derived.by(() => {
  if (!xoApplied) return [];
  const byHz = new Map<number, { lowpassColor?: string; highpassColor?: string }>();
  for (const p of xoPoints) {
    const color = bandColorById.get(p.id);
    if (!color) continue;
    // p.lowHz is this box's own highpass corner: it's the "high" (highpass) side here.
    if (p.lowHz !== undefined) {
      const entry = byHz.get(p.lowHz) ?? {};
      entry.highpassColor = color;
      byHz.set(p.lowHz, entry);
    }
    // p.highHz is this box's own lowpass corner: it's the "low" (lowpass) side here.
    if (p.highHz !== undefined) {
      const entry = byHz.get(p.highHz) ?? {};
      entry.lowpassColor = color;
      byHz.set(p.highHz, entry);
    }
  }
  return [...byHz.entries()].map(([hz, { lowpassColor, highpassColor }]) => ({
    x: hz,
    label: `${fmtHz(hz)} Hz`,
    borderColor: lowpassColor,
    textColor: highpassColor,
  }));
});

const balance = $derived(spectralBalance(activeBands));

// One corner can be both approximated and extrapolated at once (the closest-approach
// point can itself land past a curve's own real data), but a single border can only show
// one style. Priority picks the more important caveat to display, gap (nothing reachable)
// > clamped (safety floor) > approximated (no real crossing exists) > extrapolated (a
// real crossing, just found past the data), and both the chip border and the legend use
// this same function, so they can never disagree about which state is showing.
type XoCornerStatus = "gap" | "clamped" | "approximated" | "extrapolated" | "none";

function cornerStatus(p: XoPoint, side: XoSide): XoCornerStatus {
  if (side === "lo") {
    if (p.lowCustom) return "none";
    if (p.lowGap) return "gap";
    if (p.clampedToCdMin) return "clamped";
    if (p.lowApproximated) return "approximated";
    if (p.lowExtrapolated) return "extrapolated";
  } else {
    if (p.highCustom) return "none";
    if (p.highGap) return "gap";
    if (p.highClampedToCdMin) return "clamped";
    if (p.highApproximated) return "approximated";
    if (p.highExtrapolated) return "extrapolated";
  }
  return "none";
}

// Only explained in the legend when at least one row actually shows it, so a clean stack
// shows no legend at all.
const hasAnyGap = $derived(
  xoPoints.some((p) => cornerStatus(p, "lo") === "gap" || cornerStatus(p, "hi") === "gap")
);
const hasAnyClamped = $derived(
  xoPoints.some((p) => cornerStatus(p, "lo") === "clamped" || cornerStatus(p, "hi") === "clamped")
);
const hasAnyApproximated = $derived(
  xoPoints.some(
    (p) => cornerStatus(p, "lo") === "approximated" || cornerStatus(p, "hi") === "approximated"
  )
);
const hasAnyExtrapolated = $derived(
  xoPoints.some(
    (p) => cornerStatus(p, "lo") === "extrapolated" || cornerStatus(p, "hi") === "extrapolated"
  )
);
</script>

<CrossoverStrip slots={crossoverSlots} />
{#if xoPoints.length > 0}
  <div class="xo-header">
    <span class="xo-label">
      {t.crossovers}
      <InfoTip text={t.crossoversTip} />
    </span>
    <label class="xo-toggle">
      <input type="checkbox" bind:checked={xoApplied} />
      {t.applyToPrediction}
    </label>
  </div>
  <div class="xo-table-wrap">
    <table class="xo-table">
      <thead>
        <tr>
          <th>{t.box}</th>
          <th>{t.highpass}</th>
          <th>{t.lowpass}</th>
          <th>{t.gain}</th>
        </tr>
      </thead>
      <tbody>
        {#each xoPoints as p}
          {@const lowSt = cornerStatus(p, "lo")}
          {@const highSt = cornerStatus(p, "hi")}
          <tr>
            <td class="xo-box-name" style:color={bandColorById.get(p.id)}>{p.name}</td>
            <td>
              <span
                class="xo-chip"
                class:xo-warn={p.lowWarnings.length > 0}
                class:xo-gap={lowSt === "gap"}
                class:xo-clamped={lowSt === "clamped"}
                class:xo-approximated={lowSt === "approximated"}
                class:xo-extrapolated={lowSt === "extrapolated"}
              >
                <input
                  class="xo-input"
                  type="number"
                  min={XO_FC_MIN_HZ}
                  max={XO_FC_MAX_HZ}
                  value={p.lowHz ?? ""}
                  placeholder=""
                  onchange={(e) => setXoOverride(p.id, "lo", (e.target as HTMLInputElement).value)}
                />
                Hz
              </span>
              <button
                class="xo-reset"
                class:xo-reset-hidden={!p.lowCustom}
                tabindex={p.lowCustom ? 0 : -1}
                onclick={() => clearXoOverride(p.id, "lo")}
                title={t.resetToSuggested}
              >↺</button>
            </td>
            <td>
              <span
                class="xo-chip"
                class:xo-warn={p.highWarnings.length > 0}
                class:xo-gap={highSt === "gap"}
                class:xo-clamped={highSt === "clamped"}
                class:xo-approximated={highSt === "approximated"}
                class:xo-extrapolated={highSt === "extrapolated"}
              >
                <input
                  class="xo-input"
                  type="number"
                  min={XO_FC_MIN_HZ}
                  max={XO_FC_MAX_HZ}
                  value={p.highHz ?? ""}
                  placeholder=""
                  onchange={(e) => setXoOverride(p.id, "hi", (e.target as HTMLInputElement).value)}
                />
                Hz
              </span>
              <button
                class="xo-reset"
                class:xo-reset-hidden={!p.highCustom}
                tabindex={p.highCustom ? 0 : -1}
                onclick={() => clearXoOverride(p.id, "hi")}
                title={t.resetToSuggested}
              >↺</button>
            </td>
            <td>
              <span class="xo-chip">
                <input
                  class="xo-input"
                  type="number"
                  step="0.5"
                  min={XO_GAIN_MIN_DB}
                  max={XO_GAIN_MAX_DB}
                  value={xoGains[p.id] ?? 0}
                  onchange={(e) => setGain(p.id, (e.target as HTMLInputElement).value)}
                />
                dB
              </span>
              <button
                class="xo-reset"
                class:xo-reset-hidden={!xoGains[p.id]}
                tabindex={xoGains[p.id] ? 0 : -1}
                onclick={() => clearGain(p.id)}
                title={t.resetGain}
              >↺</button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#if hasAnyGap || hasAnyClamped || hasAnyApproximated || hasAnyExtrapolated}
    <div class="xo-legend">
      {#if hasAnyGap}
        <span class="xo-legend-item"><span class="xo-swatch xo-gap"></span>{t.spectralGap}</span>
      {/if}
      {#if hasAnyClamped}
        <span class="xo-legend-item"><span class="xo-swatch xo-clamped"></span>{t.raisedToCdFloor}</span>
      {/if}
      {#if hasAnyApproximated}
        <span class="xo-legend-item"><span class="xo-swatch xo-approximated"></span>{t.approximated}</span>
      {/if}
      {#if hasAnyExtrapolated}
        <span class="xo-legend-item"><span class="xo-swatch xo-extrapolated"></span>{t.extrapolated}</span>
      {/if}
    </div>
  {/if}
  {#each xoPoints as p}
    {#each p.lowWarnings as w}
      <p class="xo-warning">⚠ {p.name} {t.highpass} at {p.lowHz} Hz: {w}</p>
    {/each}
    {#each p.highWarnings as w}
      <p class="xo-warning">⚠ {p.name} {t.lowpass} at {p.highHz} Hz: {w}</p>
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
  <div class="xo-chart-wrap">
    <CurveChart series={responseSeries} yName="SPL (dB)" markLines={xoMarkLines} />
    <p class="chart-note">
      {xoApplied ? t.chartNoteXo : t.chartNoteNoXo}
    </p>
  </div>
{:else if curvesLoading}
  <p class="muted">{t.loading}</p>
{:else if hasSplData}
  <p class="muted">{t.noSplYet}</p>
{:else}
  <p class="muted">{t.noSplAvailable}</p>
{/if}

<style>
  /* Plain divider between the strip above and the table below, no boxed panel. */
  .xo-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin: 0.75rem 0 0.65rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--line);
    font-family: var(--font-mono);
    font-size: 0.8rem;
  }

  /* Deliberately not styled like .xo-table th (uppercase/muted/small): this is a section
     label, not another row of column headers, keeping them visually distinct stops the
     two header-ish rows from blurring together right on top of each other. */
  .xo-label {
    color: var(--text);
    font-weight: 700;
    font-size: 0.8rem;
  }

  .xo-table-wrap {
    overflow-x: auto;
    border-radius: 3px;
  }

  .xo-table {
    border-collapse: collapse;
    width: 100%;
    font-family: var(--font-mono);
    font-size: 0.8rem;
  }

  .xo-table th {
    text-align: left;
    padding: 0.4rem 0.6rem 0.4rem 0;
    color: var(--muted);
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    border-bottom: 1px solid var(--line);
    white-space: nowrap;
  }

  .xo-table td {
    padding: 0.45rem 0.6rem 0.45rem 0;
    border-bottom: 1px solid var(--line);
    vertical-align: middle;
  }

  .xo-table tr:last-child td {
    border-bottom: none;
  }

  .xo-box-name {
    font-weight: 700;
    white-space: nowrap;
  }

  .xo-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.1rem 0.45rem;
    border: 1px solid var(--line);
    border-radius: 3px;
    color: var(--text);
    white-space: nowrap;
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
    margin-left: 0.3rem;
    vertical-align: middle;
  }

  .xo-reset:hover {
    background: color-mix(in srgb, var(--danger) 15%, transparent);
  }

  /* Always in the layout (never conditionally rendered), just hidden: keeps the cell's
     width constant so a value flipping to/from custom never shifts the table. */
  .xo-reset-hidden {
    visibility: hidden;
    pointer-events: none;
  }

  .xo-gap {
    border-color: var(--danger);
  }

  .xo-clamped {
    border-color: var(--accent-2);
  }

  /* Same dashed pattern as .xo-extrapolated, but a distinct color: approximated is a
     weaker guarantee (no exact crossing exists at all, just the closest approach) than
     extrapolated (an exact crossing, just found past a curve's own real data). */
  .xo-approximated {
    border-color: var(--danger);
    border-style: dashed;
  }

  .xo-extrapolated {
    border-color: var(--accent-2);
    border-style: dashed;
  }

  .xo-warn {
    border-color: var(--danger);
  }

  .xo-warn .xo-input {
    color: var(--danger);
    border-color: var(--danger);
  }

  .xo-warning {
    margin: 0.25rem 0 0;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--danger);
  }

  .xo-legend {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    margin: 0.5rem 0 0;
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--muted);
  }

  .xo-legend-item {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .xo-swatch {
    display: inline-block;
    width: 0.85rem;
    height: 0.85rem;
    border-radius: 2px;
    border-width: 2px;
    border-style: solid;
  }

  /* Compound selectors, not just .xo-approximated/.xo-extrapolated: keeps these dashed
     regardless of declaration order relative to .xo-swatch's own border-style (same
     specificity otherwise, order-dependent, which is what left the legend swatch solid
     before). */
  .xo-swatch.xo-approximated {
    border-style: dashed;
  }

  .xo-swatch.xo-extrapolated {
    border-style: dashed;
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

  /* Clear boundary between the controls above (strip/table/balance) and the predicted
     chart below, so the two read as distinct sub-sections rather than one long stack. */
  .xo-chart-wrap {
    margin-top: 1rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--line);
  }

  .muted {
    color: var(--muted);
    font-family: var(--font-mono);
    font-size: 0.875rem;
  }
</style>
