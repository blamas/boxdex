# Boxdex: dev context for Claude

## Commands

```sh
mise run dev      # Astro dev server (search not available here)
mise run build    # Production build: validates all content data
mise run test     # Vitest (pure logic only)
mise run lint     # Biome check
mise run fix      # Biome auto-fix formatting + import order
mise run preview  # Serve the production dist/
```

## Stack

| Concern | Choice |
|---------|--------|
| Generator | Astro 5 + `@astrojs/mdx@^4` (v5+ requires Astro 6) |
| Islands | Svelte 5 runes (`$state`, `$derived`, `$effect`) |
| Charts | Apache ECharts (tree-shaken via `src/lib/echarts.ts`) |
| Search | Pagefind via `astro-pagefind` |
| Lint/format | Biome 1.9 |
| Tests | Vitest |
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
- **cone** (Thiele–Small): `sizeInch`, `fsHz`, `qts`, `qes?`, `qms?`, `vasL`, `sdCm2`, `xmaxMm`, `reOhm?`, `bl?`, `mmsG?`, `sensitivityDb`. EBP/Vb hints in `lib/driver.ts` are cone-only — callers gate on `d.type === "cone"`.
- **compression** (horn HF): `exitInch`, `throatMm?`, `voiceCoilMm`, `fLowHz`, `fHighHz`, `minCrossoverHz`, `crossoverSlopeDbOct?`, `sensitivityHornDb`, `fsHz?`, `magnetMaterial?`, `weightKg?`. CD sensitivity is the **distinct** field `sensitivityHornDb` (on a reference horn) — never reuse cone free-field `sensitivityDb`.
- A cone carrying CD-only fields (or vice-versa) is a **build error**. `exitInch` is a free number (not a closed enum).
- Schema lives in `src/content.config.ts`; after any edit rerun `npm run schema:gen` to regenerate `schema/driver.schema.json` (CI fails on drift — **never hand-edit the mirror**).

### Horns: standalone catalog

- `data/drivers/horns/<mfr>/<id>.json` is its **own collection** (sits under `drivers/` for organisation but is not a driver), not tied to a cabinet. The drivers glob excludes it via `pattern: ["cone/**", "compression/**"]`. Fields: `brand`, `model`, `exitInch`, `coverageHorizontalDeg`, `coverageVerticalDeg`, `cutoffHz`, `mouthWmm`, `mouthHmm`, `depthMm?`, `profile`, `constantDirectivity?`, `material?`, `weightKg?`, `datasheetUrl?`.
- Browsing/compare live **under `/drivers`** as a third tab (Cone · Compression · Horns) in `DriverExplorer.svelte` — there is no standalone `/horns` index. `/drivers?tab=horn` deep-links the tab. Horn detail (`/horns/[id]`) and compare (`/horns/compare`) are still their own pages; horn compare uses `HornCompare.svelte`.
- **Mix-and-match is by throat exit**: a horn mates a compression driver when `exitInch` matches. The horn detail page lists compatible CDs and the CD detail page lists compatible horns — both derived live, no stored link.
- `profile` is a closed taxonomy list (`hornProfile` in `data/taxonomy.json`). Coverage is **H×V separate**, never a single angle.
- Enclosures keep their own inline horn geometry (`hornCutoffHz`, `hornMouthCm2`, `coverageAngleDeg`, …) — horns are **not** referenced from enclosures.
- Schema in `src/content.config.ts`; rerun `npm run schema:gen` (regenerates `schema/horn.schema.json` too) after edits.

### Enclosure frontmatter: key invariants

- `drivers`: array of driver ids; **dangling ref = build error**
- `simulations`: array of `{ driver, kind, source: hornresp_sim|akabak_sim, file }`; one entry per driver per kind
- `measurements`: array of `{ driver, kind, source: rew_measured|klippel, file }`; one entry per driver per kind
- Both `simulations` and `measurements` are **1-to-1 with a driver**
- `maxSplDb` is **optional**. Boxes without it are excluded from SPL sorts/plots, never defaulted
- Acoustic limits: `maxSplExcursionDb` (below Fb, Xmax-bound) and `maxSplThermalDb` (above Fb, power-bound) are the two independent ceilings; `maxSplDb` is the headline figure. `powerAesW`/`powerProgramW` are system power handling; `impedanceMinOhm` is the load minimum. All optional, all factual. **Never derive or fabricate them**, leave absent if unknown
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

## Known gotchas

- **Biome crashes** on Svelte 5 `$props()` destructuring with `let` + `useConst` rule. Worked around via `overrides` in `biome.json` (rule disabled for `*.svelte`).
- **ECharts** is only loaded on the three interactive island pages (`/compare`, `/explore`, `/find`). All imports go through `src/lib/echarts.ts` to keep the bundle tree-shaken.
- **`client:only="svelte"`** on all islands. No SSR for interactive components. Fetches use `BASE = import.meta.env.BASE_URL.replace(/\/$/, "")` prefix.
- All units **SI only**: mm, L, Hz, dB, kg, W, Ω. No imperial.

## Conventions

- A **significantly different build = new slug**. Minor edits to the same design use `revision:`.
- Curves are discrete points. Do not interpolate or resample. `toPairs` zips directly for ECharts.
- `normalisePeak` is only applied for the SPL "normalise" toggle in Compare; never applied to stored data.
