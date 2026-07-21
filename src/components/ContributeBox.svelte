<script lang="ts">
import { onMount, setContext } from "svelte";
import taxonomy from "../../data/taxonomy.json";
import type { Translations } from "../i18n";
import { tt } from "../i18n";
import { CATEGORIES } from "../lib/category";
import {
  type BoxContributeError,
  type BoxContributeSuccess,
  buildFrontmatter,
  type CurveSetState,
  type EnclosureInput,
  type NonStackedKind,
  ROLE_EXT,
  validateUploads,
} from "../lib/contribute";
import {
  CONTRIBUTE_VALIDATION_CONTEXT,
  translateFileIssue,
  translateZodIssue,
} from "../lib/contribute-i18n";
import { CURVE_KINDS } from "../lib/csv";
import { numBounds, schemaAt } from "../lib/schema-introspect";
import {
  BUILD_COMPLEXITIES,
  type DriverOption,
  enclosureFrontmatterObject,
  enclosureFrontmatterSchema,
  type Horn,
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
  specLabels,
  prodOrigin,
  turnstileSiteKey,
}: {
  t: Translations["contributeBox"];
  categoryLabels: Translations["categoryLabels"];
  curveLabels: Translations["curveLabels"];
  specLabels: Translations["enclosureDetail"]["specRows"];
  prodOrigin: string;
  turnstileSiteKey: string;
} = $props();

// LabeledInput reads this to localize its own "not a valid number" native-validity message.
// Wrapped in a getter so it tracks `t` if the prop is ever reassigned, not just its initial value.
setContext(CONTRIBUTE_VALIDATION_CONTEXT, {
  get validation() {
    return t.validation;
  },
});

const TOPOLOGIES = taxonomy.topology;
const LICENSES = taxonomy.license;
const CONNECTORS = taxonomy.connectors;
const RECOMMENDED_FOR = taxonomy.recommendedFor;
const AVAILABILITY = taxonomy.availability;
const CONTACT_CHANNELS = taxonomy.contactChannel;

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

// Maps a geometry form field to its path in the built frontmatter, for per-field zod errors.
const GEOM_FIELD_PATH: Record<GeomKey, string> = {
  hMm: "dims.hMm",
  wMm: "dims.wMm",
  dMm: "dims.dMm",
  netVolumeL: "netVolumeL",
  grossVolumeL: "grossVolumeL",
  weightKg: "weightKg",
  plywoodThicknessMm: "plywoodThicknessMm",
  sheetCount: "sheetCount",
  sheetW: "sheetSizeMm.wMm",
  sheetH: "sheetSizeMm.hMm",
};

const GEOM_FIELD_BOUNDS = Object.fromEntries(
  GEOM_FIELDS.map((f) => [
    f.k,
    numBounds(schemaAt(enclosureFrontmatterObject, GEOM_FIELD_PATH[f.k])),
  ])
) as Record<GeomKey, { min?: number; max?: number }>;

// Pulled from the schema so a new spec field appears on the form without touching this file.
const ADVANCED_SPECS = Object.keys(enclosureFrontmatterObject.shape.specs.shape).filter(
  (k) => k !== "f3Hz"
);

// Reuse the catalog's spec labels (enclosureDetail.specRows): schema key -> specRows key.
const SPEC_LABEL_KEY: Record<string, keyof Translations["enclosureDetail"]["specRows"]> = {
  f3HzHigh: "f3High",
  f6Hz: "f6",
  fbHz: "fb",
  maxSplDb: "maxSpl",
  maxSplExcursionDb: "maxSplExcursion",
  maxSplThermalDb: "maxSplThermal",
  sensitivityDb: "sensitivity",
  impedanceMinOhm: "impedanceMin",
  impedanceNominalOhm: "impedanceNominal",
  recommendedPowerW: "recommendedPower",
  powerAesW: "powerAes",
  powerProgramW: "powerProgram",
  coverageAngleDeg: "coverageAngle",
  recommendedCrossoverHz: "recommendedCrossover",
  hornCutoffHz: "hornCutoff",
  hornMouthCm2: "hornMouth",
  hornThroatCm2: "hornThroat",
  maxVelocityMs: "maxPortVelocity",
};
function specLabel(k: string): string {
  const lk = SPEC_LABEL_KEY[k];
  return (lk && specLabels[lk]) || k;
}

