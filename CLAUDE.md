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

Full field-by-field reference (types, units, taxonomy, CSV format, curves API shape)
lives in **`docs/data-model.md`**, read it before touching schemas or content data.
Rationale/alternatives for specific choices are in the linked ADRs. What to keep in
mind without opening those docs:

```
data/
  drivers/
    cone/<mfr>/<id>.json            cone driver specs (type:"cone")
    compression/<mfr>/<id>.json     compression driver specs (type:"compression")
    horns/<mfr>/<id>.json           horn/waveguide specs (separate collection, not a driver)
  enclosures/<slug>/
    index.mdx                       frontmatter + build notes body
    <name>.csv / .pdf / .png|.jpg   curves / plan / photos
```

- Drivers are a `z.discriminatedUnion("type", …)` (ADR-005): `id` is the bare filename,
  folders are organisational only. A cone carrying CD-only fields (or vice versa) is a
  **build error**. Cone `sensitivityDb` (free-field) and compression `sensitivityHornDb`
  (on a reference horn) are deliberately distinct fields, never reuse one for the other.
  EBP/Vb hints in `lib/driver.ts` are cone-only, gate on `d.type === "cone"`.
- Horns (`data/drivers/horns/`) are their **own** collection, excluded from the drivers
  glob, and are not referenced from enclosures, mix-and-match with a compression driver
  is derived live by matching `exitInch`, no stored link. Coverage is always H×V separate.
- Enclosure `drivers` refs (nested per `driverProfiles[]`, see docs/data-model.md) are
  build-error on dangling id. `driverProfiles[].simulations`/`.measurements` nest under
  the profile they describe rather than linking by a shared id string, so they can't
  dangle or mismatch, a `stacked` entry requires a plain `curves.spl` in the same set
  (`stackedMissingBase`, build error, stacking is SPL-only).
- `maxSplDb` and the acoustic-limit fields (`maxSplExcursionDb`, `maxSplThermalDb`,
  `powerAesW`/`powerProgramW`, `impedanceMinOhm`) are all optional and factual,
  **never derive or fabricate**, leave absent if unknown (ADR-012).
- `provenance` is derived (`"measured"` iff any profile has measurements), never set by hand.
- `license` is required, no default (SPDX CC id or `LicenseRef-Permission`/`-Proprietary`,
  texts in `LICENSES/`). `LicenseRef-Proprietary` is metadata-only (`plans` empty, link via
  `sourceUrl`), `LicenseRef-Permission` requires `licenseNote`. `availability: contact`/
  `commission` requires a `contact` entry or `sourceUrl` (dead-end guard, build error).
  Contact `value` is free-form, the safe href is built by `contactHref` in `lib/contact.ts`
  (mailto/https only), never interpolate a raw contact value into an `href`.
- Controlled vocabularies live in `data/taxonomy.json`, wired via `enumOf()` (ADR-010).
  New `topology` value → add a glossary entry too (deep-links to `#<topology>`).

## Shared code (don't re-declare)

