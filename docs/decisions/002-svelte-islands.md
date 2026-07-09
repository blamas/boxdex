# ADR-002: Svelte for interactive islands

## Status
Accepted

## Date
2026-07-09

## Context
Astro requires choosing an island framework for the interactive components: the filter
catalogs, compare views, stack builder, and chart wrappers. The interactive components
are self-contained (no shared server state) and need fine-grained reactive state
(filter chips, URL sync, chart options derived from theme CSS vars).

## Decision
Use Svelte 5 (runes API: `$state`, `$derived`, `$effect`, `$bindable`) for all
interactive islands, loaded with `client:only="svelte"`.

## Alternatives Considered

### React
- Pros: largest ecosystem, most StackOverflow answers.
- Cons: heavier runtime (~45 kB for React + ReactDOM vs. ~10 kB for Svelte's compiled
  output); the virtual DOM adds overhead for components that are already doing fine-grained
  DOM updates (chart resize, filter state). useEffect semantics are more footgun-prone
  than Svelte's `$effect` for synchronising external libraries (ECharts).
- Rejected: runtime weight and useEffect footguns outweigh the ecosystem advantage for
  this use case.

### Vue
- Pros: good ergonomics, Options API familiar to many.
- Cons: similar runtime weight to React. Astro + Vue integration is well-supported but
  the team had more Svelte familiarity at project start.
- Rejected: no functional advantage and unfamiliar team convention.

### Vanilla JS (no island framework)
- Pros: zero framework overhead.
- Cons: manually wiring reactivity for the catalog filter (20+ filter chips, sort
  state, URL sync, pagination) and the stack builder (crossover suggestions, wiring
  calc, per-slot URL state) would be a large maintenance surface. No component
  composability.
- Rejected: complexity scales badly with the number of interactive features.

## Consequences
- Islands use Svelte 5 runes throughout; Options API patterns from Svelte 4 do not apply.
- Biome can lint `.svelte` script blocks but cannot see template usage: unused-symbol
  rules are disabled for `.svelte` files to avoid false positives on template-only
  references.
- No SSR for islands (`client:only`): the initial page render shows no interactive
  content until hydration. Acceptable because the static HTML already shows the full
  enclosure/driver data; islands add filter/compare/chart capabilities on top.
- ECharts must not be initialised inside an island directly; `EChart.svelte` owns the
  lifecycle (init, resize, theme change, dispose). See ADR-005.
