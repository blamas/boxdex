<script lang="ts">
import { onMount } from "svelte";
import { type Translations, tt } from "../i18n";
import { CATEGORIES, type Category } from "../lib/category";
import { suggestCrossovers, type XoBand } from "../lib/crossover";
import { SERIES_COLORS, toPairs } from "../lib/csv";
import { type CurvesResponse, curveEntries, resolveCurveEntry } from "../lib/curves";
import { fmtHz, fmtOhm, fmtW } from "../lib/format";
import type { EnclosureRecord } from "../lib/metrics";
import { BASE } from "../lib/site";
import {
  AMP_EFFICIENCY,
  CATEGORY_UPPER_HZ,
  type CoverageInputs,
  calcCoverage,
  DEFAULT_CREST_DB,
  decodeStack,
  encodeStack,
  GENERATOR_HEADROOM,
  recommendedGeneratorW,
  type StackSlot,
  summarizeStack,
  type XoState,
} from "../lib/stack";
import { ampChannelW, wiringOptions } from "../lib/wiring";
import Combobox from "./Combobox.svelte";
import ExportMenu from "./ExportMenu.svelte";
import PageActions from "./PageActions.svelte";
import SystemResponse from "./SystemResponse.svelte";

let {
  t,
  tSystemResponse,
}: {
  t: Translations["stackBuilder"];
  tSystemResponse: Translations["systemResponse"];
} = $props();

let records = $state<EnclosureRecord[]>([]);
let stack = $state<StackSlot[]>([]);
let coverage = $state<CoverageInputs>({
  distanceM: 20,
  targetSplDb: 103,
  crestDb: DEFAULT_CREST_DB,
});
let curveCache = $state<Record<string, CurvesResponse>>({});
let loading = $state(true);
let initialized = $state(false);
let xoApplied = $state(false);
let xoOverrides = $state<XoState["overrides"]>({});
let pickerCat = $state<Category | null>(null);
let pickerQuery = $state("");
let pickerEl = $state<HTMLDivElement>();

$effect(() => {
  if (!initialized) return;
  const encoded = encodeStack(stack, coverage, { applied: xoApplied, overrides: xoOverrides });
  try {
    localStorage.setItem("boxdex-stack", encoded);
  } catch (_) {}
  history.replaceState(null, "", encoded ? `#${encoded}` : location.pathname);
});

$effect(() => {
  for (const slot of stack) {
    const rec = records.find((r) => r.slug === slot.slug);
    if (rec?.availableKinds.includes("spl") && !curveCache[slot.slug]) {
      fetch(`${BASE}/api/curves/${slot.slug}.json`)
        .then((r) => r.json())
        .then((d: CurvesResponse) => {
          curveCache = { ...curveCache, [slot.slug]: d };
        });
    }
  }
});

onMount(async () => {
  const hash = location.hash.slice(1);
  const saved = hash || localStorage.getItem("boxdex-stack") || "";
  if (saved) {
    const decoded = decodeStack(saved);
    stack = decoded.state;
    coverage = decoded.cov;
    xoApplied = decoded.xo.applied;
    xoOverrides = decoded.xo.overrides;
  }

  const res = await fetch(`${BASE}/api/manifest.json`);
  records = await res.json();

  loading = false;
  initialized = true;
});

const resolvedSlots = $derived.by(() =>
  stack.flatMap((slot, i) => {
    const rec = records.find((r) => r.slug === slot.slug);
    return rec ? [{ i, slot, rec }] : [];
  })
);

const summary = $derived(
  summarizeStack(resolvedSlots.map(({ slot, rec }) => ({ qty: slot.qty, rec })))
);

const coverageResults = $derived.by(() =>
  resolvedSlots.map(({ i, slot, rec }) => {
    const base = calcCoverage(
      rec.metrics.maxSplDb,
      rec.category,
      slot.qty,
      coverage.distanceM,
      coverage.targetSplDb,
      coverage.crestDb
    );
    return { i, slot, rec, base };
  })
);