// Same derivation for specs.*: every spec key's bounds come from the schema itself.
const SPEC_BOUNDS: Record<string, { min?: number; max?: number }> = Object.fromEntries(
  Object.entries(enclosureFrontmatterObject.shape.specs.shape).map(([k, s]) => [k, numBounds(s)])
);

// File-based mirror of CurveKindEntryState/StackedEntryState/CurveSetState (lib/contribute.ts):
// the form holds File objects until submission, converted to filenames by curveSetRowOut.
// `expanded` is UI-only (collapsible disclosure state), dropped by curveSetRowOut.
interface CurveKindEntryRow {
  file: File | null;
  note: string;
}
interface StackedEntryRow {
  count: number | null;
  file: File | null;
  note: string;
}
interface CurveSetRow {
  id: string;
  source: string;
  expanded: boolean;
  curves: Partial<Record<NonStackedKind, CurveKindEntryRow>>;
  stacked: StackedEntryRow[];
}
const NON_STACKED_KINDS = CURVE_KINDS.filter((k) => k !== "spl_stacked") as NonStackedKind[];

function newCurveSet(source: string): CurveSetRow {
  return { id: "", source, expanded: true, curves: {}, stacked: [] };
}

// Local mirror of DriverProfileState (lib/contribute.ts) plus UI-only `expanded`: kept local
// rather than added to the shared type since that type is also the buildFrontmatter/test wire shape.
interface DriverEntryRow {
  id: string;
  qty: number | null;
  horn: string | null;
}
interface DriverProfileRow {
  id: string;
  expanded: boolean;
  drivers: DriverEntryRow[];
  simulations: CurveSetRow[];
  measurements: CurveSetRow[];
}

function curveSetRowOut(cs: CurveSetRow): CurveSetState {
  const curves: CurveSetState["curves"] = {};
  for (const [kind, entry] of Object.entries(cs.curves)) {
    if (!entry) continue;
    curves[kind as NonStackedKind] = { file: entry.file?.name ?? null, note: entry.note };
  }
  return {
    id: cs.id,
    source: cs.source,
    curves,
    stacked: cs.stacked.map((s) => ({ count: s.count, file: s.file?.name ?? null, note: s.note })),
  };
}

interface SourceRow {
  tool: string;
  file: File | null;
  note: string;
}

let drivers = $state<DriverOption[]>([]);
let horns = $state<Horn[]>([]);
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
});
// Most boxes need only one profile: pre-fill "default" so the common case needs no typing.
// Starts expanded since it's the only thing in the section. Newly-added profiles also start
// expanded (you're about to fill them in). Collapsing is a manual per-profile choice otherwise.
let driverProfiles = $state<DriverProfileRow[]>([
  { id: "default", expanded: true, drivers: [], simulations: [], measurements: [] },
]);
let geom = $state<Record<GeomKey, number | null>>(
  Object.fromEntries(GEOM_FIELDS.map((f) => [f.k, null])) as Record<GeomKey, number | null>
);
let f3Hz = $state<number | null>(null);
let specs = $state<Record<string, number | null>>(
  Object.fromEntries(ADVANCED_SPECS.map((k) => [k, null]))
);
let srcs = $state<SourceRow[]>([]);
let images = $state<File[]>([]);
let plans = $state<File[]>([]);
let recommendedFor = $state<string[]>([]);
let connectors = $state<string[]>([]);
let lic = $state({ license: "", licenseNote: "", author: "", sourceUrl: "" });
let availability = $state("");
let contact = $state<{ channel: string; value: string; note: string }[]>([]);
let body = $state("");

