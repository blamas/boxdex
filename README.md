# Boxdex: open enclosure plans

A static website centralizing open plans for sound-system subwoofer, kick, mid and top
enclosures, plus a driver/horn catalogue to design around them.

## Stack

| Area | Choice |
|------|--------|
| Generator | Astro (static) |
| Interactive islands | Svelte (runes) |
| Charts | **Apache ECharts**: one library for curve overlays, radar compare and design-space scatter |
| Search | Pagefind via astro-pagefind |
| Lint/format | Biome |
| Tests | Vitest (pure logic in `src/lib`, enforced coverage thresholds) |
| Units | SI only (mm, L, Hz, dB, kg, W, Ω) |
| Hosting | Cloudflare (static output on R2, served by a Worker) |

## Data model

```
data/
  taxonomy.json                    controlled vocabularies (topology, license, …)
  drivers/
    cone/<mfr>/<id>.json           cone driver specs (Thiele–Small)
    compression/<mfr>/<id>.json    compression driver specs
    horns/<mfr>/<id>.json          horn/waveguide catalogue (own collection)
  enclosures/<slug>/
    index.mdx                      frontmatter metadata + build notes
    *.csv                          frequency/phase/impedance/group-delay curves
    *.pdf                          downloadable plan files
    *.png / *.jpg / *.webp         photos and renders
```

Drivers are a discriminated union on `type: cone | compression`; the folder layout is
organisational, the **id is the bare filename**. Enclosures reference drivers by id and
a dangling reference fails the build. Horns are a standalone collection: a horn mates a
compression driver when their `exitInch` throat matches, derived live, never stored.

All data is validated against the zod schemas in `src/lib/schemas.ts` /
`src/content.config.ts` at build time. The JSON-schema mirrors in `schema/` are
generated from them (`npm run schema:gen`) for editor autocompletion; CI fails on drift.

A significantly different build variant gets a new slug so existing links stay stable;
minor edits to the same design bump `revision:`.

## Commands

```sh
npm install          # install dependencies
npm run dev          # development server (search not available here)
npm run build        # production build: validates all data; fails on bad refs
npm test             # vitest (pure logic only)
npm run lint         # biome check
npm run check        # astro/svelte/ts type-check
npm run schema:gen   # regenerate schema/*.schema.json after schema edits
```

With [mise](https://mise.jdx.dev): `mise run dev|build|test|lint|check|fix|verify`
(`verify` is the full pre-push gate: lint + type-check + knip + coverage + build).

## Deploying

The build is host-agnostic: `site` and `base` come from the `SITE_URL` / `SITE_BASE`
env vars, and the output is plain static files in `dist/`, so it can be hosted anywhere.
Production builds in **GitHub Actions**, syncs `dist/` to **Cloudflare R2**, and a small
Worker (`worker/`) serves the objects. R2 is used instead of Workers static assets because
the site exceeds the 20,000-file asset cap. Each PR gets a preview served from its own R2
prefix, with the URL posted as a sticky comment.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the folder conventions, CSV format, and
metric definitions.

## License

Code is MIT; driver/horn specs are CC0; each enclosure entry carries its own license
in its frontmatter (closed list in `data/taxonomy.json`): see [LICENSE.md](LICENSE.md).
