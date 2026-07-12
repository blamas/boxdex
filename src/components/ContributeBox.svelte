<script lang="ts">
import { onMount } from "svelte";
import taxonomy from "../../data/taxonomy.json";
import type { Translations } from "../i18n";
import { CATEGORIES } from "../lib/category";
import {
  buildFrontmatter,
  type CurveRowState,
  type EnclosureInput,
  ROLE_EXT,
  validateUploads,
} from "../lib/contribute";
import { CURVE_KINDS } from "../lib/csv";
import {
  BUILD_COMPLEXITIES,
  type Driver,
  enclosureFrontmatterObject,
  enclosureFrontmatterSchema,
  MEAS_SOURCES,
  SIM_SOURCES,
} from "../lib/schemas";
import { BASE } from "../lib/site";
import Combobox from "./Combobox.svelte";
import LabeledInput from "./LabeledInput.svelte";

let {
  t,
  categoryLabels,
  curveLabels,
  prodOrigin,
  turnstileSiteKey,
}: {
  t: Translations["contributeBox"];
  categoryLabels: Translations["categoryLabels"];
  curveLabels: Translations["curveLabels"];
  prodOrigin: string;
  turnstileSiteKey: string;
} = $props();

const TOPOLOGIES = taxonomy.topology;
const LICENSES = taxonomy.license;
const CONNECTORS = taxonomy.connectors;
const RECOMMENDED_FOR = taxonomy.recommendedFor;

const GEOM_FIELDS = [
  { k: "hMm", l: "height" },
  { k: "wMm", l: "width" },
  { k: "dMm", l: "depth" },
  { k: "netVolumeL", l: "netVolumeL" },
  { k: "grossVolumeL", l: "grossVolumeL" },
  { k: "weightKg", l: "weightKg" },
  { k: "plywoodThicknessMm", l: "plywoodThicknessMm" },
  { k: "sheetCount", l: "sheetCount" },
  { k: "sheetW", l: "sheetWidth" },
  { k: "sheetH", l: "sheetHeight" },
] as const;
type GeomKey = (typeof GEOM_FIELDS)[number]["k"];

// Pulled from the schema so a new spec field appears on the form without touching this file.
const ADVANCED_SPECS = Object.keys(enclosureFrontmatterObject.shape.specs.shape).filter(
  (k) => k !== "f3Hz"
);

interface CurveRow {
  driver: string[];
  kind: string;
  source: string;
  note: string;
  count: number | null;
  file: File | null;
}
interface SourceRow {
  tool: string;
  file: File | null;
  note: string;
}

let drivers = $state<Driver[]>([]);
let loading = $state(true);
let error = $state<string | null>(null);

let basics = $state({
  name: "",
  category: "sub",
  topology: "sealed",
  topologyVariant: "",
  ways: null as number | null,
  revision: "",
  buildComplexity: "",
  driverCount: null as number | null,
});
let driverIds = $state<string[]>([]);
let geom = $state<Record<GeomKey, number | null>>(
  Object.fromEntries(GEOM_FIELDS.map((f) => [f.k, null])) as Record<GeomKey, number | null>
);
let f3Hz = $state<number | null>(null);
let specs = $state<Record<string, number | null>>(
  Object.fromEntries(ADVANCED_SPECS.map((k) => [k, null]))
);
let showAdvancedSpecs = $state(false);
let sims = $state<CurveRow[]>([]);
let meas = $state<CurveRow[]>([]);
let srcs = $state<SourceRow[]>([]);
let images = $state<File[]>([]);
let plans = $state<File[]>([]);
let recommendedFor = $state<string[]>([]);
let connectors = $state<string[]>([]);
let lic = $state({ license: "", licenseNote: "", author: "", sourceUrl: "" });
let body = $state("");

let onProd = $state(false);
let turnstileToken = $state("");
let turnstileEl: HTMLDivElement | undefined = $state();
let submitting = $state(false);
let serverErrors = $state<{ field: string; message: string }[]>([]);
let prUrl = $state<string | null>(null);

function driverLabel(id: string): string {
  const d = drivers.find((x) => x.id === id);
  return d ? `${d.brand} ${d.model}` : id;
}

