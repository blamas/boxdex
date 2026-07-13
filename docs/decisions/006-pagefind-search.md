# ADR-006: Pagefind for full-text search

## Status
Accepted

## Date
2026-07-09

## Context
Contributors and users need to find enclosures and drivers by name, topology, or
manufacturer without navigating the full catalog. The site is static (see ADR-001),
so search must either be client-side or call an external service.

Requirements:
- Works on a static deployment with no server-side query handler.
- Indexes the rendered HTML output, so enclosure descriptions and driver specs are
  automatically searchable without a separate indexing step.
- Result latency acceptable for a reference tool (sub-second on first query).
- Zero recurring cost.

## Decision
Use Pagefind via the `astro-pagefind` integration. Pagefind runs after `astro build`
to crawl `dist/` and generate a binary index under `dist/pagefind/`. The
`<pagefind-searchbox>` web component (`@pagefind/component-ui`) fetches the WASM
runtime and index shards on first use. Subsequent queries are in-memory.

## Alternatives Considered

### Algolia / Meilisearch (hosted)
- Pros: fast, typo-tolerant, rich faceting.
- Cons: requires an external service with an API key; Algolia's free tier has a record
  cap. Indexing must be triggered separately from the build. Adds a runtime dependency
  that could become unavailable.
- Rejected: operational complexity and cost for what is a single-user side project.

### Lunr / Fuse.js (in-memory, JSON index)
- Pros: pure JS, no WASM, works offline.
- Cons: the index JSON must be hand-built (Pagefind crawls the HTML automatically).
  Lunr's index serialised from ~6k pages would be several MB downloaded eagerly on
  every page load, not lazily on first search.
- Rejected: eager index download degrades LCP on all pages just to support search.

### No search (rely on browser Ctrl+F)
- Pros: zero implementation cost.
- Cons: Ctrl+F only searches the current page, finding a specific driver across 5,875+
  entries is not viable.
- Rejected: search is a core navigation requirement at this catalog size.

## Consequences
- Search is unavailable in `npm run dev` (Pagefind indexes the built output, not the
  dev server). Callers must run `npm run build && npx pagefind --site dist` then
  `npm run preview` to test search locally.
- The first search query on a cold page load pays for WASM initialisation (~200-400 ms
  on a fast connection). Subsequent queries within the same session are fast.
- Pagefind's default UI class names (`pagefind-ui__*`) are not on the page; the
  component-ui integration uses `pf-searchbox-*` selectors. E2E tests must use the
  correct selectors: `input.pf-searchbox-input`, `a.pf-searchbox-result`.
- Pagefind indexes HTML text content, so enclosure `index.mdx` body text, driver
  brand/model names in the rendered pages, and page titles are all searchable without
  any extra configuration.