// Iterate stack directly so slot.curveSelection is tracked as a live $state property.
// When a curve is loaded, use its actual frequency range; fall back to manifest specs.
const crossoverSlots = $derived.by(() =>
  stack.flatMap((slot) => {
    const rec = records.find((r) => r.slug === slot.slug);
    if (!rec) return [];
    const payload = curveCache[slot.slug];
    if (payload) {
      const entry = resolveCurveEntry(payload, "spl", slot.curveSelection);
      const curve = entry?.dc.curves.spl;
      if (curve && curve.freq.length >= 2) {
        return [
          {
            category: rec.category,
            f3Hz: curve.freq[0],
            upperHz: curve.freq[curve.freq.length - 1],
            name: rec.name,
          },
        ];
      }
    }
    return [
      {
        category: rec.category,
        f3Hz: rec.metrics.f3Hz ?? 20,
        upperHz: rec.recommendedCrossoverHz ?? CATEGORY_UPPER_HZ[rec.category],
        name: rec.name,
      },
    ];
  })
);

// Bands feeding the predicted system response, with per-band quantities and the
// series styling their slot gets on the chart.
interface SlotBand {
  category: Category;
  qty: number;
  points: [number, number][];
  name: string;
  color: string;
}

// Iterate `stack` directly (not resolvedSlots) so Svelte 5 tracks slot.curveSelection
// as a live $state proxy property, derived intermediaries can lose proxy identity.
const slotBands = $derived.by<SlotBand[]>(() =>
  stack.flatMap((slot, i) => {
    const rec = records.find((r) => r.slug === slot.slug);
    if (!rec) return [];
    const payload = curveCache[slot.slug];
    if (!payload) return [];
    const entry = resolveCurveEntry(payload, "spl", slot.curveSelection);
    if (!entry) return [];
    const curve = entry.dc.curves.spl;
    if (!curve) return [];
    return [
      {
        category: rec.category,
        qty: slot.qty,
        points: toPairs(curve),
        name: `${rec.name} ×${slot.qty}`,
        color: SERIES_COLORS[i % SERIES_COLORS.length],
      },
    ];
  })
);

const xoSuggestions = $derived(
  suggestCrossovers(
    resolvedSlots.map(
      ({ rec }): XoBand => ({
        category: rec.category,
        f3Hz: rec.metrics.f3Hz,
        recommendedXoHz: rec.recommendedCrossoverHz,
        minCrossoverHz: rec.minCrossoverHz,
      })
    )
  )
);

$effect(() => {
  if (!pickerCat) return;
  function onClickOutside(e: MouseEvent) {
    if (pickerEl && !pickerEl.contains(e.target as Node)) pickerCat = null;
  }
  const timer = setTimeout(() => document.addEventListener("click", onClickOutside), 0);
  return () => {
    clearTimeout(timer);
    document.removeEventListener("click", onClickOutside);
  };
});

function togglePicker(cat: Category) {
  pickerCat = pickerCat === cat ? null : cat;
  pickerQuery = "";
}

function addFromPicker(slug: string) {
  stack = [...stack, { slug, qty: 1 }];
  pickerCat = null;
  pickerQuery = "";
}

function removeSlot(idx: number) {
  stack = stack.filter((_, i) => i !== idx);
}

function changeSlug(idx: number, slug: string) {
  if (!slug) return;
  stack[idx] = { slug, qty: stack[idx].qty };
}

function adjustQty(idx: number, delta: number) {
  const next = [...stack];
  next[idx] = { ...next[idx], qty: Math.max(1, Math.min(99, next[idx].qty + delta)) };
  stack = next;
}

function setQtyFromInput(idx: number, value: string) {
  const n = Number.parseInt(value, 10);
  if (n >= 1 && n <= 99) {
    const next = [...stack];
    next[idx] = { ...next[idx], qty: n };
    stack = next;
  }
}

