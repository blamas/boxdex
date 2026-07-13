# ADR-007: i18n routing with prefixDefaultLocale enabled

## Status
Accepted

## Date
2026-07-09

## Context
Boxdex serves content in English and French. Astro's i18n routing offers two modes for
the default locale (English):

- `prefixDefaultLocale: false` (Astro default): English pages live at `/enclosures/…`,
  French at `/fr/enclosures/…`. The root `/` serves English directly.
- `prefixDefaultLocale: true`: all locales are prefixed; English lives at
  `/en/enclosures/…`, French at `/fr/enclosures/…`. The root `/` redirects to `/en/`.

The site generates ~6k pages per locale. Internal links, the `localeBase` helper,
the Worker's 404 resolution, canonical URLs, and the sitemap all depend on which
convention is chosen.

## Decision
Use `prefixDefaultLocale: true`. Every page URL includes an explicit locale segment.
`src/pages/index.astro` redirects `/` to `/en/`. The Worker's `notFoundKey` function
checks whether the first path segment is a known locale (`en` | `fr`) to serve the
correct locale 404 page.

## Alternatives Considered

### `prefixDefaultLocale: false` (unprefixed default)
- Pros: cleaner English URLs (`/enclosures/` vs `/en/enclosures/`), matches the
  convention users are most familiar with from single-language sites.
- Cons: two categories of URL have different shapes. Any component that builds an
  internal link must branch on "is this the default locale?". The Worker 404 logic
  must also branch. When a second language is added later, all existing English URLs
  stay at their un-prefixed paths while the new locale gets a prefix, which is
  asymmetric and easy to get wrong. Canonical URL generation in Astro's sitemap
  requires extra configuration to emit the correct hreflang alternates.
- Rejected: the asymmetry between locales creates a persistent maintenance hazard
  and was a source of bugs before the current convention was fixed.

### Single locale (English only, no i18n)
- Pros: eliminates all locale routing complexity.
- Cons: French is an active locale with translated UI strings, removing it would
  drop existing translated content.
- Rejected: not viable given existing French content.

## Consequences
- Every internal link in Astro templates and Svelte islands must include the locale
  segment. Use `localeBase` (SSR) or `BASE + /[locale]` (client) rather than
  root-absolute paths. Hardcoding `/enclosures/…` without a locale prefix is a bug.
- `src/pages/index.astro` is the only route at the bare root; it redirects to
  `/en/`. There is no content at `/`.
- The Worker's `notFoundKey` logic uses a hardcoded locale set (`en`, `fr`) mirrored
  from `src/i18n/index.ts`. When a new locale is added, both files must be updated.
- Adding a new locale requires: a new entry in `astro.config.mjs` `locales`, a new
  `src/i18n/locales/<code>.json` translations file, and updating the locale set in
  `worker/resolve.ts`.
