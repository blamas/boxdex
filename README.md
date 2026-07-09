# Boxdex: open enclosure plans

[![CI](https://github.com/blamas/boxdex/actions/workflows/ci.yml/badge.svg)](https://github.com/blamas/boxdex/actions/workflows/ci.yml)
[![Deploy](https://github.com/blamas/boxdex/actions/workflows/deploy.yml/badge.svg)](https://github.com/blamas/boxdex/actions/workflows/deploy.yml)
[![Built with Astro](https://img.shields.io/badge/built%20with-Astro-ff5d01?logo=astro&logoColor=white)](https://astro.build)
[![Hosted on Cloudflare](https://img.shields.io/badge/hosted%20on-Cloudflare-f38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com)

[![Page views](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/blamas/boxdex/analytics/shields.json&style=for-the-badge&cacheSeconds=86400)](https://github.com/blamas/boxdex/blob/analytics/analytics.json)
[![Top box of the month](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/blamas/boxdex/analytics/shields-top-box.json&style=for-the-badge&cacheSeconds=86400)](https://github.com/blamas/boxdex/blob/analytics/analytics.json)

A free, open, and privacy-respecting reference for sound-system loudspeaker design.
It centralises open enclosure plans, driver specs, and horn data so engineers and
builders can work without commercial lock-in or personal data exposure.

## Values

These are permanent commitments, not features or marketing.

**Free and open source.** The site itself is free software (MIT). Driver and horn specs
are CC0. Enclosure entries carry the original designer's license, which may be open
(CC0, CC-BY, CC-BY-SA), permission-based, or proprietary: we catalog designs honestly
regardless of their terms. Proprietary entries are metadata and a source link only; no
plan files are bundled without rights. The site never charges for access to any of it.

**No tracking, no accounts, no cookies.** The site is fully static. There are no user
accounts, no analytics cookies, no fingerprinting scripts, and no third-party trackers.
The only client-side storage is your browser's `localStorage` for theme preference and
stack state; it never leaves your device. Cloudflare processes standard infrastructure
access logs (IP, user-agent, URL) as any CDN does, but we have no access to that data and
do not add any layer on top of it.

**Take it, run it, share it.** Fork the repo, modify it, host your own instance, build
a regional mirror, translate it into another language: the code and the driver/horn
data are yours to use. Sound should be accessible everywhere, not locked inside one
platform. One caveat: enclosure-specific assets (plan PDFs, photos) each carry the
original designer's license and may not be freely redistributable; check the `license`
field of each entry before mirroring those files.

**Knowledge as protection.** Sound system culture has always lived under threat:
gatherings banned, equipment seized, organisers criminalised. It is the people, not
the website, who bear that risk. Keeping this knowledge free, open, and widely
distributed means builders and organisers are less dependent on any single source that
can be taken away. Anyone can have it. Anyone can pass it on.

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

## Architecture

Key decisions are recorded in [`docs/decisions/`](docs/decisions/):

| ADR | Decision |
|-----|----------|
| [001](docs/decisions/001-static-site-generation.md) | Static site generation with Astro |
| [002](docs/decisions/002-svelte-islands.md) | Svelte for interactive islands |
| [003](docs/decisions/003-r2-worker-hosting.md) | Cloudflare R2 + Worker for hosting |
| [004](docs/decisions/004-diffed-pr-previews.md) | Diffed PR preview deployments |
| [005](docs/decisions/005-driver-discriminated-union.md) | Discriminated union for the driver data model |
| [006](docs/decisions/006-pagefind-search.md) | Pagefind for full-text search |
| [007](docs/decisions/007-i18n-prefix-default-locale.md) | i18n routing with prefixDefaultLocale enabled |
| [008](docs/decisions/008-url-state-persistence.md) | URL as the only client-side state persistence |
| [009](docs/decisions/009-echarts-import-gateway.md) | ECharts tree-shaking via a single import gateway |
| [010](docs/decisions/010-taxonomy-controlled-vocabularies.md) | Taxonomy-driven controlled vocabularies |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for folder conventions, CSV format, metric
definitions, and the PR checklist.

Deeper references:

- [docs/data-model.md](docs/data-model.md): full data model: driver discriminated union,
  horn catalogue, enclosure frontmatter invariants, curves API shape, CSV format, taxonomy
- [docs/deployment.md](docs/deployment.md): CI/CD pipeline, R2+Worker setup, PR previews,
  required secrets and variables

## License

Code is MIT. Driver and horn specs are CC0. Each enclosure entry carries the original
designer's license in its frontmatter (open or proprietary), see
[LICENSE.md](LICENSE.md) for the full list and [LICENSES/](LICENSES/) for texts. No
enclosure is included without a stated license; the build fails on missing or
unrecognised values.
