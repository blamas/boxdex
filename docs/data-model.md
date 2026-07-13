# Data model

## Directory layout

```
data/
  taxonomy.json                    controlled vocabularies (see below)
  drivers/
    cone/<mfr>/<id>.json           cone driver (Thiele-Small)
    compression/<mfr>/<id>.json    compression driver (horn HF)
    horns/<mfr>/<id>.json          horn/waveguide (own collection, not a driver)
  enclosures/<slug>/
    index.mdx                      frontmatter metadata + freeform build notes
    *.csv                          frequency-domain curves (see CSV format below)
    *.pdf                          downloadable plan files
    *.png / *.jpg / *.webp         photos and renders
```

The `id` of a driver is the **bare filename** (no extension, no path). Manufacturer and
type folders are purely organisational. Enclosures reference drivers by id and a dangling
reference is a build error.

---

## Drivers: discriminated union

Drivers are a `z.discriminatedUnion("type", …)` on a required `type` field. The two
variants share a small base but have disjoint meaningful fields.

### Shared base

| Field | Type | Notes |
|-------|------|-------|
| `type` | `"cone"` \| `"compression"` | required discriminant |
| `brand` | string | manufacturer name |
| `model` | string | model designation |
| `impedanceOhm` | number | nominal impedance |
| `peW` | number | power handling (AES) |
| `datasheetUrl` | string? | optional datasheet link |

### Cone drivers (`type: "cone"`)

Thiele-Small parameters used for enclosure tuning. The `exitInch` and `sensitivityHornDb`
fields from compression drivers are **not valid here**.

| Field | Unit | Notes |
|-------|------|-------|
| `sizeInch` | in | nominal cone diameter |
| `fsHz` | Hz | free-air resonance |
| `qts` | - | total Q |
| `qes` | - | electrical Q (optional) |
| `qms` | - | mechanical Q (optional) |
| `vasL` | L | equivalent compliance volume |
| `sdCm2` | cm² | effective piston area |
| `xmaxMm` | mm | peak linear excursion (one-way) |
| `reOhm` | Ω | DC voice coil resistance (optional) |
| `bl` | T·m | force factor (optional) |
| `mmsG` | g | moving mass (optional) |
| `sensitivityDb` | dB | free-field sensitivity at 1W/1m (optional) |

EBP (`fsHz / qes`) and Vb hints in `lib/driver.ts` are cone-only. Any caller must gate
on `d.type === "cone"` before accessing these fields; the TypeScript discriminated union
enforces this.

### Compression drivers (`type: "compression"`)

Horn HF units. `sensitivityDb` from cone drivers is **not valid here**; use
`sensitivityHornDb` (measured on a reference horn).

| Field | Unit | Notes |
|-------|------|-------|
| `exitInch` | in | throat exit diameter (free number, no closed enum) |
| `throatMm` | mm | throat internal diameter (optional) |
| `voiceCoilMm` | mm | voice coil diameter |
| `fLowHz` | Hz | lower frequency limit |
| `fHighHz` | Hz | upper frequency limit |
| `minCrossoverHz` | Hz | protection floor (system crossover must be at or above this) |
| `crossoverSlopeDbOct` | dB/oct | recommended minimum slope (optional) |
| `sensitivityHornDb` | dB | sensitivity on a reference horn (semantically distinct from cone `sensitivityDb`) |
| `fsHz` | Hz | free-air resonance (optional) |
| `magnetMaterial` | string? | e.g. `"ferrite"`, `"neodymium"` |
| `weightKg` | kg | optional |

`minCrossoverHz` bakes into `EnclosureRecord` **only for all-compression enclosures**. In
a multi-way enclosure with cones the internal crossover already protects the CD, so this
field must not constrain the system crossover.

---

## Horns: standalone catalogue

Physical location `data/drivers/horns/<mfr>/<id>.json` is under `drivers/` for
organisation, but horns are their own Astro collection: the drivers glob excludes them
(`pattern: ["cone/**", "compression/**"]`). Horns are not transducers and are not
referenced from enclosures.

Compatibility with compression drivers is derived live from `exitInch` matching.
Coverage is always H×V separate, never a single angle.

| Field | Unit | Notes |
|-------|------|-------|
| `brand` / `model` | - | |
| `exitInch` | in | throat entry; must match the CD's `exitInch` to be compatible |
| `coverageHorizontalDeg` | ° | |
| `coverageVerticalDeg` | ° | |
| `cutoffHz` | Hz | low-frequency cutoff |
| `mouthWmm` / `mouthHmm` | mm | mouth dimensions |
| `depthMm` | mm | optional |
| `profile` | taxonomy | closed list: `data/taxonomy.json → hornProfile` |
| `constantDirectivity` | bool? | |
| `material` | string? | |
| `weightKg` | kg? | |
| `datasheetUrl` | string? | |

---

## Enclosures

Each enclosure is an Astro MDX content entry at `data/enclosures/<slug>/index.mdx`.

### Identity and slug

A significantly different build (different tuning, different driver, altered geometry)
gets a new slug so existing links stay stable. Minor corrections to the same design use
`revision:` on the same slug.

### Key frontmatter invariants

**`drivers`**: array of driver ids. A dangling reference is a build error.

**`driverCount`**: total driver count (may be > `drivers.length` for multi-driver
configs where the same driver is used multiple times).

**`simulations` / `measurements`**: same shape:

