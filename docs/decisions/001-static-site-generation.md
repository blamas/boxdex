# ADR-001: Static site generation with Astro

## Status
Accepted

## Date
2026-07-09

## Context
Boxdex is a reference catalogue: driver specs, enclosure plans, curves, and a design
tool. The content is read-heavy and changes only when a contributor adds or edits an
entry. The interactive parts (filter, compare, stack builder) run entirely on client
state derived from data fetched at page load, not from session-specific server state.

Key constraints:
- No user accounts, no mutations, no personalisation.
- The data volume is large (5,875+ drivers, hundreds of enclosures, pagefind index)
  but access patterns are uniform: the same page looks the same for every visitor.
- Hosting budget is zero beyond what Cloudflare's free tier covers.
- Build-time validation of all referenced driver IDs and schema conformance must fail
  the build, not surface as runtime errors.

## Decision
Use Astro in `output: "static"` mode. All pages are pre-rendered to plain HTML/CSS/JS
at build time. Interactive components are Svelte islands hydrated client-side
(`client:only="svelte"`).

## Alternatives Considered

### Astro SSR (server-rendered)
- Pros: fresh data on every request, easier to add a future write endpoint.
- Cons: requires a persistent runtime (Workers SSR is more complex and slower to cold
  start), and the content changes rarely enough that a build-time rebuild on merge is
  fast enough (~2-3 min). Every visitor getting a pre-built HTML page is faster.
- Rejected: the latency and infrastructure cost of on-demand rendering buys nothing
  for this content type.

### Next.js / Nuxt / SvelteKit (full-stack)
- Pros: larger ecosystems, more examples online.
- Cons: all optimise primarily for SSR or hybrid rendering; static export is a
  secondary path with more friction. Astro's island architecture fits the actual usage
  pattern (mostly static pages, a handful of interactive components) more directly.
- Rejected: higher complexity for no functional gain given the content model.

### 11ty (pure static)
- Pros: extremely lightweight, no JS runtime.
- Cons: no first-class island system; adding Svelte or React components requires custom
  build glue. Zod integration for content validation would be manual.
- Rejected: content validation and island hydration are first-class requirements.

## Consequences
- Every content change (add a driver, edit an enclosure) requires a full rebuild and
  deploy to become visible. Acceptable given the contributor model.
- No server-side personalisation is possible. Acceptable; the site is intentionally
  public and stateless.
- Build failures from bad data references are caught before any user sees the site.
- `SITE_URL` and `SITE_BASE` are injected at build time, keeping the output
  host-agnostic (same build can be served from any origin).
