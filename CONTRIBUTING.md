# Contributing to Boxdex

Boxdex is a public commons for loudspeaker design: free data, free code, no accounts,
no tracking. Driver and horn specs go in as CC0. Enclosure entries carry the original designer's
license (open or proprietary), and that is preserved faithfully; the site never
re-licenses content or locks it behind payment. There is no company behind this that
can change those terms.

All content lives under `data/` and is validated at build time: `npm run build` (or
`mise run verify` for the full gate) tells you exactly what is wrong before you open
a PR. Controlled vocabularies (topology, license, recommendedFor, connectors, horn
profile) live in `data/taxonomy.json` (that file is the reference, not this document).

## Adding an enclosure

Create `data/enclosures/<slug>/` where `<slug>` is a short, stable, kebab-case
identifier (e.g. `tapped-horn-18`). A significantly different build gets a new slug;
minor edits use `revision:` on the same slug.

### Minimal `index.mdx`

```yaml
---
name: "18\" Tapped Horn"
category: sub          # sub | kick | mid | top
topology: tapped_horn  # closed list: data/taxonomy.json → topology
drivers:
  - bc-18ds115-8       # driver id = bare filename under data/drivers/
driverCount: 1
netVolumeL: 230
dims:
  hMm: 1020
  wMm: 600
  dMm: 680
specs:
  f3Hz: 35
  maxSplDb: 138        # optional: only set if you have a sim or measurement
simulations:
  - driver: [bc-18ds115-8]
    kind: spl
    source: hornresp_sim
    file: spl.csv
# measurements:                     # use this for rew_measured / klippel data
#   - driver: [bc-18ds115-8]
#     kind: spl
#     source: rew_measured
#     file: spl_meas.csv
license: CC-BY-SA-4.0  # required, closed list: data/taxonomy.json → license
---

Build notes in Markdown here.
```

### License

Every enclosure declares its own `license` (see [LICENSE.md](../LICENSE.md)). There is
no default on purpose: silently labelling a third-party plan would misstate its rights.

- `LicenseRef-Proprietary` entries are metadata-only: do **not** commit plan files,
  link them via `sourceUrl`.
- `LicenseRef-Permission` requires a `licenseNote` recording who granted permission,
  when, and with what scope.

### CSV format

Columns: `freq,value` (comma, semicolon, or tab). Lines starting with `#` and blank
lines are ignored. Non-finite values are dropped. Curves are discrete points, never
interpolated or resampled.

| kind | unit |
|------|------|
| spl | dB (absolute, e.g. 1W/1m) |
| spl_stacked | dB, stacked/cardioid configuration SPL |
| phase | degrees |
| impedance | Ω |
| group_delay | ms |
| distortion | % |
| power_compression | dB |

### Metric definitions

| metric | definition |
|--------|------------|
| `volumeL` | `netVolumeL` from frontmatter |
| `footprintCm2` | `wMm × dMm / 100` (rounded to integer) |
| `heightMm` | `dims.hMm` |
| `weightKg` | `weightKg` (optional): loaded weight, cabinet + all installed drivers |
| `f3Hz` | `specs.f3Hz` |
| `maxSplDb` | `specs.maxSplDb`: **optional**. A box without it is excluded from SPL-based sorts and plots; it is never guessed or defaulted. Only set this if you have a simulation or measurement to back it up. |
| `sensitivityDb` | `specs.sensitivityDb` |
| `outputDensity` | `maxSplDb − 10 × log₁₀(netVolumeL)` (dB): "loud per litre" |
| `outputPerKg` | `maxSplDb − 10 × log₁₀(weightKg)` (dB): "loud per kg", only when both `maxSplDb` and `weightKg` are present |

The same rule applies to the acoustic-limit and power fields (`maxSplExcursionDb`,
`maxSplThermalDb`, `powerAesW`, `powerProgramW`, `impedanceMinOhm`): factual or absent,
never derived.

### Simulations vs measurements

Use `simulations:` for software data (HornResp, AkAbak) and `measurements:` for
real-world data (REW, Klippel). Each entry is **1-to-1 with a driver**. The `driver`
field is required and must reference an existing driver id.