```yaml
simulations:
  - driver: [id]          # array; use [id1, id2] when one file covers combined response
    kind: spl             # spl | spl_stacked | phase | impedance | group_delay | …
    source: hornresp_sim  # see allowed sources below
    file: spl.csv
    note: "optional free-form context"
```

`driver[0]` is the key used by the curves API. Each entry is 1-to-1 with one CSV file.

| Field | Allowed `source` values |
|-------|------------------------|
| `simulations` | `hornresp_sim`, `akabak_sim`, `catt_sim`, `vituixcad_sim`, `winsd_sim`, `basta_sim` |
| `measurements` | `rew_measured`, `klippel` |

**`provenance`**: derived: `"measured"` when `measurements` is non-empty, else `"sim"`.
Never set this manually.

**`license`**: required, no default. SPDX CC id or `LicenseRef-Permission` /
`LicenseRef-Proprietary`. See [LICENSE.md](../LICENSE.md) for the full list.

- `LicenseRef-Proprietary`: metadata-only entry. `plans` must be empty; link via `sourceUrl`.
- `LicenseRef-Permission`: requires `licenseNote` recording the grant (who, when, scope).

**`availability`**: optional, no default. How the box is obtained: `free`, `paid`,
`contact`, `commission`, `out_of_print` (taxonomy `availability`). Absent means unstated.
The detail page shows it as a badge, highlighted for any non-free value.

**`contact`**: optional array of `{ channel, value, note? }` for reaching the designer
or vendor when the plans are not a free download. `channel` is the taxonomy
`contactChannel` (`email`, `website`, `profile`); `value` is an email address or a
free-form URL (a `profile` is any social-media profile URL). The safe href is built at
render by `contactHref` in `src/lib/contact.ts` (mailto/https only, a `javascript:`/`data:`
value renders as plain text). `availability: contact` or `commission` requires at least one `contact` entry or a
`sourceUrl` (a build error otherwise: "contact me" must point somewhere).

**`weightKg`**: loaded weight: cabinet + all installed drivers.

**`maxSplDb`**: optional headline SPL figure. A box without it is excluded from SPL
sorts and plots; it is never guessed or defaulted. Only set it when a simulation or
measurement backs it up.

### Acoustic-limit fields

All optional, all factual. Never derive or fabricate them: leave absent if unknown.

| Field | Definition |
|-------|------------|
| `maxSplExcursionDb` | SPL ceiling below Fb (Xmax-bound) |
| `maxSplThermalDb` | SPL ceiling above Fb (power-bound) |
| `powerAesW` / `powerProgramW` | system power handling |
| `impedanceMinOhm` | minimum load impedance |

### Derived metrics (computed at build time, not stored)

| Metric | Formula |
|--------|---------|
| `volumeL` | `netVolumeL` |
| `footprintCm2` | `wMm × dMm / 100` (integer) |
| `heightMm` | `dims.hMm` |
| `outputDensity` | `maxSplDb − 10 × log₁₀(netVolumeL)` |
| `outputPerKg` | `maxSplDb − 10 × log₁₀(weightKg)` (only when both present) |
| `nominalImpedanceOhm` | stated `specs.impedanceNominalOhm`, or driver nominal for single-driver boxes; undefined for multi-driver boxes without a stated value |

---

## Curves API

Each enclosure exposes a JSON endpoint at `/api/curves/<slug>.json`:

```json
{
  "slug": "tapped-horn-18",
  "name": "18\" Tapped Horn",
  "simulations": [
    {
      "driverId": "bc-18ds115-8",
      "source": "hornresp_sim",
      "curves": {
        "spl": { "freq": [20, 25, …], "value": [95.2, 98.1, …] }
      }
    }
  ],
  "measurements": []
}
```

`pickCurve` in `src/lib/curves.ts` selects measurement data when available, falling back
to simulation. Curves are discrete points; they are never interpolated or resampled.

---

## CSV format

Columns: `freq,value` (comma, semicolon, or tab delimiters are all accepted). Lines
starting with `#` and blank lines are ignored. Non-finite values are dropped.

| `kind` | unit |
|--------|------|
| `spl` | dB (1W/1m absolute) |
| `spl_stacked` | dB, stacked/cardioid configuration |
| `phase` | degrees |
| `impedance` | Ω |
| `group_delay` | ms |
| `distortion` | % |
| `power_compression` | dB |

---

## Taxonomy and controlled vocabularies

`data/taxonomy.json` is the authoritative source for all closed enumerations. The build
wires each list via `enumOf()` in `src/content.config.ts`; an out-of-list value is a
build error. To add a new valid value, edit the JSON only: no code change needed.

Fields backed by taxonomy arrays: `topology`, `topologyVariant`, `recommendedFor`,
`connectors`, `license`, `availability`, `contactChannel`, `hornProfile`.

When adding a new `topology` value, also add a glossary entry at `/glossary` (the page
deep-links to `#<topology>`).

---

## Schema source of truth

Zod schemas in `src/lib/schemas.ts` and `src/content.config.ts` are authoritative. The
JSON-schema mirrors in `schema/` (`driver.schema.json`, `horn.schema.json`,
`enclosure.schema.json`) are generated from them and used by editors for autocompletion.

After any schema edit: `npm run schema:gen`. Commit the regenerated mirrors. CI fails on
drift. Never hand-edit the mirror files.
