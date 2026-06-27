# Boxdex: dev context for Claude

## Commands

```sh
mise run dev      # Astro dev server (search not available here)
mise run build    # Production build: validates all content data
mise run test     # Vitest (pure logic only; coverage thresholds enforced)
mise run lint     # Biome check
mise run knip     # Unused files/exports/deps (CI gate)
mise run fix      # Biome auto-fix formatting + import order
mise run preview  # Serve the production dist/
mise run verify   # Full pre-push gate: lint + check + knip + test + build
```

## Stack

| Concern | Choice |
|---------|--------|
| Generator | Astro 7 + `@astrojs/mdx@^7` (zod 4: `z.url()`, not `z.string().url()`) |
| Islands | Svelte 5 runes (`$state`, `$derived`, `$effect`, `$bindable`) |
| Charts | Apache ECharts (tree-shaken via `src/lib/echarts.ts`) |
| Search | Pagefind via `astro-pagefind` (v2: component imports need the `.astro` extension) |
| Lint/format | Biome 2.5 |
| Tests | Vitest 4 |
| Dead code | knip (`knip.json`; `data/` ignored) |
| Node | 26 via mise (`node.compile = false` required on NixOS) |

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
- Driver/horn zod schemas live in `src/lib/schemas.ts` (imported by `content.config.ts`; islands take the inferred `Driver`/`Horn` types via type-only imports, so zod stays out of client bundles). After any edit rerun `npm run schema:gen` to regenerate `schema/driver.schema.json`, `schema/enclosure.schema.json`, and `schema/horn.schema.json` (CI fails on drift, **never hand-edit the mirrors**).

### Horns: standalone catalog

- `data/drivers/horns/<mfr>/<id>.json` is its **own collection** (sits under `drivers/` for organisation but is not a driver), not tied to a cabinet. The drivers glob excludes it via `pattern: ["cone/**", "compression/**"]`. Fields: `brand`, `model`, `exitInch`, `coverageHorizontalDeg`, `coverageVerticalDeg`, `cutoffHz`, `mouthWmm`, `mouthHmm`, `depthMm?`, `profile`, `constantDirectivity?`, `material?`, `weightKg?`, `datasheetUrl?`.
- Browsing/compare live **under `/drivers`** as a third tab (Cone · Compression · Horns) in `DriverExplorer.svelte`, there is no standalone `/horns` index. `/drivers?tab=horn` deep-links the tab. Horn detail (`/horns/[id]`) and compare (`/horns/compare`) are still their own pages; horn compare uses `HornCompare.svelte`.
- **Mix-and-match is by throat exit**: a horn mates a compression driver when `exitInch` matches. The horn detail page lists compatible CDs and the CD detail page lists compatible horns, both derived live, no stored link.
- `profile` is a closed taxonomy list (`hornProfile` in `data/taxonomy.json`). Coverage is **H×V separate**, never a single angle.
- Enclosures keep their own inline horn geometry (`hornCutoffHz`, `hornMouthCm2`, `coverageAngleDeg`, …), horns are **not** referenced from enclosures.
- Schema in `src/lib/schemas.ts`; rerun `npm run schema:gen` (regenerates all three mirror schemas) after edits.

### Enclosure frontmatter: key invariants

- `drivers`: array of driver ids; **dangling ref = build error**
- `simulations`: array of `{ driver: [id, ...], kind, source: hornresp_sim|akabak_sim, file }`; `driver` is an array of ≥1 driver ids, use `[id]` for single-driver entries, `[id1, id2]` when one file covers a combined multi-driver response. The curves API keys on `driver[0]`.
- `measurements`: same shape as simulations but `source: rew_measured|klippel`
- `maxSplDb` is **optional**. Boxes without it are excluded from SPL sorts/plots, never defaulted
- Acoustic limits: `maxSplExcursionDb` (below Fb, Xmax-bound) and `maxSplThermalDb` (above Fb, power-bound) are the two independent ceilings; `maxSplDb` is the headline figure. `powerAesW`/`powerProgramW` are system power handling; `impedanceMinOhm` is the load minimum. All optional, all factual. **Never derive or fabricate them**, leave absent if unknown
- `weightKg` is the **loaded** weight: cabinet + all installed drivers
- `provenance` is derived: `"measured"` when `measurements.length > 0`, else `"sim"`
- Controlled vocabularies (`recommendedFor`, `connectors`, `topology`, `topologyVariant`, `license`) live in `data/taxonomy.json`, wired via `enumOf()` in `content.config.ts`. An array = closed list (out-of-list value is a build error); `null` = free-form string. Add/lock a field by editing the JSON. No code change.
- `license` is **required, no default** (a silent default would misstate third-party rights). SPDX CC ids or `LicenseRef-Permission`/`LicenseRef-Proprietary`; texts in `LICENSES/`, human map in `LICENSE.md`. `LicenseRef-Proprietary` entries are metadata-only (`plans` must be empty; link via `sourceUrl`); `LicenseRef-Permission` requires `licenseNote` recording the grant. Both enforced at build. New license value: add to taxonomy + drop text in `LICENSES/`.