let onProd = $state(false);
let turnstileToken = $state("");
let turnstileEl: HTMLDivElement | undefined = $state();
let submitting = $state(false);
let serverErrors = $state<{ field: string; message: string }[]>([]);
let prUrl = $state<string | null>(null);
// One id per submit-attempt sequence: reused across retries so a dropped response or a
// transient server error can't open a duplicate PR for the same attempt.
const submissionId = crypto.randomUUID();

function driverLabel(id: string): string {
  const d = drivers.find((x) => x.id === id);
  return d ? `${d.brand} ${d.model}` : id;
}

function addDriverEntry(pi: number, id: string) {
  if (id && !driverProfiles[pi].drivers.some((de) => de.id === id)) {
    driverProfiles[pi].drivers.push({ id, qty: 1, horn: null });
  }
}

// Only compression drivers pair with a cataloged horn.
function isCompression(id: string): boolean {
  return drivers.find((d) => d.id === id)?.type === "compression";
}

// One-line summaries shown on the collapsed disclosure header, so a profile/curve-set collapsed
// out of the way is still identifiable without expanding it.
function profileSummary(p: DriverProfileRow): string {
  const driverCount = p.drivers.reduce((sum, e) => sum + (e.qty ?? 0), 0);
  return tt(t.profileSummary, {
    drivers: driverCount,
    sims: p.simulations.length,
    meas: p.measurements.length,
  });
}

function curveSetSummary(cs: CurveSetRow): string {
  const label = cs.id || t.untitledCurveSet;
  const kinds = NON_STACKED_KINDS.filter((k) => cs.curves[k]).map((k) => curveLabels[k] ?? k);
  if (cs.stacked.length)
    kinds.push(`${curveLabels.spl_stacked ?? "spl_stacked"} ×${cs.stacked.length}`);
  return `${label} · ${cs.source} · ${kinds.length ? kinds.join(", ") : t.noCurvesYet}`;
}

// Assembly and omission semantics live in lib/contribute.ts; here we only swap Files for names.
const frontmatter = $derived(
  buildFrontmatter({
    basics,
    driverProfiles: driverProfiles.map((p) => ({
      id: p.id,
      drivers: p.drivers,
      simulations: p.simulations.map(curveSetRowOut),
      measurements: p.measurements.map(curveSetRowOut),
    })),
    geom,
    f3Hz,
    specs,
    srcs: srcs.map((s) => ({ tool: s.tool, file: s.file?.name ?? null, note: s.note })),
    images: images.map((f) => f.name),
    plans: plans.map((f) => f.name),
    recommendedFor,
    connectors,
    lic,
    availability,
    contact,
  })
);

const schemaIssues = $derived.by(() => {
  const r = enclosureFrontmatterSchema.safeParse(frontmatter);
  return r.success
    ? []
    : r.error.issues.map((i) => ({
        path: i.path.join("."),
        message: translateZodIssue(i, t.validation),
      }));
});

// File-level checks zod cannot see: the same validators from src/lib/contribute.ts the Worker runs.
const fileIssues = $derived(
  validateUploads(
    frontmatter as EnclosureInput,
    allFiles().map((f) => ({ name: f.name, size: f.size }))
  ).map((e) => ({ path: e.field, message: translateFileIssue(e, t.validation) }))
);

const issues = $derived([...schemaIssues, ...fileIssues]);

function issuesFor(prefix: string): string[] {
  return issues.filter((i) => i.path === prefix).map((i) => i.message);
}

const canSubmit = $derived(
  onProd && !submitting && issues.length === 0 && (turnstileSiteKey === "" || turnstileToken !== "")
);

function curveSetFiles(cs: CurveSetRow): (File | null)[] {
  return [
    ...Object.values(cs.curves).map((e) => e?.file ?? null),
    ...cs.stacked.map((s) => s.file),
  ];
}