| Field | Allowed `source` values |
|-------|------------------------|
| `simulations` | `hornresp_sim`, `akabak_sim`, `catt_sim`, `vituixcad_sim`, `winsd_sim`, `basta_sim` |
| `measurements` | `rew_measured`, `klippel` |

Each simulation or measurement entry accepts an optional `note:` field for free-form context (e.g. `"digitized from PDF, ±2 dB accuracy"`).

### Provenance

`provenance` is derived automatically: `"measured"` when `measurements` is non-empty,
`"sim"` otherwise.

This is shown as solid (measured) vs. dashed (sim) lines and circle vs. triangle symbols.

## Adding a driver

Create `data/drivers/<type>/<manufacturer>/<id>.json` where `<type>` is `cone` or
`compression`: the two have disjoint spec sets, discriminated on the required `type`
field. The folders are organisational only: the **id is the bare filename** and must
match the `drivers:` reference in any enclosure that uses it. A dangling reference
fails the build.

See `schema/driver.schema.json` for the full schema with descriptions (most editors
pick it up automatically).

## Adding a horn

Create `data/drivers/horns/<manufacturer>/<id>.json` (schema in
`schema/horn.schema.json`). Horns are their own catalogue, not tied to a cabinet:
compatibility with compression drivers is derived from the `exitInch` throat match.
Coverage is always H×V separate, never a single angle.

## Changing a schema

The zod schemas in `src/lib/schemas.ts` and `src/content.config.ts` are the source of
truth. After editing them run `npm run schema:gen` and commit the regenerated
`schema/*.schema.json`: CI fails if the mirrors drift. Never hand-edit the mirrors.

## Running locally

```sh
npm install
npm run dev        # dev server (search doesn't work here)
npm run build      # production build + data validation
npm test           # vitest
npm run lint       # biome
mise run verify    # everything CI runs: lint + type-check + test + build
```

With mise, `mise install` also wires the pre-commit hook (via lefthook) that validates
driver and enclosure data files when you stage changes under `data/drivers/**` or
`data/enclosures/**`. You do not need to run the validator manually for routine edits;
the hook runs `node scripts/validate-driver.mjs <file>` on each staged file.

For a single-file check outside of a commit:

```sh
node scripts/validate-driver.mjs data/drivers/cone/acme/acme-18w8500.json
```

## Validating and testing your changes

Before opening a PR, run the full gate:

```sh
mise run verify
```

This runs, in order: `lint`, `check` (Astro/Svelte/TS type-check), `knip` (dead-code
check), `coverage` (Vitest with enforced thresholds), and `build` (production build +
data validation). CI runs the same sequence; a failure here will fail CI.

For a faster loop while editing data files only:

```sh
mise run build     # validates all data and catches dangling driver refs
```

Type-check and lint are not needed for data-only changes, but the build is authoritative.

## Workflow for common changes

### Adding a driver and using it in an enclosure

1. Create the JSON under `data/drivers/<type>/<mfr>/<id>.json`.
2. Run `node scripts/validate-driver.mjs <file>` to catch schema errors immediately.
3. Reference `<id>` in the enclosure's `drivers:` frontmatter array.
4. Run `mise run build` to confirm no dangling references and no schema violations.

### Editing the driver or enclosure schema

1. Edit `src/lib/schemas.ts` (and `src/content.config.ts` if adding a new collection field).
2. Run `npm run schema:gen` to regenerate `schema/*.schema.json`.
3. Commit both the schema source and the regenerated mirror. CI fails if the mirrors drift.
4. Never hand-edit the mirror files.

### Adding a taxonomy value

Edit `data/taxonomy.json` only: no code change needed. If you add a new `topology`
value, also add a glossary entry at `src/pages/[locale]/glossary.astro` with an anchor
matching the raw taxonomy value (enclosure pages deep-link to `#<topology>`).

## Pull request checklist

- `mise run verify` passes locally.
- New driver JSON files pass the single-file validator.
- `npm run schema:gen` was run and the mirror files are committed if you touched a schema.
- `license` is set on every new enclosure (no default; a missing license is a build error).
- `maxSplDb` and acoustic-limit fields are only set when a simulation or measurement backs
  them up: never estimated or defaulted.
- All units are SI (mm, L, Hz, dB, kg, W, Ω). No imperial units in data files.
- New `topology` values have a corresponding glossary entry.