### Curves API shape (`/api/curves/<slug>.json`)

```json
{
  "slug": "...",
  "name": "...",
  "simulations": [{ "driverId": "...", "source": "hornresp_sim", "curves": { "spl": { "freq": [], "value": [] } } }],
  "measurements": [{ "driverId": "...", "source": "rew_measured", "curves": { "spl": { "freq": [], "value": [] } } }]
}
```

## Shared code (don't re-declare)

- **Types**: `Driver`/`Horn` from `src/lib/schemas.ts`; curves API types, `pickCurve` (measurement priority) and `CURVE_Y_LABELS` from `src/lib/curves.ts`. `EnclosureRecord.metrics` is the typed `DerivedMetrics`; plottable axis keys are `MetricKey`, narrow untrusted strings via `metricKeyOf`.
- **Formatting**: `fmtW`, `fmtOhm`, `fmtHz` in `src/lib/format.ts` (shared display helpers: kW threshold, integer-vs-decimal ohms, kHz suffix). Don't redeclare inline.
- **Components**: `PageActions.svelte` (pinned share button + export-menu children), `EChart.svelte` (owns ECharts init/resize/themechange/dispose: pass an option *builder function*, re-invoked on theme change; never init echarts in an island), `RadarCompare.svelte` (generic radar+table compare; `DriverCompare`/`HornCompare` are thin config wrappers), `SystemResponse.svelte` (XO row UI, crossover chips, balance, CurveChart; receives `slotBands`/`crossoverSlots`/`xoSuggestions` and binds `xoApplied`/`xoOverrides` back to `StackBuilder`).
- **Logic**: catalog filter/sort in `lib/catalog.ts`, `filterEnclosures` in `lib/metrics.ts`, `summarizeStack` in `lib/stack.ts`. Driver substitution ranking in `lib/similarity.ts` (rendered by `SubstituteList.astro` on driver + enclosure pages). Crossover suggestion / LR4 application in `lib/crossover.ts`; series-parallel wiring + amp sizing in `lib/wiring.ts` (both consumed by `StackBuilder.svelte`). Category helpers in `lib/category.ts`. CSV parse in `lib/csv.ts`. Client-side CSV/JSON export (Blob download) in `lib/export.ts`. URL state serialisation in `lib/url-state.ts`. Radar chart data helpers in `lib/radar.ts`. New island logic goes in `src/lib` with tests, not inline in `.svelte`.
- **Manifest-derived fields**: `EnclosureRecord.nominalImpedanceOhm` is stated `specs.impedanceNominalOhm` or the driver's nominal for single-driver boxes, multi-driver boxes without a stated value stay undefined (internal wiring unknown, never guessed). `minCrossoverHz` is the max CD protection floor, baked **only for all-compression boxes**, in a multi-way box with cones the internal crossover already protects the CD, so the floor must not constrain the system crossover. For the same reason `specs.recommendedCrossoverHz` means the box's *upper system* crossover, never an internal split.
- **Glossary**: `/glossary` defines driver/system/power terms and all topology values; topology anchors use the raw taxonomy value (enclosure pages deep-link `#<topology>`). Add the glossary entry when adding a taxonomy topology.

## Known gotchas

- **Biome 2** lints `.svelte`/`.astro` script blocks but can't see template usage: `useConst` + unused-symbol rules are off for those files via `overrides` in `biome.json`. Don't hand-remove "unused" imports in components without checking the markup.
- **zod 4** (bundled by Astro 6) regenerates `schema/*.schema.json` in draft 2020-12 form, large diffs on `npm run schema:gen` after zod-touching upgrades are expected, just commit them.
- **ECharts** is only loaded on interactive island pages (`/compare`, `/explore`, `/find`, `/stack`). All imports go through `src/lib/echarts.ts` to keep the bundle tree-shaken.
- **`client:only="svelte"`** on all islands. No SSR for interactive components. Fetches use `BASE` from `src/lib/site.ts` (the canonical export — never re-derive from `import.meta.env` inline). i18n in islands via `getClientTranslations()` from `src/lib/locale-client.ts`.
- **Routing**: all content pages live under `src/pages/[locale]/`; `src/pages/index.astro` redirects to the default locale. The locale segment is part of every internal link — use `localeBase` (SSR) or `BASE + /[locale]` (client) rather than root-absolute paths.
- All units **SI only**: mm, L, Hz, dB, kg, W, Ω. No imperial.

## Conventions

- A **significantly different build = new slug**. Minor edits to the same design use `revision:`.
- Curves are discrete points. Do not interpolate or resample. `toPairs` zips directly for ECharts.
- `normalisePeak` is only applied for the SPL "normalise" toggle in Compare; never applied to stored data.
- **Punctuation**: no em dashes (`—`) and no semicolons as separators anywhere (src, tests, data, docs). Use `:` for definitions, `,` for asides/clauses, or split into two sentences. Empty table cells use `""`, not `"—"`. Numeric ranges use hyphen-minus (`-`); unit symbols (Ω, cm²) are fine.
