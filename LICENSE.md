# Boxdex licensing

This repository contains material under several licenses. License texts live
in [`LICENSES/`](LICENSES/), named by SPDX identifier.

| Path | License |
|---|---|
| everything not listed below (`src/`, `scripts/`, `test/`, `schema/`, config) | [MIT](LICENSES/MIT.txt) |
| `data/drivers/**`, `data/taxonomy.json` | [CC0-1.0](LICENSES/CC0-1.0.txt) |
| `data/enclosures/<slug>/**` | per entry: see below |

Driver and horn specs are factual data. Sources vary per entry and are
recorded in `datasheetUrl` where known: some entries are transcribed from
manufacturer datasheets, but the majority come from third-party parameter
aggregators, and some entries carry no source link at all. See
[`docs/methodology.md`](docs/methodology.md) for the provenance breakdown and
the tolerances to assume. Boxdex waives any database or compilation rights
over this data via CC0 (which also covers sui generis database rights).
Manufacturer and product names appear nominatively and remain trademarks of
their owners.

Original authors are always credited via the `author` field, whatever the
license of the entry; moral rights, where they apply, are unaffected by the
licenses below.

## Enclosure entries

Each enclosure entry (frontmatter, build notes, plans, photos, curve data)
carries its own license, declared in the required `license` field of its
`index.mdx`. The value is a closed vocabulary (`license` in
`data/taxonomy.json`):

- `CC0-1.0`, `CC-BY-4.0`, `CC-BY-SA-4.0`, `CC-BY-NC-4.0`, `CC-BY-NC-SA-4.0`:
  standard Creative Commons terms
- `LicenseRef-Permission`: all rights reserved by the author; hosted with
  their explicit permission
  ([LicenseRef-Permission.txt](LICENSES/LicenseRef-Permission.txt))
- `LicenseRef-Proprietary`: metadata-only entry; the protected plan files are
  **not** in this repository, only facts, independent measurements and a link
  to the official source
  ([LicenseRef-Proprietary.txt](LICENSES/LicenseRef-Proprietary.txt))

There is no default: every entry declares its license explicitly, and the
build fails otherwise. When the licensing of a source plan is unclear or
unverifiable, treat it as `LicenseRef-Proprietary`: link, don't host.

To use a new license for an entry: add its identifier to `license` in
`data/taxonomy.json` and drop the matching text into `LICENSES/`.