const hasSplData = $derived(resolvedSlots.some(({ rec }) => rec.availableKinds.includes("spl")));
const curvesLoading = $derived(
  resolvedSlots.some(
    ({ slot, rec }) => rec.availableKinds.includes("spl") && !curveCache[slot.slug]
  )
);
</script>

{#snippet infoTip(text: string)}
  <button type="button" class="tip" aria-label={text}>
    ⓘ<span class="tip-bubble">{text}</span>
  </button>
{/snippet}

<div class="stack-builder">
  <PageActions>
    <ExportMenu onPrint={() => window.print()} />
  </PageActions>

  {#if loading}
    <p class="muted">{t.loading}</p>
  {:else}
    <section class="section">
      <h2 class="section-title">{t.builder}</h2>

      {#if stack.length === 0}
        <p class="muted empty-hint">{t.emptyHint}</p>
      {:else}
        <div class="slots">
          {#each resolvedSlots as { i, slot, rec }}
            <div class="slot">
              <div class="slot-row">
                <span class="badge badge-{rec.category}">{rec.category}</span>
                <div class="slot-select">
                  <Combobox
                    items={records.filter((r) => r.category === rec.category)}
                    getId={(r) => r.slug}
                    getLabel={(r) => r.name}
                    value={slot.slug}
                    placeholder={t.search}
                    onselect={(slug) => changeSlug(i, slug)}
                  />
                </div>
                <button class="remove-btn" onclick={() => removeSlot(i)} title={t.remove}>×</button>
              </div>
              <div class="slot-row slot-controls">
                <div class="qty-control">
                  <button onclick={() => adjustQty(i, -1)} disabled={slot.qty <= 1}>−</button>
                  <input
                    type="number"
                    min="1"
                    max="99"
                    value={slot.qty}
                    oninput={(e) => setQtyFromInput(i, (e.target as HTMLInputElement).value)}
                    class="qty-input"
                  />
                  <button onclick={() => adjustQty(i, +1)}>+</button>
                </div>
                <span class="slot-specs">
                  f3 {rec.metrics.f3Hz} Hz
                  {#if rec.metrics.maxSplDb !== undefined}· {rec.metrics.maxSplDb} dB max{/if}
                  {#if rec.metrics.weightKg !== undefined}· {rec.metrics.weightKg} kg/cab{/if}
                  {#if rec.recommendedPowerW !== undefined}· {rec.recommendedPowerW} W AES/cab{/if}
                </span>
                {#if curveCache[slot.slug]}
                  {@const entries = curveEntries(curveCache[slot.slug], "spl")}
                  {@const effectiveKey = resolveCurveEntry(curveCache[slot.slug], "spl", slot.curveSelection)?.key ?? ""}
                  {#if entries.length > 1}
                    <select
                      class="curve-sel"
                      value={effectiveKey}
                      onchange={(e) => {
                        stack[i].curveSelection = (e.target as HTMLSelectElement).value;
                      }}
                    >
                      {#each entries as e}
                        <option value={e.key}>{e.label}</option>
                      {/each}
                    </select>
                  {/if}
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}

      <div class="add-area" bind:this={pickerEl}>
        <div class="add-row">
          {#each CATEGORIES as cat}
            <button
              class="add-cat-btn badge badge-{cat}"
              class:add-cat-active={pickerCat === cat}
              onclick={() => togglePicker(cat)}
              disabled={records.filter((r) => r.category === cat).length === 0}
            >+ {cat}</button>
          {/each}
        </div>
        {#if pickerCat}
          {@const allCatRecords = records.filter((r) => r.category === pickerCat)}
          {@const q = pickerQuery.trim().toLowerCase()}
          {@const catRecords = q ? allCatRecords.filter((r) => r.name.toLowerCase().includes(q)) : allCatRecords}
          <div class="picker" role="listbox">
            {#if allCatRecords.length > 6}
              <input
                class="picker-search"
                type="text"
                placeholder={t.search}
                bind:value={pickerQuery}
                autocomplete="off"
                spellcheck={false}
              />
            {/if}
            {#each catRecords as r}
              <button class="picker-item" role="option" aria-selected="false" onclick={() => addFromPicker(r.slug)}>
                <span class="picker-name">{r.name}</span>
                <span class="picker-specs">
                  f3 {r.metrics.f3Hz} Hz
                  {#if r.metrics.maxSplDb !== undefined}· {r.metrics.maxSplDb} dB{/if}
                  {#if r.metrics.volumeL !== undefined}· {r.metrics.volumeL} L{/if}
                </span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </section>

    {#if resolvedSlots.length > 0}
      <section class="section">
        <h2 class="section-title">{t.summary}</h2>
        <div class="summary-groups">
          <div class="summary-group">
            <span class="group-label">{t.physical}</span>
            <div class="summary-grid">
              <div class="summary-item">
                <span class="summary-val">{summary.totalCabs}</span>
                <span class="summary-label">{t.cabinets}</span>
              </div>
              <div class="summary-item">
                <span class="summary-val">{summary.weightMissing ? "~" : ""}{summary.totalWeightKg.toFixed(0)} kg</span>
                <span class="summary-label">{t.totalWeight}</span>
              </div>
              <div class="summary-item">
                <span class="summary-val">{summary.totalTransportM3.toFixed(2)} m³</span>
                <span class="summary-label">
                  {t.transportVolume}
                  {@render infoTip(t.transportVolumeTip)}
                </span>
              </div>
              {#if summary.totalSheets > 0}
                <div class="summary-item">
                  <span class="summary-val">{summary.sheetsMissing ? "~" : ""}{summary.totalSheets}</span>
                  <span class="summary-label">
                    {t.plywoodSheets}
                    {@render infoTip(tt(t.plywoodTip, { sheetInfo: summary.sheetSizes.length > 0 ? `, assuming ${summary.sheetSizes.join(" / ")} mm sheets` : "" }))}
                  </span>
                </div>
              {/if}
            </div>
          </div>

          {#if summary.systemMaxSplDb !== undefined || (summary.lowHz !== undefined && summary.highHz !== undefined)}
            <div class="summary-group">
              <span class="group-label">{t.acoustic}</span>
              <div class="summary-grid">
                {#if summary.systemMaxSplDb !== undefined}
                  <div class="summary-item">
                    <span class="summary-val">{summary.maxSplPartial ? "~" : ""}{summary.systemMaxSplDb.toFixed(0)} dB</span>
                    <span class="summary-label">
                      {t.maxSplLabel}
                      {@render infoTip(t.maxSplTip)}
                    </span>
                  </div>
                {/if}
                {#if summary.lowHz !== undefined && summary.highHz !== undefined}
                  <div class="summary-item">
                    <span class="summary-val">{fmtHz(summary.lowHz)}-{fmtHz(summary.highHz)}</span>
                    <span class="summary-label">{t.bandwidth}</span>
                  </div>
                {/if}
              </div>
            </div>
          {/if}

          {#if summary.totalPowerAesW > 0}
            <div class="summary-group">
              <span class="group-label">{t.powerElectrical}</span>
              <div class="summary-grid">
                <div class="summary-item">
                  <span class="summary-val">{summary.powerMissing ? "~" : ""}{fmtW(summary.totalPowerAesW)}</span>
                  <span class="summary-label">{t.aesContinuous}</span>
                </div>
                {#if summary.hasProgram}
                  <div class="summary-item">
                    <span class="summary-val">{fmtW(summary.totalPowerProgramW)}</span>
                    <span class="summary-label">{t.programPower}</span>
                  </div>
                {/if}
                <div class="summary-item">
                  <span class="summary-val">{summary.powerMissing ? "~" : ""}{fmtW(summary.totalPowerAesW * 2)}</span>
                  <span class="summary-label">
                    {t.ampPeak}
                    {@render infoTip(t.ampPeakTip)}
                  </span>
                </div>
                <div class="summary-item">
                  <span class="summary-val">{summary.powerMissing ? "~" : ""}{fmtW(Math.round(recommendedGeneratorW(summary.totalPowerAesW)))}</span>
                  <span class="summary-label">
                    {t.minGenerator}
                    {@render infoTip(tt(t.generatorTip, { efficiency: String(AMP_EFFICIENCY), headroom: String(GENERATOR_HEADROOM) }))}
                  </span>
                </div>
              </div>
            </div>
          {/if}
        </div>
      </section>

      <section class="section">
        <h2 class="section-title">{t.ampMatching}</h2>
        <div class="cov-results">
          {#each resolvedSlots as { slot, rec }}
            {@const aesPerCab = rec.powerAesW ?? rec.recommendedPowerW}
            {@const amp = aesPerCab !== undefined ? ampChannelW(aesPerCab, slot.qty) : undefined}
            <div class="cov-row">
              <span class="badge badge-{rec.category}">{rec.category}</span>
              <span class="cov-name">{rec.name} ×{slot.qty}</span>
              {#if rec.nominalImpedanceOhm !== undefined}
                <span class="amp-wirings">
                  {#each wiringOptions(rec.nominalImpedanceOhm, slot.qty) as opt}
                    <span class="wiring-chip wiring-{opt.rating}">{opt.label} · {fmtOhm(opt.loadOhm)} Ω</span>
                  {/each}
                </span>
              {:else}
                <span class="muted">{t.noImpedance}</span>
              {/if}
              {#if amp}
                <span class="cov-spl">{@html tt(t.ampChannel, { min: fmtW(amp.minW), ideal: `<strong>${fmtW(amp.idealW)}</strong>` })}</span>
              {:else}
                <span class="muted">{t.noPower}</span>
              {/if}
            </div>
          {/each}
        </div>
        <p class="cov-note">{t.wiringsNote}</p>
      </section>

      <section class="section">
        <h2 class="section-title">{t.coverage}</h2>
        <div class="cov-inputs">
          <label class="cov-label">
            <span>{t.depthFromStack}</span>
            <input
              type="number"
              min="1"
              class="cov-input"
              value={coverage.distanceM}
              oninput={(e) => {
                const n = Number((e.target as HTMLInputElement).value);
                if (n > 0) coverage = { ...coverage, distanceM: n };
              }}
            />
            <span>m</span>
          </label>
          <label class="cov-label">
            <span>{t.targetSpl}</span>
            <input
              type="number"
              min="80"
              max="140"
              class="cov-input"
              value={coverage.targetSplDb}
              oninput={(e) => {
                const n = Number((e.target as HTMLInputElement).value);
                if (n >= 80 && n <= 140) coverage = { ...coverage, targetSplDb: n };
              }}
            />
            <span>dB</span>
          </label>
          <label class="cov-label">
            <span>{t.crestFactor}</span>
            <input
              type="number"
              min="0"
              max="20"
              class="cov-input"
              value={coverage.crestDb}
              oninput={(e) => {
                const n = Number((e.target as HTMLInputElement).value);
                if (n >= 0 && n <= 20) coverage = { ...coverage, crestDb: n };
              }}
            />
            <span>dB</span>
          </label>
        </div>

        <div class="cov-results">
          {#each coverageResults as row}
            {@const { slot, rec } = row}
            <div class="cov-row">
              <span class="badge badge-{rec.category}">{rec.category}</span>
              <span class="cov-name">{rec.name} ×{slot.qty}</span>
              {#if row.base}
                {@const base = row.base}
                <span class="cov-spl">
                  {tt(t.splPerCab, { spl: base.splAtD.toFixed(1) })} {#if base.arrayGainDb > 0}{tt(t.arrayGain, { gain: base.arrayGainDb.toFixed(1) })}{/if} → <strong>{base.systemSplAtD.toFixed(1)} dB</strong> {tt(t.at, { d: base.d.toFixed(1) })}
                </span>
                {#if base.headroomDb >= 0}
                  <span class="margin margin-ok">{tt(t.headroomOk, { n: base.headroomDb.toFixed(1) })}</span>
                {:else if base.headroomDb >= -3}
                  <span class="margin margin-low">{tt(t.headroomLow, { n: base.headroomDb.toFixed(1) })}</span>
                {:else}
                  <span class="margin margin-bad">{tt(t.needMore, { n: base.headroomDb.toFixed(1), need: String(base.nNeeded), more: String(Math.max(0, base.nNeeded - slot.qty)) })}</span>
                {/if}
              {:else}
                <span class="muted">{t.noSpl}</span>
              {/if}
            </div>
          {/each}
        </div>
        <p class="cov-note">{tt(t.coverageNote, { crestDb: String(coverage.crestDb) })}</p>
      </section>

      {#if resolvedSlots.length > 1}
        <section class="section">
          <h2 class="section-title">{t.systemResponse}</h2>
          <SystemResponse
            {slotBands}
            {crossoverSlots}
            {xoSuggestions}
            bind:xoApplied
            bind:xoOverrides
            {hasSplData}
            {curvesLoading}
            t={tSystemResponse}
          />
        </section>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .stack-builder {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .section {
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 1rem;
    background: var(--panel);
  }

  .section-title {
    margin: 0 0 0.75rem;
    font-size: 0.7rem;
    font-family: var(--font-mono);
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .empty-hint {
    margin: 0 0 0.75rem;
  }

  .slots {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .slot {
    border: 1px solid var(--muted);
    border-radius: 4px;
    padding: 0.5rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .slot-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  .slot-select {
    flex: 1;
    min-width: 160px;
    background: var(--bg);
    border: 1px solid var(--line);
    color: var(--text);
    padding: 0.3rem 0.5rem;
    font-family: var(--font-mono);
    font-size: 0.875rem;
    border-radius: 3px;
  }

  .remove-btn {
    background: none;
    border: 1px solid var(--line);
    color: var(--muted);
    border-radius: 3px;
    padding: 0.15rem 0.45rem;
    font-family: var(--font-mono);
    font-size: 0.85rem;
    cursor: pointer;
    flex-shrink: 0;
  }

  .remove-btn:hover {
    border-color: var(--accent-2);
    color: var(--accent-2);
  }

  .slot-controls {
    padding-left: 0.25rem;
  }

  .qty-control {
    display: flex;
    align-items: center;
    border: 1px solid var(--line);
    border-radius: 3px;
    overflow: hidden;
    flex-shrink: 0;
  }

  .qty-control button {
    background: var(--panel);
    border: none;
    color: var(--text);
    padding: 0.25rem 0.6rem;
    font-family: var(--font-mono);
    font-size: 1rem;
    cursor: pointer;
    line-height: 1;
  }

  .qty-control button:first-child {
    border-right: 1px solid var(--line);
  }

  .qty-control button:last-child {
    border-left: 1px solid var(--line);
  }

  .qty-control button:disabled {
    color: var(--line);
    cursor: default;
  }

  .qty-input {
    width: 3.5rem;
    text-align: center;
    background: var(--bg);
    border: none;
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 0.875rem;
    padding: 0.25rem 0;
  }

  .qty-input::-webkit-inner-spin-button,
  .qty-input::-webkit-outer-spin-button {
    -webkit-appearance: none;
  }

  .slot-specs {
    color: var(--muted);
    font-family: var(--font-mono);
    font-size: 0.78rem;
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

  .add-area {
    margin-top: 0.5rem;
  }

  .add-row {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .add-cat-btn {
    cursor: pointer;
    opacity: 0.65;
    transition: opacity 0.1s, box-shadow 0.1s;
  }

  .add-cat-btn:hover:not(:disabled) {
    opacity: 1;
  }

  .add-cat-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .add-cat-active {
    opacity: 1;
    box-shadow: 0 0 0 1px currentColor;
  }

  .picker {
    margin-top: 0.4rem;
    border: 1px solid var(--line);
    border-radius: 4px;
    overflow-y: auto;
    max-height: 260px;
    background: var(--bg);
  }

  .picker-search {
    display: block;
    width: 100%;
    background: var(--bg);
    border: none;
    border-bottom: 1px solid var(--line);
    color: var(--text);
    padding: 0.45rem 0.75rem;
    font-family: var(--font-mono);
    font-size: 0.875rem;
    outline: none;
    box-sizing: border-box;
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .picker-search:focus {
    border-bottom-color: var(--accent);
  }

  .picker-item {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 1rem;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    border-bottom: 1px solid var(--line);
    padding: 0.45rem 0.75rem;
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: 0.875rem;
    color: var(--text);
  }

  .picker-item:last-child {
    border-bottom: none;
  }

  .picker-item:hover {
    background: var(--panel);
    color: var(--accent);
  }

  .picker-item:hover .picker-specs {
    color: inherit;
  }

  .picker-name {
    flex: 1;
  }

  .picker-specs {
    color: var(--muted);
    font-size: 0.75rem;
    white-space: nowrap;
  }

  .summary-groups {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .summary-group + .summary-group {
    border-top: 1px solid var(--line);
    padding-top: 1rem;
  }

  .group-label {
    display: block;
    margin-bottom: 0.6rem;
    font-family: var(--font-mono);
    font-size: 0.65rem;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 0.75rem 2rem;
  }

  .summary-item {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .summary-val {
    font-family: var(--font-mono);
    font-size: 1.35rem;
    font-weight: 700;
    color: var(--accent);
    line-height: 1.1;
  }

  .summary-label {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--muted);
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

  .cov-inputs {
    display: flex;
    gap: 1.5rem;
    flex-wrap: wrap;
    margin-bottom: 1rem;
  }

  .cov-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-family: var(--font-mono);
    font-size: 0.875rem;
    color: var(--text);
  }

  .cov-input {
    width: 80px;
    background: var(--bg);
    border: 1px solid var(--line);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 0.875rem;
    padding: 0.3rem 0.5rem;
    border-radius: 3px;
    text-align: right;
  }

  .cov-results {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .cov-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    flex-wrap: wrap;
    padding: 0.3rem 0;
    border-bottom: 1px solid var(--line);
  }

  .cov-row:last-child {
    border-bottom: none;
  }

  .cov-name {
    flex: 1;
    min-width: 140px;
    color: var(--text);
  }

  .cov-spl {
    color: var(--muted);
  }

  .cov-spl strong {
    color: var(--text);
  }

  .margin {
    font-weight: 700;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
  }

  .margin-ok {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }

  .margin-low {
    color: var(--accent-2);
    background: color-mix(in srgb, var(--accent-2) 10%, transparent);
  }

  .margin-bad {
    color: var(--danger);
    background: color-mix(in srgb, var(--danger) 10%, transparent);
  }

  .cov-note {
    margin: 0.5rem 0 0;
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--muted);
  }

  .amp-wirings {
    display: flex;
    gap: 0.35rem;
    flex-wrap: wrap;
  }

  .wiring-chip {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
    border: 1px solid var(--line);
    color: var(--text);
  }

  .wiring-ok {
    border-color: var(--accent);
    color: var(--accent);
  }

  .wiring-caution {
    border-color: var(--accent-2);
    color: var(--accent-2);
  }

  .wiring-danger {
    border-color: var(--danger);
    color: var(--danger);
  }

  .wiring-inefficient {
    color: var(--muted);
  }

  .muted {
    color: var(--muted);
    font-family: var(--font-mono);
    font-size: 0.875rem;
  }
</style>
