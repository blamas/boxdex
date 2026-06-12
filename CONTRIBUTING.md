# Contributing to Boxdex

All content lives under `data/` and is validated at build time: `npm run build` (or
`mise run verify` for the full gate) tells you exactly what is wrong before you open
a PR. Controlled vocabularies (topology, license, recommendedFor, connectors, horn
profile) live in `data/taxonomy.json` — that file is the reference, not this document.

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
  - driver: bc-18ds115-8
    kind: spl
    source: hornresp_sim
    file: spl.csv
# measurements:                     # use this for rew_measured / klippel data
#   - driver: bc-18ds115-8
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

- `LicenseRef-Proprietary` entries are metadata-only — do **not** commit plan files,
  link them via `sourceUrl`.
- `LicenseRef-Permission` requires a `licenseNote` recording who granted permission,
  when, and with what scope.

### CSV format

Columns: `freq,value` (comma, semicolon, or tab). Lines starting with `#` and blank
lines are ignored. Non-finite values are dropped. Curves are discrete points — never
interpolated or resampled.

| kind | unit |
|------|------|
| spl | dB (absolute, e.g. 1W/1m) |
| phase | degrees |
| impedance | Ω |
| group_delay | ms |

### Metric definitions

| metric | definition |
|--------|------------|
| `volumeL` | `netVolumeL` from frontmatter |
| `footprintCm2` | `wMm × dMm / 100` (rounded to integer) |
| `heightMm` | `dims.hMm` |
| `weightKg` | `weightKg` (optional) |
| `f3Hz` | `specs.f3Hz` |
| `maxSplDb` | `specs.maxSplDb`: **optional**. A box without it is excluded from SPL-based sorts and plots; it is never guessed or defaulted. Only set this if you have a simulation or measurement to back it up. |
| `sensitivityDb` | `specs.sensitivityDb` |
| `outputDensity` | `maxSplDb − 10 × log₁₀(netVolumeL)` (dB): "loud per litre" |

The same rule applies to the acoustic-limit and power fields (`maxSplExcursionDb`,
`maxSplThermalDb`, `powerAesW`, `powerProgramW`, `impedanceMinOhm`): factual or absent,
never derived.

### Simulations vs measurements

Use `simulations:` for software data (HornResp, AkAbak) and `measurements:` for
real-world data (REW, Klippel). Each entry is **1-to-1 with a driver**. The `driver`
field is required and must reference an existing driver id.

| Field | Allowed `source` values |
|-------|------------------------|
| `simulations` | `hornresp_sim`, `akabak_sim` |
| `measurements` | `rew_measured`, `klippel` |

### Provenance

`provenance` is derived automatically: `"measured"` when `measurements` is non-empty,
`"sim"` otherwise.

This is shown as solid (measured) vs. dashed (sim) lines and circle vs. triangle symbols.

## Adding a driver

Create `data/drivers/<type>/<manufacturer>/<id>.json` where `<type>` is `cone` or
`compression` — the two have disjoint spec sets, discriminated on the required `type`
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
`schema/*.schema.json` — CI fails if the mirrors drift. Never hand-edit the mirrors.

## Running locally

```sh
npm install
npm run dev        # dev server (search doesn't work here)
npm run build      # production build + data validation
npm test           # vitest
npm run lint       # biome
mise run verify    # everything CI runs: lint + type-check + test + build
```
