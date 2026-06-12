# Contributing to Boxdex

## Adding an enclosure

Create `src/content/enclosures/<slug>/` where `<slug>` is a short, stable, kebab-case
identifier (e.g. `tapped-horn-18`). A significantly different build gets a new slug;
minor edits use `revision:` on the same slug.

### Minimal `index.mdx`

```yaml
---
name: "18\" Tapped Horn"
category: sub          # sub | top
topology: tapped_horn  # see list below
drivers:
  - bc-18ds115-8       # must match a file in data/drivers/
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
license: CC-BY-SA-4.0
---

Build notes in Markdown here.
```

### Topologies

`sealed` · `bass_reflex` · `bandpass` · `tapped_horn` · `front_loaded_horn` ·
`folded_horn` · `transmission_line`

### CSV format

Columns: `freq,value` (comma, semicolon, or tab). Lines starting with `#` and blank
lines are ignored. Non-finite values are dropped.

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

Create `data/drivers/<brand>/<id>.json`. See `schema/driver.schema.json` for the full
schema with descriptions. The `id` must match the `drivers:` reference in any enclosures
that use it. A dangling reference fails the build.

## Running locally

```sh
npm install
npm run dev       # dev server (search doesn't work here)
npm run build     # production build + data validation
npm test          # vitest
npm run lint      # biome
```
