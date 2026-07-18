# Boxdex: dev context for Claude

## Commands

```sh
mise run dev       # Astro dev server (search not available here)
mise run build     # Production build: validates all content data
mise run test      # Vitest (pure logic only, no coverage check)
mise run coverage  # Vitest with V8 coverage; thresholds enforced (this is what CI/verify runs)
mise run check     # astro check: Astro/Svelte/TS type-check
mise run lint      # Biome check
mise run knip      # Unused files/exports/deps (CI gate)
mise run fix       # Biome auto-fix formatting + import order
mise run preview   # Serve the production dist/
mise run verify    # Full pre-push gate: lint + check + knip + coverage + build
mise run e2e       # Playwright E2E suite (builds + previews, then drives real routes/search/nav)
mise run validate-data              # astro sync: validates all driver/horn/enclosure data
node scripts/validate-driver.mjs <file>  # fast single-file check for one driver/horn JSON
```

`scripts/` holds committed project tooling (currently just the validator).
`scripts/local/` is gitignored personal tooling (scrapers, one-shot migrations,
the `fk/` fake-enclosure generator): never committed or pushed.

A pre-commit hook (`lefthook.yml`) runs the relevant check automatically when
staged files touch `data/drivers/**` or `data/enclosures/**`. Both the
`lefthook` binary and its install (`lefthook install`) are owned by mise's
`postinstall` hook in `mise.toml`, so `mise install` wires it up, npm never
touches lefthook. CI runs `npm ci` without mise, which is fine, hooks are
irrelevant to a checkout that never commits.

## Stack

| Concern | Choice |
|---------|--------|
| Generator | Astro + `@astrojs/mdx` (zod: `z.url()`, not `z.string().url()`) |
| Islands | Svelte runes (`$state`, `$derived`, `$effect`, `$bindable`) |
| Charts | Apache ECharts (tree-shaken via `src/lib/echarts.ts`) |
| Search | Pagefind via `astro-pagefind` (component imports need the `.astro` extension) |
| Lint/format | Biome |
| Tests | Vitest |
| Dead code | knip (`knip.json`) |
| Node | via mise (`node.compile = false` required on NixOS) |

## Data model

```
data/
  drivers/
    cone/<mfr>/<id>.json            cone driver specs (type:"cone", schema in schema/driver.schema.json)
    compression/<mfr>/<id>.json     compression driver specs (type:"compression", same schema)
    horns/<mfr>/<id>.json           horn/waveguide specs (separate collection, schema/horn.schema.json)
  enclosures/<slug>/
    index.mdx                       frontmatter + build notes body
    <name>.csv                      freq,value columns; # comment lines ignored
    <name>.pdf                      downloadable plan
    <name>.png / .jpg               photos / renders
```

### Driver model: discriminated union

- Drivers are a `z.discriminatedUnion("type", …)` on a required `type` field: `cone` | `compression`. Files live in `data/drivers/<type>/<mfr>/<id>.json`; the **id is the bare filename** (manufacturer/type folders are organisational, enclosures reference by id). Shared base: `brand`, `model`, `impedanceOhm`, `peW`, `datasheetUrl?`.
- **cone** (Thiele–Small): `sizeInch`, `fsHz`, `qts`, `qes?`, `qms?`, `vasL`, `sdCm2`, `xmaxMm`, `reOhm?`, `bl?`, `mmsG?`, `sensitivityDb`. EBP/Vb hints in `lib/driver.ts` are cone-only, callers gate on `d.type === "cone"`.
- **compression** (horn HF): `exitInch`, `throatMm?`, `voiceCoilMm`, `fLowHz`, `fHighHz`, `minCrossoverHz`, `crossoverSlopeDbOct?`, `sensitivityHornDb`, `fsHz?`, `magnetMaterial?`, `weightKg?`. CD sensitivity is the **distinct** field `sensitivityHornDb` (on a reference horn), never reuse cone free-field `sensitivityDb`.
- A cone carrying CD-only fields (or vice-versa) is a **build error**. `exitInch` is a free number (not a closed enum).
- Driver/horn zod schemas live in `src/lib/schemas.ts` (imported by `content.config.ts`; islands take the inferred `Driver`/`Horn` types via type-only imports, so zod stays out of client bundles). One deliberate exception: `ContributeBox.svelte` imports `enclosureFrontmatterSchema` at runtime, client-side validation is the point of that form. Pure zod-free guards shared by the island and the Worker live in `src/lib/contribute.ts`. After any edit rerun `npm run schema:gen` to regenerate `schema/driver.schema.json`, `schema/enclosure.schema.json`, and `schema/horn.schema.json` (CI fails on drift, **never hand-edit the mirrors**).