- **Types**: `Driver`/`Horn` from `src/lib/schemas.ts`; curves API types, `resolveCurveEntry` (measurement priority) and `CURVE_Y_LABELS` from `src/lib/curves.ts`. `EnclosureRecord.metrics` is the typed `DerivedMetrics`; plottable axis keys are `MetricKey`, narrow untrusted strings via `metricKeyOf`.
- **Formatting**: `fmtW`, `fmtOhm`, `fmtHz` in `src/lib/format.ts` (shared display helpers: kW threshold, integer-vs-decimal ohms, kHz suffix). Don't redeclare inline.
- **Components**: `PageActions.svelte` (pinned share button + export-menu children), `EChart.svelte` (owns ECharts init/resize/themechange/dispose: pass an option *builder function*, re-invoked on theme change; never init echarts in an island), `RadarCompare.svelte` (generic radar+table compare; `DriverCompare`/`HornCompare` are thin config wrappers), `SystemResponse.svelte` (XO row UI, crossover chips, balance, CurveChart; receives `slotBands`/`crossoverSlots`/`xoSuggestions` and binds `xoApplied`/`xoOverrides` back to `StackBuilder`).
- **Logic**: catalog filter/sort in `lib/catalog.ts`, `filterEnclosures` in `lib/metrics.ts`, `summarizeStack` in `lib/stack.ts`. Driver substitution ranking in `lib/similarity.ts` (rendered by `SubstituteList.astro` on driver detail pages only). Its scoring weights are named constants (`CONE_WEIGHTS`, `COMPRESSION_WEIGHTS`) published in `docs/methodology.md`, keep the two in sync. Crossover suggestion / LR4 application in `lib/crossover.ts`; series-parallel wiring + amp sizing in `lib/wiring.ts` (both consumed by `StackBuilder.svelte`). `wiring.ts` also exposes `suggestedChannels` (returns the smallest divisor of `qty` whose per-channel load rates "ok" and, when `aesPerCabW` is given, stays under a ~4kW/channel power target; if no divisor meets both, falls back to the best impedance rating reachable, preferring more channels once the power target itself is unreachable); `StackSlot.channels` is the per-slot override, `undefined` = auto-suggested, encoded positionally in the URL as `ch<n>` so two slots sharing a slug stay independent. Category helpers in `lib/category.ts`. CSV parse in `lib/csv.ts`. Safe contact-link builder (`contactHref`, scheme-guarded to mailto/https) in `lib/contact.ts`. Client-side CSV/JSON export (Blob download) in `lib/export.ts`. URL state serialisation in `lib/url-state.ts` (ADR-008). Radar chart data helpers in `lib/radar.ts`. New island logic goes in `src/lib` with tests, not inline in `.svelte`.
- **Manifest-derived fields**: `EnclosureRecord.nominalImpedanceOhm` is stated `specs.impedanceNominalOhm` or the driver's nominal for single-driver boxes, multi-driver boxes without a stated value stay undefined (internal wiring unknown, never guessed). `minCrossoverHz` is the max CD protection floor, baked **only for all-compression boxes**, in a multi-way box with cones the internal crossover already protects the CD, so the floor must not constrain the system crossover. For the same reason `specs.recommendedCrossoverHz` means the box's *upper system* crossover, never an internal split.
- **Glossary**: `/glossary` defines driver/system/power terms, all topology values, and the `availability` values; topology anchors use the raw taxonomy value (enclosure pages deep-link `#<topology>`).

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
- ECharts imports go through `src/lib/echarts.ts` only (ADR-009): keeps the bundle tree-shaken. Only pulled in on `/compare`, `/explore`, `/stack`, `/enclosures/[slug]`, `/drivers/compare`, `/horns/compare`, not `/find`.

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
- **Pagefind search markup** (ADR-006): `Search.astro` renders `@pagefind/component-ui`'s `<pagefind-searchbox>` web component, real selectors are `input.pf-searchbox-input` and `a.pf-searchbox-result` (not the classic `pagefind-ui__*` default UI). Search only works against a built `dist/`, not `npm run dev`.
- **`client:only="svelte"`** on all islands. No SSR for interactive components. Fetches use `BASE` from `src/lib/site.ts` (the canonical export: never re-derive from `import.meta.env` inline). i18n in islands via `getClientTranslations()` from `src/lib/locale-client.ts` (ADR-007).
- **Routing**: all content pages live under `src/pages/[locale]/`; `src/pages/index.astro` redirects to the default locale. The locale segment is part of every internal link: use `localeBase` (SSR) or `BASE + /[locale]` (client) rather than root-absolute paths.
- **OG images / apple-touch-icon**: generated at build time (`src/pages/og-[locale].png.ts`, one per `LOCALES` entry, plus `src/pages/apple-touch-icon.png.ts`), not committed to `public/`. Rendering is satori → SVG → `@resvg/resvg-js` → PNG. Satori has no native `<svg>` element (the favicon icon is base64-encoded to a data URI for an `<img>`) and only reads TTF/OTF/WOFF, not WOFF2 (font bytes loaded via `createRequire(import.meta.url).resolve(...)`, not `import.meta.resolve`). Per-locale copy is `meta.titleRest`/`meta.ogDescription` in `src/i18n/locales/*.json`, French's `titleRest` needs a **U+00A0** before the colon (a plain space collapses under satori/CSS whitespace rules).
- **Hosting**: static `dist/` synced to an R2 bucket, served by a Worker (`worker/index.ts`), not Pages or Workers static assets, both cap at 20,000 files and the build is ~24.8k. GitHub Actions builds + deploys (rclone sync to `production/` on `main`, diffed `rclone check` upload to `previews/pr-<n>` on PRs, with a sticky PR comment). Full setup (secrets, vars, worker internals, box-contribute one-time setup, cost notes) is in **`docs/deployment.md`**, rationale in ADR-003 (R2+Worker), ADR-004 (diffed previews), ADR-011 (box-contribute pipeline), ADR-013 (visitor metrics).
- **`data/enclosures/fake-*`**: ~400 synthetic fixture entries (slug prefix `fake-`, display name `FAKE …`, `author: fake-data`) that stress-test the catalog UI at scale. Every box references **real** drivers by id and derives its specs/curves from those drivers' Thiele-Small parameters. Generator lives in `scripts/local/fk/` (gitignored). Not real products, don't "correct" specs against datasheets: edit `scripts/local/fk/concepts.json` (or the generator) and regenerate with `--force` instead of hand-editing boxes.
- All units **SI only**: mm, L, Hz, dB, kg, W, Ω. No imperial.

## Conventions

- A **significantly different build = new slug**. Minor edits to the same design use `revision:`.
- Curves are discrete points. Do not interpolate or resample. `toPairs` zips directly for ECharts.
- `normalisePeak` is only applied for the SPL "normalise" toggle in Compare; never applied to stored data.
- **Punctuation**: no em dashes (`—`) and no semicolons as separators anywhere (src, tests, data, docs). Use `:` for definitions, `,` for asides/clauses, or split into two sentences. Empty table cells use `""`, not `"—"`. Numeric ranges use hyphen-minus (`-`); unit symbols (Ω, cm²) are fine.