function allFiles(): File[] {
  const curveFiles = driverProfiles.flatMap((p) =>
    [...p.simulations, ...p.measurements].flatMap(curveSetFiles)
  );
  return [...images, ...plans, ...curveFiles, ...srcs.map((r) => r.file)].filter(
    (f): f is File => f !== null
  );
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function pickFiles(e: Event): File[] {
  return Array.from((e.target as HTMLInputElement).files ?? []);
}

onMount(async () => {
  onProd = !!prodOrigin && window.location.origin === prodOrigin;
  try {
    const [driversRes, hornsRes] = await Promise.all([
      fetch(`${BASE}/api/driver-options.json`),
      fetch(`${BASE}/api/horns.json`),
    ]);
    if (!driversRes.ok) throw new Error(`HTTP ${driversRes.status}`);
    if (!hornsRes.ok) throw new Error(`HTTP ${hornsRes.status}`);
    drivers = await driversRes.json();
    horns = await hornsRes.json();
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
    fd.append("submissionId", submissionId);
    for (const f of allFiles()) fd.append(f.name, f);
    const res = await fetch(`${BASE}/api/box-contribute`, { method: "POST", body: fd });
    if (res.ok) {
      const data = (await res.json()) as BoxContributeSuccess;
      prUrl = data.prUrl;
    } else {
      const data = (await res.json().catch(() => ({ errors: [] }))) as BoxContributeError;
      serverErrors = data.errors.length ? data.errors : [{ field: "", message: t.serverError }];
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

{#snippet curveSetRows(sets: CurveSetRow[], sources: readonly string[], basePath: string)}
  <!-- sets is a deep $state proxy: in-place mutation (splice included) is reactive. -->
  {#each sets as cs, ci}
    <div class="row card">
      <div class="row-head">
        <button
          type="button"
          class="disclosure-toggle"
          aria-expanded={cs.expanded}
          onclick={() => {
            sets[ci].expanded = !sets[ci].expanded;
          }}
        >
          <span class="disclosure-arrow" aria-hidden="true">{cs.expanded ? "▾" : "▸"}</span>
          <span>{curveSetSummary(cs)}</span>
        </button>
        <button type="button" class="btn-ghost btn-sm" onclick={() => sets.splice(ci, 1)}>
          {t.remove}
        </button>
      </div>
      {#if cs.expanded}
      <div class="grid-2">
        <LabeledInput
          label={t.rowId}
          bind:value={sets[ci].id}
          errors={issuesFor(`${basePath}.${ci}.id`)}
        />
        <label class="field">
          <span>{t.rowSource}</span>
          <select bind:value={sets[ci].source}>
            {#each sources as s}
              <option value={s}>{s}</option>
            {/each}
          </select>
        </label>
      </div>
      {#if !cs.id}<p class="hint">{t.rowIdHint}</p>{/if}

      {#each NON_STACKED_KINDS as kind}
        {@const entry = cs.curves[kind]}
        {#if entry}
          <div class="row card kind-entry">
            <div class="row-head">
              <span class="driver-row-label">{curveLabels[kind] ?? kind}</span>
              <button
                type="button"
                class="btn-ghost btn-sm"
                onclick={() => {
                  delete sets[ci].curves[kind];
                }}
              >{t.remove}</button>
            </div>
            <label class="field">
              <span>{t.rowFile}</span>
              <input
                type="file"
                accept=".csv"
                onchange={(e) => {
                  const f = pickFiles(e)[0] ?? null;
                  // biome-ignore lint/style/noNonNullAssertion: entry existing is this block's condition
                  sets[ci].curves[kind]!.file = f;
                }}
              />
              {#if entry.file}<span class="filename">{entry.file.name}</span>{/if}
              {#each issuesFor(`${basePath}.${ci}.curves.${kind}.file`) as m}<span class="err">{m}</span>{/each}
            </label>
            <LabeledInput label={t.rowNote} bind:value={entry.note} />
          </div>
        {/if}
      {/each}
      <div class="chips">
        {#each NON_STACKED_KINDS.filter((k) => !cs.curves[k]) as kind}
          <button
            type="button"
            class="chip"
            onclick={() => {
              sets[ci].curves[kind] = { file: null, note: "" };
            }}
          >{t.addKindEntry} {curveLabels[kind] ?? kind}</button>
        {/each}
      </div>

      {#each cs.stacked as stacked, si}
        <div class="row card kind-entry">
          <div class="row-head">
            <span class="driver-row-label">{curveLabels.spl_stacked ?? "spl_stacked"} #{si + 1}</span>
            <button
              type="button"
              class="btn-ghost btn-sm"
              onclick={() => sets[ci].stacked.splice(si, 1)}
            >{t.remove}</button>
          </div>
          <LabeledInput
            type="number"
            label={t.rowCount}
            min={1}
            bind:value={stacked.count}
            errors={issuesFor(`${basePath}.${ci}.stacked.${si}.count`)}
          />
          <p class="hint">{t.rowCountHint}</p>
          <label class="field">
            <span>{t.rowFile}</span>
            <input
              type="file"
              accept=".csv"
              onchange={(e) => {
                sets[ci].stacked[si].file = pickFiles(e)[0] ?? null;
              }}
            />
            {#if stacked.file}<span class="filename">{stacked.file.name}</span>{/if}
            {#each issuesFor(`${basePath}.${ci}.stacked.${si}.file`) as m}<span class="err">{m}</span>{/each}
          </label>
          <LabeledInput label={t.rowNote} bind:value={stacked.note} />
        </div>
      {/each}
      <button
        type="button"
        class="btn-ghost btn-sm"
        onclick={() => sets[ci].stacked.push({ count: null, file: null, note: "" })}
      >{t.addStackedCount}</button>
      {/if}
    </div>
  {/each}
{/snippet}

{#if error}
  <div class="empty-state">{t.failedToLoad}</div>
{:else if loading}
  <div class="contribute" aria-hidden="true">
    {#each { length: 3 } as _}
      <section class="card">
        <div class="skeleton skel-heading"></div>
        <div class="skeleton skel-field"></div>
        <div class="skeleton skel-field"></div>
      </section>
    {/each}
  </div>
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
      <LabeledInput
        label={t.name}
        bind:value={basics.name}
        minlength={3}
        maxlength={120}
        errors={issuesFor("name")}
      />
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
      </div>
      <div class="field">
        <span>{t.recommendedFor}</span>
        <div class="chips">
          {#each RECOMMENDED_FOR as r}
            <button type="button" class="chip" class:chip-active={recommendedFor.includes(r)} aria-pressed={recommendedFor.includes(r)} onclick={() => { recommendedFor = toggle(recommendedFor, r); }}>{r}</button>
          {/each}
        </div>
      </div>
    </section>

    <section class="card">
      <div class="row-head">
        <h2>{t.drivers}</h2>
        <button
          type="button"
          class="btn-ghost btn-sm"
          onclick={() =>
            driverProfiles.push({
              id: "",
              expanded: true,
              drivers: [],
              simulations: [],
              measurements: [],
            })}
        >{t.addProfile}</button>
      </div>
      {#if driverProfiles.length === 1}<p class="hint">{t.profilesHint}</p>{/if}
      {#each driverProfiles as profile, pi}
        <div class="row card">
          <div class="row-head">
            <button
              type="button"
              class="disclosure-toggle"
              aria-expanded={profile.expanded}
              onclick={() => {
                driverProfiles[pi].expanded = !driverProfiles[pi].expanded;
              }}
            >
              <span class="disclosure-arrow" aria-hidden="true">{profile.expanded ? "▾" : "▸"}</span>
              <span>{profile.id || t.untitledProfile} · {profileSummary(profile)}</span>
            </button>
            {#if driverProfiles.length > 1}
              <button
                type="button"
                class="btn-ghost btn-sm"
                onclick={() => driverProfiles.splice(pi, 1)}
              >{t.removeProfile}</button>
            {/if}
          </div>
          {#if profile.expanded}
          <LabeledInput
            label={t.profileName}
            bind:value={driverProfiles[pi].id}
            errors={issuesFor(`driverProfiles.${pi}.id`)}
          />
          {#each profile.drivers as de, di}
            <div class="row card">
              <div class="row-head">
                <span class="driver-row-label">{driverLabel(de.id)}</span>
                <button
                  type="button"
                  class="btn-ghost btn-sm"
                  onclick={() => driverProfiles[pi].drivers.splice(di, 1)}
                >{t.remove}</button>
              </div>
              <LabeledInput
                type="number"
                label={t.driverQty}
                min={1}
                bind:value={driverProfiles[pi].drivers[di].qty}
                errors={issuesFor(`driverProfiles.${pi}.drivers.${di}.qty`)}
              />
              {#if isCompression(de.id)}
                <label class="field">
                  <span>{t.horn}</span>
                  <Combobox
                    items={horns}
                    getId={(h) => h.id}
                    getLabel={(h) => `${h.brand} ${h.model}`}
                    emptyLabel={t.none}
                    value={de.horn ?? ""}
                    onselect={(id) => {
                      driverProfiles[pi].drivers[di].horn = id || null;
                    }}
                  />
                </label>
                <p class="hint">{t.hornHint}</p>
              {/if}
            </div>
          {/each}
          <Combobox
            items={drivers.filter((d) => !profile.drivers.some((de) => de.id === d.id))}
            getId={(d) => d.id}
            getLabel={(d) => `${d.brand} ${d.model}`}
            placeholder={t.addDriver}
            value=""
            onselect={(id) => addDriverEntry(pi, id)}
          />
          {#each issuesFor(`driverProfiles.${pi}.drivers`) as m}<span class="err">{m}</span>{/each}

          <div class="row-head">
            <h3>{t.simulations}</h3>
            <button
              type="button"
              class="btn-ghost btn-sm"
              onclick={() => driverProfiles[pi].simulations.push(newCurveSet(SIM_SOURCES[0]))}
            >{t.add}</button>
          </div>
          {#if profile.simulations.length === 0}<p class="hint">{t.curvesHint}</p>{/if}
          {@render curveSetRows(driverProfiles[pi].simulations, SIM_SOURCES, `driverProfiles.${pi}.simulations`)}

          <div class="row-head">
            <h3>{t.measurements}</h3>
            <button
              type="button"
              class="btn-ghost btn-sm"
              onclick={() => driverProfiles[pi].measurements.push(newCurveSet(MEAS_SOURCES[0]))}
            >{t.add}</button>
          </div>
          {#if profile.measurements.length === 0}<p class="hint">{t.curvesHint}</p>{/if}
          {@render curveSetRows(driverProfiles[pi].measurements, MEAS_SOURCES, `driverProfiles.${pi}.measurements`)}
          {/if}
        </div>
      {/each}
      {#each issuesFor("driverProfiles") as m}<span class="err">{m}</span>{/each}
    </section>

    <section class="card">
      <h2>{t.geometry}</h2>
      <div class="grid-3">
        {#each GEOM_FIELDS as f}
          <LabeledInput
            type="number"
            label={t[f.l]}
            bind:value={geom[f.k]}
            min={GEOM_FIELD_BOUNDS[f.k].min}
            max={GEOM_FIELD_BOUNDS[f.k].max}
            errors={issuesFor(GEOM_FIELD_PATH[f.k])}
          />
        {/each}
      </div>
    </section>

    <section class="card">
      <h2>{t.specs}</h2>
      <p class="hint">{t.specsHint}</p>
      <LabeledInput
        type="number"
        label={t.f3Hz}
        bind:value={f3Hz}
        min={SPEC_BOUNDS.f3Hz.min}
        max={SPEC_BOUNDS.f3Hz.max}
        errors={issuesFor("specs.f3Hz")}
      />
      <h3>{t.advancedSpecs}</h3>
      <div class="grid-3">
        {#each ADVANCED_SPECS as k}
          <LabeledInput
            type="number"
            label={specLabel(k)}
            bind:value={specs[k]}
            min={SPEC_BOUNDS[k]?.min}
            max={SPEC_BOUNDS[k]?.max}
            errors={issuesFor(`specs.${k}`)}
          />
        {/each}
      </div>
      <div class="field">
        <span>{t.connectors}</span>
        <div class="chips">
          {#each CONNECTORS as c}
            <button type="button" class="chip" class:chip-active={connectors.includes(c)} aria-pressed={connectors.includes(c)} onclick={() => { connectors = toggle(connectors, c); }}>{c}</button>
          {/each}
        </div>
      </div>
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
        <select
          bind:value={lic.license}
          class:field-missing={issuesFor("license").length > 0 && !lic.license}
          class:field-invalid={issuesFor("license").length > 0 && !!lic.license}
        >
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
    </section>

    <section class="card">
      <div class="row-head">
        <h2>{t.availabilityTitle}</h2>
        <button type="button" class="btn-ghost btn-sm" onclick={() => contact.push({ channel: CONTACT_CHANNELS[0], value: "", note: "" })}>{t.addContact}</button>
      </div>
      <label class="field">
        <span>{t.availability}</span>
        <select bind:value={availability}>
          <option value="">{t.availabilityUnstated}</option>
          {#each AVAILABILITY as a}<option value={a}>{t.availabilityLabels[a] ?? a}</option>{/each}
        </select>
      </label>
      <p class="hint">{t.contactHint}</p>
      {#each contact as row, i}
        <div class="row card">
          <div class="row-head">
            <span class="result-count">#{i + 1}</span>
            <button type="button" class="btn-ghost btn-sm" onclick={() => contact.splice(i, 1)}>{t.remove}</button>
          </div>
          <div class="grid-2">
            <label class="field">
              <span>{t.contactChannel}</span>
              <select bind:value={contact[i].channel}>
                {#each CONTACT_CHANNELS as c}<option value={c}>{t.contactChannels[c] ?? c}</option>{/each}
              </select>
            </label>
            <LabeledInput label={t.contactValue} bind:value={contact[i].value} />
          </div>
          <LabeledInput label={t.rowNote} bind:value={contact[i].note} />
        </div>
      {/each}
      {#each issuesFor("contact") as m}<span class="err">{m}</span>{/each}
    </section>

    <section class="card">
      <h2>{t.notes}</h2>
      <label class="field">
        <span class="sr-only">{t.notes}</span>
        <textarea rows="6" bind:value={body} placeholder={t.notesPlaceholder}></textarea>
      </label>
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

  .skel-heading {
    height: 1rem;
    width: 8rem;
  }

  .skel-field {
    height: 2.2rem;
    width: 100%;
  }

  h2 {
    font-size: 1rem;
    margin: 0;
  }

  h3 {
    font-size: 0.85rem;
    color: var(--muted);
    margin: 0.25rem 0 0;
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
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  /* Global .card:hover highlights the border on accent, meant for clickable catalog cards.
     These nested cards are static form panels, and :hover matches every ancestor of whatever's
     under the cursor, so without this every card up the nesting chain would light up at once. */
  .card:hover {
    border-color: var(--line);
  }

  .row-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .disclosure-toggle {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    background: none;
    border: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    padding: 0;
  }

  .disclosure-toggle span:last-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .disclosure-toggle:hover {
    color: var(--accent);
  }

  .disclosure-arrow {
    flex: none;
    color: var(--muted);
    font-size: 0.7rem;
  }

  /* Leaf-level entries (one kind's file+note, or one stacked count): lighter chrome than a
     top-level .card so nesting reads as "inside this curve set" rather than another peer card. */
  .kind-entry {
    background: none;
    border: none;
    border-left: 2px solid var(--line);
    border-radius: 0;
    padding: 0.5rem 0 0.5rem 0.75rem;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
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