### Horns: standalone catalog

- `data/drivers/horns/<mfr>/<id>.json` is its **own collection** (sits under `drivers/` for organisation but is not a driver), not tied to a cabinet. The drivers glob excludes it via `pattern: ["cone/**", "compression/**"]`. Fields: `brand`, `model`, `exitInch`, `coverageHorizontalDeg`, `coverageVerticalDeg`, `cutoffHz`, `mouthWmm`, `mouthHmm`, `depthMm?`, `profile`, `constantDirectivity?`, `material?`, `weightKg?`, `datasheetUrl?`.
- Browsing/compare live **under `/drivers`** as a third tab (Cone · Compression · Horns) in `DriverExplorer.svelte`, there is no standalone `/horns` index. `/drivers?tab=horn` deep-links the tab. Horn detail (`/horns/[id]`) and compare (`/horns/compare`) are still their own pages; horn compare uses `HornCompare.svelte`.
- **Mix-and-match is by throat exit**: a horn mates a compression driver when `exitInch` matches. The horn detail page lists compatible CDs and the CD detail page lists compatible horns, both derived live, no stored link.
- `profile` is a closed taxonomy list (`hornProfile` in `data/taxonomy.json`). Coverage is **H×V separate**, never a single angle.
- Enclosures keep their own inline horn geometry (`hornCutoffHz`, `hornMouthCm2`, `coverageAngleDeg`, …), horns are **not** referenced from enclosures.
- Schema in `src/lib/schemas.ts`; rerun `npm run schema:gen` (regenerates all three mirror schemas) after edits.

### Enclosure frontmatter: key invariants