// Assembly and omission semantics live in lib/contribute.ts; here we only swap Files for names.
const rowOut = (r: CurveRow): CurveRowState => ({ ...r, file: r.file?.name ?? null });
const frontmatter = $derived(
  buildFrontmatter({
    basics,
    driverIds,
    geom,
    f3Hz,
    specs,
    sims: sims.map(rowOut),
    meas: meas.map(rowOut),
    srcs: srcs.map((s) => ({ tool: s.tool, file: s.file?.name ?? null, note: s.note })),
    images: images.map((f) => f.name),
    plans: plans.map((f) => f.name),
    recommendedFor,
    connectors,
    lic,
  })
);

const schemaIssues = $derived.by(() => {
  const r = enclosureFrontmatterSchema.safeParse(frontmatter);
  return r.success
    ? []
    : r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
});

// File-level checks zod cannot see: the same validators from src/lib/contribute.ts the Worker runs.
const fileIssues = $derived(
  validateUploads(
    frontmatter as EnclosureInput,
    allFiles().map((f) => ({ name: f.name, size: f.size }))
  ).map((e) => ({ path: e.field, message: e.message }))
);

const issues = $derived([...schemaIssues, ...fileIssues]);

function issuesFor(prefix: string): string[] {
  return issues.filter((i) => i.path === prefix).map((i) => i.message);
}

const canSubmit = $derived(
  onProd && !submitting && issues.length === 0 && (turnstileSiteKey === "" || turnstileToken !== "")
);

