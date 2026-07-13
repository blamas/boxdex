# ADR-009: ECharts tree-shaking via a single import gateway

## Status
Accepted

## Date
2026-07-09

## Context
Apache ECharts ships as a large monolithic package (~1.2 MB unminified). It supports
tree-shaking by allowing callers to import only the chart types and components they
use and compose them into a custom `echarts` instance. However, this only works if
every consumer imports from the same composed instance: if one island imports the
full `echarts` bundle and another imports a tree-shaken build, both end up in the
bundle.

Boxdex uses ECharts for: SPL/impedance curve overlays (`CurveChart.svelte`), radar
compare charts (`RadarCompare.svelte`), and the design-space scatter plot
(`DesignSpace.svelte`). These islands live on different pages but share the same
chart types (line, radar, scatter) and the same theme integration.

## Decision
All ECharts imports go through `src/lib/echarts.ts`. That module composes the
tree-shaken instance (registering only the chart types and components actually used),
exports the assembled `echarts` object, and exports `getActiveTheme()` which reads
CSS custom properties at call time to return the current accent colour and theme name.

No island or component imports from `echarts` directly. `EChart.svelte` is the only
component that calls `echarts.init`; islands pass an option builder function to
`EChart.svelte` rather than managing the chart lifecycle themselves.

## Alternatives Considered

### Import the full ECharts bundle
- Pros: no gateway module to maintain, any chart type works anywhere.
- Cons: the full bundle is ~500 kB minified + gzipped. Tree-shaking it to only line,
  radar, and scatter reduces this substantially. For a reference site where chart
  pages are not the landing page, loading 500 kB of JS on every page is wasteful.
- Rejected: unnecessary payload on pages that don't use charts (e.g. `/find`).

### Per-island imports of only the types each island needs
- Pros: maximum granularity, each island's bundle contains only what it uses.
- Cons: `echarts.use([…])` must be called before any init; if two islands on the same
  page register different component sets, the second call may or may not patch the
  first. The composed instance must be global and consistent. Without a shared gateway,
  contributors could accidentally import a component in one place that is missing on
  another page, causing runtime errors that are hard to reproduce.
- Rejected: correctness requires a single registration point.

### Chart.js
- Pros: lighter (~200 kB tree-shaken), widespread use.
- Cons: radar charts and scatter plots require separate plugins with inconsistent APIs.
  ECharts handles all three chart types (line, radar, scatter) in one unified option
  object format, which simplifies the `CurveChart` / `RadarCompare` / `DesignSpace`
  implementations.
- Rejected: ECharts covers all required chart types without extra plugins and its
  declarative option format is a better fit for the theme-reactive builder function
  pattern.

## Consequences
- `src/lib/echarts.ts` is the only file that imports from the `echarts` package.
  Knip enforces this indirectly: a direct `echarts` import in any other file would
  appear as a duplicate or unused dependency.
- When adding a new chart type, register it in `src/lib/echarts.ts` before using it.
  Forgetting to register produces a silent no-op (the chart renders empty) rather than
  a build error.
- `EChart.svelte` re-invokes the option builder function on theme change (listening to
  the `data-theme` attribute mutation). Option builders must be pure functions of
  their inputs and `getActiveTheme()`: they must not cache the theme at construction
  time.
- ECharts is only bundled on pages that import a component that uses `EChart.svelte`.
  Pages that are list/filter only (e.g. `/find`) do not pull in ECharts at all.