- `drivers`: array of driver ids; **dangling ref = build error**
- `driverProfiles[].simulations`/`.measurements`: nested under the profile they describe (no more `driverProfile` string link, nesting is the link, so it can't dangle or mismatch). Each entry is one curve set: `{ id, source: hornresp_sim|akabak_sim, curves: { spl?, phase?, impedance?, group_delay?, distortion?, power_compression?: { file, note? } }, stacked?: [{ count, file, note? }] }`. `id` only needs to be unique within its own profile's own array (simulations checked separately from measurements, two different profiles may reuse the same id). Kind variants and stacked SPL counts are sibling fields of one object instead of separate rows correlated by a shared id, so they can't accidentally fragment into separate curves. `measurements` entries use `source: rew_measured|klippel`. Stacking is SPL-only (array gain from N identical cabinets is well-defined; impedance depends on wiring topology, not count, and phase/group_delay/distortion/power_compression are single-unit driver properties): a `stacked` entry requires a plain `curves.spl` entry in the same curve set (`stackedMissingBase`, build error). The curves API keys on `id` (scoped per profile).
- `maxSplDb` is **optional**. Boxes without it are excluded from SPL sorts/plots, never defaulted
- Acoustic limits: `maxSplExcursionDb` (below Fb, Xmax-bound) and `maxSplThermalDb` (above Fb, power-bound) are the two independent ceilings; `maxSplDb` is the headline figure. `powerAesW`/`powerProgramW` are system power handling; `impedanceMinOhm` is the load minimum. All optional, all factual. **Never derive or fabricate them**, leave absent if unknown
- `weightKg` is the **loaded** weight: cabinet + all installed drivers
- `provenance` is derived: `"measured"` when any profile has `measurements.length > 0` (union across `driverProfiles`), else `"sim"`
- Controlled vocabularies (`recommendedFor`, `connectors`, `topology`, `topologyVariant`, `license`, `availability`, `contactChannel`) live in `data/taxonomy.json`, wired via `enumOf()` in `content.config.ts`. An array = closed list (out-of-list value is a build error); `null` = free-form string. Add/lock a field by editing the JSON. No code change.
- `license` is **required, no default** (a silent default would misstate third-party rights). SPDX CC ids or `LicenseRef-Permission`/`LicenseRef-Proprietary`; texts in `LICENSES/`, human map in `LICENSE.md`. `LicenseRef-Proprietary` entries are metadata-only (`plans` must be empty; link via `sourceUrl`); `LicenseRef-Permission` requires `licenseNote` recording the grant. Both enforced at build. New license value: add to taxonomy + drop text in `LICENSES/`.
- `availability` (optional, no default) and `contact` (array of `{channel, value, note?}`) cover non-free plans: how the box is obtained and how to reach the designer/vendor. `availability: contact`/`commission` requires a `contact` entry or a `sourceUrl` (build-error dead-end guard, in `licenseSuperRefine`). Contact `value` is free-form, the **safe href** is built at render by `contactHref` in `lib/contact.ts` (mailto/https only, `javascript:`/`data:` collapse to plain text). Never interpolate a raw contact value into an `href`.

### Curves API shape (`/api/curves/<slug>.json`)

```json
{
  "slug": "...",
  "name": "...",
  "simulations": [{ "id": "...", "driverProfile": "...", "source": "hornresp_sim", "curves": { "spl": { "freq": [], "value": [] } } }],
  "measurements": [{ "id": "...", "driverProfile": "...", "source": "rew_measured", "curves": { "spl": { "freq": [], "value": [] } } }]
}
```

## Shared code (don't re-declare)

- **Types**: `Driver`/`Horn` from `src/lib/schemas.ts`; curves API types, `resolveCurveEntry` (measurement priority) and `CURVE_Y_LABELS` from `src/lib/curves.ts`. `EnclosureRecord.metrics` is the typed `DerivedMetrics`; plottable axis keys are `MetricKey`, narrow untrusted strings via `metricKeyOf`.
- **Formatting**: `fmtW`, `fmtOhm`, `fmtHz` in `src/lib/format.ts` (shared display helpers: kW threshold, integer-vs-decimal ohms, kHz suffix). Don't redeclare inline.
- **Components**: `PageActions.svelte` (pinned share button + export-menu children), `EChart.svelte` (owns ECharts init/resize/themechange/dispose: pass an option *builder function*, re-invoked on theme change; never init echarts in an island), `RadarCompare.svelte` (generic radar+table compare; `DriverCompare`/`HornCompare` are thin config wrappers), `SystemResponse.svelte` (XO row UI, crossover chips, balance, CurveChart; receives `slotBands`/`crossoverSlots`/`xoSuggestions` and binds `xoApplied`/`xoOverrides` back to `StackBuilder`).
- **Logic**: catalog filter/sort in `lib/catalog.ts`, `filterEnclosures` in `lib/metrics.ts`, `summarizeStack` in `lib/stack.ts`. Driver substitution ranking in `lib/similarity.ts` (rendered by `SubstituteList.astro` on driver + enclosure pages). Crossover suggestion / LR4 application in `lib/crossover.ts`; series-parallel wiring + amp sizing in `lib/wiring.ts` (both consumed by `StackBuilder.svelte`). `wiring.ts` also exposes `suggestedChannels` (returns the smallest divisor of `qty` whose per-channel load rates "ok" and, when `aesPerCabW` is given, stays under a ~4kW/channel power target; if no divisor meets both, falls back to the best impedance rating reachable, preferring more channels once the power target itself is unreachable); `StackSlot.channels` is the per-slot override, `undefined` = auto-suggested, encoded positionally in the URL as `ch<n>` so two slots sharing a slug stay independent. Category helpers in `lib/category.ts`. CSV parse in `lib/csv.ts`. Safe contact-link builder (`contactHref`, scheme-guarded to mailto/https) in `lib/contact.ts`. Client-side CSV/JSON export (Blob download) in `lib/export.ts`. URL state serialisation in `lib/url-state.ts`. Radar chart data helpers in `lib/radar.ts`. New island logic goes in `src/lib` with tests, not inline in `.svelte`.
- **Manifest-derived fields**: `EnclosureRecord.nominalImpedanceOhm` is stated `specs.impedanceNominalOhm` or the driver's nominal for single-driver boxes, multi-driver boxes without a stated value stay undefined (internal wiring unknown, never guessed). `minCrossoverHz` is the max CD protection floor, baked **only for all-compression boxes**, in a multi-way box with cones the internal crossover already protects the CD, so the floor must not constrain the system crossover. For the same reason `specs.recommendedCrossoverHz` means the box's *upper system* crossover, never an internal split.
- **Glossary**: `/glossary` defines driver/system/power terms, all topology values, and the `availability` values; topology anchors use the raw taxonomy value (enclosure pages deep-link `#<topology>`). Add the glossary entry when adding a taxonomy topology or availability value.

## UI patterns

### Design tokens
All colors, radii, shadows are CSS custom properties in `src/styles/global.css` (`:root` + `[data-theme="light"]`). **Never hardcode hex colors or RGBA in components.** Derive opacity variants with `color-mix(in srgb, var(--token) N%, transparent)`: `--accent-subtle` (7% accent tint) already exists for active chip backgrounds. Shadow: `var(--shadow-md)`. Radii: `--radius-sm` (3px) / `--radius-md` (4px) / `--radius-lg` (6px).

### Global CSS classes (don't redeclare locally)
These live in `src/styles/global.css` and are available everywhere:

| Class | Use |
|-------|-----|
| `.chip` / `.chip-active` | Toggle filter buttons (border-only, muted; active = accent border + `--accent-subtle` bg) |
| `.btn-ghost` / `.btn-sm` | Ghost button base; `.btn-sm` as size modifier |
| `.advanced-toggle` / `.advanced-toggle-count` | "Advanced filters" expandable button + active-count badge |
| `.filter-row` | `display:flex; flex-wrap:wrap; gap:0.5rem; align-items:center` row for filter controls |
| `.result-count` | Muted mono label for "N results" |
| `.tab-group` | Segmented pill group (shared dividers, single border wrapping all buttons; `.active` = accent text + `--bg` fill). Used in `BoxCurves.svelte`. |
| `.tab-pills` | Separate bordered pill buttons; `.active` = accent fill + `--bg` text. Used in `CatalogGrid`, `DriverExplorer`. |
| `.skeleton` | Pulse animation base; combine with sized divs for loading placeholders. Uses `--line` as bg. |
| `.field` / `.err` | Labelled form field (mono label above control) and inline error text (`--danger`). Used by `LabeledInput.svelte` and bespoke controls in `ContributeBox`. |
| `.skip-link` | Visually-hidden keyboard skip nav link |
| `.empty-state` | Centered dashed-border placeholder (no results / no data / error) |
| `.card` | Panel card (border + radius + padding); `.card:hover` accents border |
| `.grid` | `auto-fill minmax(320px,1fr)` card grid |

When a component needs one of these patterns: use the global class, keep only the positional/size delta in the component `<style>`.

### ECharts
- Import `getActiveTheme` from `src/lib/echarts.ts`: it reads CSS vars at call time and returns `{ theme, accent }`. Never hardcode palette colors.
- `EChart.svelte` owns init/resize/dispose/theme-change. Pass an **option builder function** (re-invoked on theme change); never call `echarts.init` directly in an island.
- Chart height: the host div uses `style="height:var(--echart-h,{height}px)"`. Override from outside with `--echart-h` CSS var (e.g. the global media query sets it to `clamp(200px,56vw,360px)` on mobile). The `height` prop is the fallback default.
- ECharts imports go through `src/lib/echarts.ts` only: keeps the bundle tree-shaken.

### Loading states
Islands that fetch on mount show a skeleton while `loading = $state(true)`. Pattern:
```svelte
let loading = $state(true);
onMount(async () => { ... ; loading = false; });

{#if loading}
  <!-- skeleton markup using .skeleton class -->
{:else if items.length === 0}
  <div class="empty-state">...</div>
{:else}
  <!-- real content -->
{/if}
```
Skeleton elements use `<div class="skeleton">` with local CSS for width/height/margin. Use `var(--line)` as background (not `var(--panel)`, which lacks contrast).

### Accessibility
- Dynamic result counts: add `aria-live="polite" aria-atomic="true"` to the element so screen readers announce filter changes.
- Skip link: `<a href="#main-content" class="skip-link">` before `<header>`; `id="main-content"` on `<main>`.

### Inline scripts in Layout.astro
Layout uses `is:inline data-astro-rerun` scripts (re-run on ClientRouter navigation). Guard against double-registration with `if (el && !el._boxdexInit) { el._boxdexInit = true; ... }`. The header/footer use `transition:persist`: Svelte islands cannot be used there. The hamburger nav toggle is part of the same inline script block.

### Mobile nav
At ≤640px the `.nav-links` div is `display:none`; `nav.nav-open .nav-links { display:flex }`. The `#nav-toggle` button (hidden above 640px) toggles `nav-open` and manages `aria-expanded`. An `astro:page-load` listener auto-closes it on ClientRouter navigation.

## Known gotchas

- **Biome** lints `.svelte`/`.astro` script blocks but can't see template usage: `useConst` + unused-symbol rules are off for those files via `overrides` in `biome.json`. Don't hand-remove "unused" imports in components without checking the markup.
- **zod** (bundled by Astro) regenerates `schema/*.schema.json` in draft 2020-12 form, large diffs on `npm run schema:gen` after zod-touching upgrades are expected, just commit them.
- **Pagefind search markup**: `Search.astro` renders `@pagefind/component-ui`'s `<pagefind-searchbox>` web component, not the classic `pagefind-ui__*` default UI (those class names still show up inside `dist/pagefind/*.js` but aren't what's on the page). Real selectors: input is `input.pf-searchbox-input`, results are `a.pf-searchbox-result` (loading state renders `div.pf-searchbox-result.pf-searchbox-placeholder` skeletons first, first query also pays for WASM init so give it a few seconds).
- **ECharts** is only loaded on pages whose island renders a chart: `/compare` (`Compare` → `CurveChart`), `/explore` (`DesignSpace`), `/stack` (`StackBuilder` → `SystemResponse` → `CurveChart`), `/enclosures/[slug]` (`BoxCurves` → `CurveChart`), `/drivers/compare` and `/horns/compare` (`RadarCompare`). `/find` (`Explorer.svelte`) is list/filter only and does **not** pull in ECharts. All imports go through `src/lib/echarts.ts` to keep the bundle tree-shaken.
- **`client:only="svelte"`** on all islands. No SSR for interactive components. Fetches use `BASE` from `src/lib/site.ts` (the canonical export: never re-derive from `import.meta.env` inline). i18n in islands via `getClientTranslations()` from `src/lib/locale-client.ts`.
- **Routing**: all content pages live under `src/pages/[locale]/`; `src/pages/index.astro` redirects to the default locale. The locale segment is part of every internal link: use `localeBase` (SSR) or `BASE + /[locale]` (client) rather than root-absolute paths.
- **`SITE_URL` / `SITE_BASE`**: `astro.config.mjs`'s `site` is `process.env.SITE_URL || localhost` and `base` is `process.env.SITE_BASE || "/"`, host-agnostic by design (no host-specific globals in the config, so the build ports across hosts). Hosting is **Cloudflare, static output served from R2 behind a Worker** (`worker/index.ts`), NOT Workers static assets: the dist is ~24.8k files (5,875 drivers x en+fr = ~11.7k pages + ~12k pagefind fragments) and Workers/Pages static assets cap at 20,000 files per version. R2 has no object cap. Build + deploy run in **GitHub Actions** (`.github/workflows/deploy.yml`): plain-Node `astro build` + pagefind, then rclone (official Docker image, checksum-based, `--fast-list` keeps LIST calls at ~25 per prefix) syncs `dist` to `r2:boxdex-site/production` on `main` deploys or copies only the md5 diff vs `production/` via `--compare-dest` to `previews/pr-<n>` on PR builds (PR builds set `SITE_URL` so HTML page hashes match production, minimising the diff), then `cloudflare/wrangler-action` runs `wrangler deploy` on `main` (prefix `production`) and `wrangler versions upload --var ASSET_PREFIX:previews/pr-<n>` on PRs (preview version URL posted as a sticky PR comment via `actions/github-script`; `retire-preview` purges the R2 prefix and edits the comment on PR close). The Worker (`worker/index.ts`, pure path->key/type/cache helpers in `worker/resolve.ts` with vitest tests) maps each request to an R2 object under `env.ASSET_PREFIX`, resolves directory `index.html`, serves `404.html` on miss, sets Content-Type/Cache-Control, and uses the Cache API (production prefix only, previews bypass it). For previews the Worker tries the preview prefix first and falls back to `production/` for objects the PR did not upload (previews cannot preview deletions). `worker/` is excluded from the app tsconfig and uses `@cloudflare/workers-types` via a triple-slash reference, and is a knip `entry`. `worker/box-contribute.ts` handles `POST /api/box-contribute` (contribute form -> GitHub PR, see `docs/decisions/011-box-contribute-pipeline.md`, setup in `docs/deployment.md`), branched in `worker/index.ts` before the read path. Cloudflare's Workers Builds Git integration stays disconnected. Production URL is `boxdex.<subdomain>.workers.dev` (`base` stays `/`, `SITE_URL` from the `SITE_URL` Actions variable). `wrangler.toml`'s `[observability]` sets both the top-level `enabled = true` and `logs.enabled = true` (the top-level flag is the documented switch Cloudflare keys future features like auto-tracing on, nested-only `logs.enabled` works today but isn't the documented path). The R2 bucket also carries a `pr-preview-expiry` lifecycle rule (`previews/` prefix, 90-day expiry, applied via `wrangler r2 bucket lifecycle add`, not in `wrangler.toml`) as a backstop independent of the `retire-preview` CI job, see `docs/deployment.md`. Requires repo secrets `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` + `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY`, Actions variables `SITE_URL` + `R2_S3_ENDPOINT`, the R2 bucket `boxdex-site`, and Preview URLs enabled on the Worker. Cost: reads are metered Worker invocations (100k/day free, Cache API cuts R2 reads), egress + storage free at this scale.
- **`data/enclosures/fake-*`**: ~400 synthetic fixture entries (slug prefix `fake-`, display name `FAKE …`, `author: fake-data`) that stress-test the catalog UI at scale. Every box references **real** drivers by id and derives its specs/curves from those drivers' Thiele-Small parameters. The generator lives in `scripts/local/fk/` (gitignored): `authors/build-concepts.mjs` writes the reviewable `concepts.json` (queries the real catalog for valid ids, organic variety + edge-case saturation), `lib/{alignment,synth,dsp,emit,assemble,drivers}.mjs` do the physics/curve synthesis and `lib/{png,images,pdf}.mjs` generate real assets (front-panel render + response-plot PNGs, a build-plan PDF, a `design.txt` source, all dependency-free), `gen-fake-data.mjs` emits the boxes (`--force` to overwrite, `--only <slug>` for one). `qa.mjs` checks invariants + coverage, math has `node --test scripts/local/fk/lib/*.test.mjs`. Not real products, don't "correct" specs against datasheets: edit `concepts.json` (or the generator) and regenerate with `--force` instead of hand-editing boxes.
- All units **SI only**: mm, L, Hz, dB, kg, W, Ω. No imperial.

## Conventions

- A **significantly different build = new slug**. Minor edits to the same design use `revision:`.
- Curves are discrete points. Do not interpolate or resample. `toPairs` zips directly for ECharts.
- `normalisePeak` is only applied for the SPL "normalise" toggle in Compare; never applied to stored data.
- **Punctuation**: no em dashes (`—`) and no semicolons as separators anywhere (src, tests, data, docs). Use `:` for definitions, `,` for asides/clauses, or split into two sentences. Empty table cells use `""`, not `"—"`. Numeric ranges use hyphen-minus (`-`); unit symbols (Ω, cm²) are fine.