function allFiles(): File[] {
  return [
    ...images,
    ...plans,
    ...sims.map((r) => r.file),
    ...meas.map((r) => r.file),
    ...srcs.map((r) => r.file),
  ].filter((f): f is File => f !== null);
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function addDriverTo(ids: string[], id: string): string[] {
  return id && !ids.includes(id) ? [...ids, id] : ids;
}

function pickFiles(e: Event): File[] {
  return Array.from((e.target as HTMLInputElement).files ?? []);
}

function newCurve(source: string): CurveRow {
  return { driver: [], kind: "spl", source, note: "", count: null, file: null };
}

onMount(async () => {
  onProd = !!prodOrigin && window.location.origin === prodOrigin;
  try {
    const res = await fetch(`${BASE}/api/drivers.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    drivers = await res.json();
  } catch (e) {
    error = String(e);
  } finally {
    loading = false;
  }
  if (turnstileSiteKey && onProd) loadTurnstile();
});

interface TurnstileApi {
  render: (el: Element, opts: object) => string;
  reset: (id?: string) => void;
}
const turnstileApi = () => (window as unknown as { turnstile?: TurnstileApi }).turnstile;
let turnstileWidgetId: string | undefined;

// Turnstile tokens are single-use: the widget must be re-solved before the next attempt.
function resetTurnstile() {
  turnstileToken = "";
  if (turnstileWidgetId !== undefined) turnstileApi()?.reset(turnstileWidgetId);
}

// Guarded so a ClientRouter re-mount does not double-register the widget.
function loadTurnstile() {
  const render = () => {
    const ts = turnstileApi();
    if (!ts || !turnstileEl || turnstileEl.dataset.rendered) return;
    turnstileEl.dataset.rendered = "1";
    turnstileWidgetId = ts.render(turnstileEl, {
      sitekey: turnstileSiteKey,
      callback: (token: string) => {
        turnstileToken = token;
      },
      "expired-callback": () => {
        turnstileToken = "";
      },
    });
  };
  if (!document.querySelector("script[data-turnstile]")) {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.defer = true;
    s.dataset.turnstile = "1";
    s.onload = render;
    document.head.appendChild(s);
  } else {
    render();
  }
}

async function submit() {
  if (!canSubmit) return;
  submitting = true;
  serverErrors = [];
  try {
    const fd = new FormData();
    fd.append("payload", JSON.stringify({ frontmatter, body }));
    fd.append("cf-turnstile-response", turnstileToken);
    for (const f of allFiles()) fd.append(f.name, f);
    const res = await fetch(`${BASE}/api/box-contribute`, { method: "POST", body: fd });
    if (res.ok) {
      const data = (await res.json()) as { prUrl: string };
      prUrl = data.prUrl;
    } else {
      const data = (await res.json().catch(() => ({}))) as {
        errors?: { field: string; message: string }[];
        error?: string;
      };
      serverErrors = data.errors ?? [{ field: "", message: data.error ?? t.serverError }];
      // 422 is returned before the Worker touches Turnstile; anything else may have consumed the token.
      if (res.status !== 422) resetTurnstile();
    }
  } catch {
    serverErrors = [{ field: "", message: t.serverError }];
    resetTurnstile();
  } finally {
    submitting = false;
  }
}
</script>

{#snippet driverPicker(ids: string[], onchange: (ids: string[]) => void)}
  <div class="driver-picker">
    {#if ids.length}
      <div class="chips">
        {#each ids as id}
          <span class="chip chip-active">
            {driverLabel(id)}
            <button
              type="button"
              class="chip-x"
              aria-label={t.remove}
              onclick={() => onchange(ids.filter((x) => x !== id))}>×</button
            >
          </span>
        {/each}
      </div>
    {/if}
    <Combobox
      items={drivers.filter((d) => !ids.includes(d.id))}
      getId={(d) => d.id}
      getLabel={(d) => `${d.brand} ${d.model}`}
      placeholder={t.addDriver}
      value=""
      onselect={(id) => onchange(addDriverTo(ids, id))}
    />
  </div>
{/snippet}

{#snippet curveRows(rows: CurveRow[], sources: readonly string[])}
  <!-- rows is a deep $state proxy: in-place mutation (splice included) is reactive. -->
  {#each rows as row, i}
    <div class="row card">
      <div class="row-head">
        <span class="result-count">#{i + 1}</span>
        <button type="button" class="btn-ghost btn-sm" onclick={() => rows.splice(i, 1)}>
          {t.remove}
        </button>
      </div>
      <label class="field">
        <span>{t.rowDriver}</span>
        {@render driverPicker(row.driver, (d) => {
          rows[i].driver = d;
        })}
      </label>
      <div class="grid-2">
        <label class="field">
          <span>{t.rowKind}</span>
          <select bind:value={rows[i].kind}>
            {#each CURVE_KINDS as k}
              <option value={k}>{curveLabels[k] ?? k}</option>
            {/each}
          </select>
        </label>
        <label class="field">
          <span>{t.rowSource}</span>
          <select bind:value={rows[i].source}>
            {#each sources as s}
              <option value={s}>{s}</option>
            {/each}
          </select>
        </label>
      </div>
      {#if row.kind === "spl_stacked"}
        <LabeledInput type="number" label={t.rowCount} min={1} bind:value={rows[i].count} />
      {/if}
      <label class="field">
        <span>{t.rowFile}</span>
        <input
          type="file"
          accept=".csv"
          onchange={(e) => {
            rows[i].file = pickFiles(e)[0] ?? null;
          }}
        />
        {#if row.file}<span class="filename">{row.file.name}</span>{/if}
      </label>
      <LabeledInput label={t.rowNote} bind:value={rows[i].note} />
    </div>
  {/each}
{/snippet}

{#if error}
  <div class="empty-state">{t.failedToLoad}</div>
{:else if loading}
  <p class="muted">{t.loading}</p>
{:else if prUrl}
  <div class="card success">
    <h2>{t.successTitle}</h2>
    <p>{t.successBody}</p>
    <a class="btn-ghost" href={prUrl} target="_blank" rel="noopener noreferrer">{t.viewPr}</a>
  </div>
{:else}
  <div class="contribute">
    {#if !onProd}
      <p class="notice">{t.prodOnly}</p>
    {/if}

    <section class="card">
      <h2>{t.basics}</h2>
      <LabeledInput label={t.name} bind:value={basics.name} errors={issuesFor("name")} />
      <div class="grid-2">
        <label class="field">
          <span>{t.category}</span>
          <select bind:value={basics.category}>
            {#each CATEGORIES as c}<option value={c}>{categoryLabels[c]}</option>{/each}
          </select>
        </label>
        <label class="field">
          <span>{t.topology}</span>
          <select bind:value={basics.topology}>
            {#each TOPOLOGIES as tp}<option value={tp}>{tp}</option>{/each}
          </select>
        </label>
        <LabeledInput label={t.topologyVariant} bind:value={basics.topologyVariant} />
        <label class="field">
          <span>{t.buildComplexity}</span>
          <select bind:value={basics.buildComplexity}>
            <option value="">{t.none}</option>
            {#each BUILD_COMPLEXITIES as c}<option value={c}>{c}</option>{/each}
          </select>
        </label>
        <LabeledInput type="number" label={t.ways} min={1} max={4} bind:value={basics.ways} />
        <LabeledInput label={t.revision} bind:value={basics.revision} />
        <LabeledInput type="number" label={t.driverCount} min={1} bind:value={basics.driverCount} />
      </div>
    </section>

    <section class="card">
      <h2>{t.drivers}</h2>
      {@render driverPicker(driverIds, (d) => {
        driverIds = d;
      })}
      {#each issuesFor("drivers") as m}<span class="err">{m}</span>{/each}
    </section>

    <section class="card">
      <h2>{t.geometry}</h2>
      <div class="grid-3">
        {#each GEOM_FIELDS as f}
          <LabeledInput type="number" label={t[f.l]} bind:value={geom[f.k]} />
        {/each}
      </div>
      {#each issuesFor("dims") as m}<span class="err">{m}</span>{/each}
      {#each issuesFor("netVolumeL") as m}<span class="err">{m}</span>{/each}
    </section>

    <section class="card">
      <h2>{t.specs}</h2>
      <p class="hint">{t.specsHint}</p>
      <LabeledInput type="number" label={t.f3Hz} bind:value={f3Hz} errors={issuesFor("specs.f3Hz")} />
      <button
        type="button"
        class="advanced-toggle"
        aria-expanded={showAdvancedSpecs}
        onclick={() => {
          showAdvancedSpecs = !showAdvancedSpecs;
        }}
      >
        {t.advancedSpecs}
      </button>
      {#if showAdvancedSpecs}
        <div class="grid-3">
          {#each ADVANCED_SPECS as k}
            <LabeledInput type="number" label={k} bind:value={specs[k]} />
          {/each}
        </div>
      {/if}
    </section>

    <section class="card">
      <div class="row-head">
        <h2>{t.simulations}</h2>
        <button type="button" class="btn-ghost btn-sm" onclick={() => sims.push(newCurve(SIM_SOURCES[0]))}>{t.add}</button>
      </div>
      {@render curveRows(sims, SIM_SOURCES)}
    </section>

    <section class="card">
      <div class="row-head">
        <h2>{t.measurements}</h2>
        <button type="button" class="btn-ghost btn-sm" onclick={() => meas.push(newCurve(MEAS_SOURCES[0]))}>{t.add}</button>
      </div>
      {@render curveRows(meas, MEAS_SOURCES)}
    </section>

    <section class="card">
      <div class="row-head">
        <h2>{t.sources}</h2>
        <button type="button" class="btn-ghost btn-sm" onclick={() => srcs.push({ tool: "", file: null, note: "" })}>{t.add}</button>
      </div>
      {#each srcs as row, i}
        <div class="row card">
          <div class="row-head">
            <span class="result-count">#{i + 1}</span>
            <button type="button" class="btn-ghost btn-sm" onclick={() => srcs.splice(i, 1)}>{t.remove}</button>
          </div>
          <div class="grid-2">
            <LabeledInput label={t.sourceTool} bind:value={srcs[i].tool} />
            <label class="field">
              <span>{t.sourceFile}</span>
              <input type="file" onchange={(e) => { srcs[i].file = pickFiles(e)[0] ?? null; }} />
              {#if row.file}<span class="filename">{row.file.name}</span>{/if}
            </label>
          </div>
          <LabeledInput label={t.rowNote} bind:value={srcs[i].note} />
        </div>
      {/each}
    </section>

    <section class="card">
      <h2>{t.files}</h2>
      <label class="field">
        <span>{t.imagesLabel}</span>
        <input type="file" accept={ROLE_EXT.image.map((x) => `.${x}`).join(",")} multiple onchange={(e) => { images = pickFiles(e); }} />
        {#if images.length}<span class="filename">{images.map((f) => f.name).join(", ")}</span>{/if}
      </label>
      <label class="field">
        <span>{t.plansLabel}</span>
        <input type="file" accept=".pdf" multiple onchange={(e) => { plans = pickFiles(e); }} />
        {#if plans.length}<span class="filename">{plans.map((f) => f.name).join(", ")}</span>{/if}
      </label>
      {#each issuesFor("images") as m}<span class="err">{m}</span>{/each}
      {#each issuesFor("plans") as m}<span class="err">{m}</span>{/each}
      {#each issuesFor("files") as m}<span class="err">{m}</span>{/each}
    </section>

    <section class="card">
      <h2>{t.license}</h2>
      <label class="field">
        <span>{t.license}</span>
        <select bind:value={lic.license}>
          <option value="">{t.licenseSelect}</option>
          {#each LICENSES as l}<option value={l}>{l}</option>{/each}
        </select>
        {#each issuesFor("license") as m}<span class="err">{m}</span>{/each}
      </label>
      <LabeledInput label={t.licenseNote} bind:value={lic.licenseNote} errors={issuesFor("licenseNote")} />
      <div class="grid-2">
        <LabeledInput label={t.author} bind:value={lic.author} />
        <LabeledInput label={t.sourceUrl} type="url" bind:value={lic.sourceUrl} errors={issuesFor("sourceUrl")} />
      </div>
      <div class="field">
        <span>{t.recommendedFor}</span>
        <div class="chips">
          {#each RECOMMENDED_FOR as r}
            <button type="button" class="chip" class:chip-active={recommendedFor.includes(r)} onclick={() => { recommendedFor = toggle(recommendedFor, r); }}>{r}</button>
          {/each}
        </div>
      </div>
      <div class="field">
        <span>{t.connectors}</span>
        <div class="chips">
          {#each CONNECTORS as c}
            <button type="button" class="chip" class:chip-active={connectors.includes(c)} onclick={() => { connectors = toggle(connectors, c); }}>{c}</button>
          {/each}
        </div>
      </div>
    </section>

    <section class="card">
      <h2>{t.notes}</h2>
      <textarea rows="6" bind:value={body} placeholder={t.notesPlaceholder}></textarea>
    </section>

    {#if issues.length}
      <div class="card errors" aria-live="polite">
        <strong>{t.errorsTitle}</strong>
        <ul>
          {#each issues as i}<li><code>{i.path || "(root)"}</code>: {i.message}</li>{/each}
        </ul>
      </div>
    {/if}
    {#if serverErrors.length}
      <div class="card errors" aria-live="polite">
        <ul>
          {#each serverErrors as e}<li>{e.field ? `${e.field}: ` : ""}{e.message}</li>{/each}
        </ul>
      </div>
    {/if}

    {#if turnstileSiteKey && onProd}
      <div bind:this={turnstileEl}></div>
    {/if}

    <button type="button" class="submit" disabled={!canSubmit} onclick={submit}>
      {submitting ? t.submitting : t.submit}
    </button>
  </div>
{/if}

<style>
  .contribute {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  section.card {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  h2 {
    font-size: 1rem;
    margin: 0;
  }

  /* .field/.err come from global.css; only the bespoke controls need local rules. */
  select,
  textarea,
  input[type="file"] {
    font: inherit;
    padding: 0.4rem 0.5rem;
    background: var(--panel);
    color: var(--text);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
  }

  .grid-2,
  .grid-3 {
    display: grid;
    gap: 0.75rem;
  }
  .grid-2 {
    grid-template-columns: repeat(2, 1fr);
  }
  .grid-3 {
    grid-template-columns: repeat(3, 1fr);
  }

  .row {
    gap: 0.5rem;
  }

  .row-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .chip-x {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    padding: 0 0 0 0.3rem;
    font-size: 1rem;
    line-height: 1;
  }

  .driver-picker {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .filename {
    color: var(--muted);
    font-family: var(--font-mono);
    font-size: 0.72rem;
    word-break: break-all;
  }

  .hint {
    color: var(--muted);
    font-size: 0.78rem;
    margin: 0;
  }

  .errors {
    border-color: var(--danger);
  }
  .errors code {
    font-size: 0.75rem;
  }

  .notice {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    color: var(--muted);
    border: 1px dashed var(--line);
    border-radius: var(--radius-sm);
    padding: 0.5rem 0.75rem;
    margin: 0;
  }

  .success {
    align-items: flex-start;
    gap: 0.5rem;
  }

  .submit {
    align-self: flex-start;
    font: inherit;
    padding: 0.5rem 1.1rem;
    background: var(--accent);
    color: var(--bg);
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
  }

  .submit:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (max-width: 640px) {
    .grid-2,
    .grid-3 {
      grid-template-columns: 1fr;
    }
  }
</style>
