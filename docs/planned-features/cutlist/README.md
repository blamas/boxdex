# Cutlist optimizer and CNC-ready export: plan

**Status**: Proposal, not yet adopted. Nothing here is built.
**Date**: 2026-07-24

This is a forward-looking plan. When the approach is adopted, the durable decisions in
the "Key decisions" section become focused Accepted ADRs (one decision each, matching the
existing `docs/decisions/` style), and the phasing below is executed and then retired.

---

## Goal
Let a builder go from a chosen enclosure (or a whole stack) to a material-optimized,
CNC-ready cut file, so material is optimized before cutting. Two capabilities:

- **Material optimization**: pack panels for one box, or for a whole stack, onto standard
  sheet stock to minimise waste.
- **A CNC-ready file**: produce geometry a CNC router can cut, imported into the builder's
  own CAM tool.

## Non-goals (the scope boundary)
Boxdex emits a **layered DXF (plus an SVG preview)** for CAM import. It does **not** emit
machine G-code or toolpaths. G-code is per-controller (GRBL, LinuxCNC, Shopbot, Mach3,
Masso), bakes in tool diameter, feeds and speeds, holding tabs, and dogbone fillets that
depend on the builder's machine and cutter, and carries real safety weight on geometry
the site never measured. The CAM-import file is the universal stopping point and keeps the
geometry machine-neutral.

Also out of scope for v1: non-through features (pockets, dados, rabbets), which carry a
depth plain DXF cannot encode. Deferred to a possible later layer-naming convention.

## Key decisions (to become ADRs on adoption)
1. **DXF for CAM import, never machine G-code.** Machine-neutral, universal, verifiable.
2. **DXF is the P2 source of truth, with a build-derived manifest.** Contributors author
   in their own CAD tool (Fusion, SketchUp) and commit one layered DXF per box. The build
   validates it and derives a small JSON manifest the optimizer and UI read. DXF is what
   people already have and is unit-aware (`$INSUNITS`), so authoring stays in the tool.
   This supersedes an earlier idea of a hand-authored parametric-geometry JSON schema.
3. **Through-cuts only in v1, cutout baked into the DXF.** Outer closed contour = part
   boundary, inner closed contours = through-cuts (driver holes, ports). The baffle
   cutout lives in the committed DXF, so `driverProfiles` is untouched and a box's
   geometry is one self-contained file. A differing driver cutout means a separate DXF, or
   a new slug when the difference is significant.
4. **True-shape nesting via a vendored SVGnest core.** No-Fit-Polygon plus genetic
   algorithm. The best implementation is SVGnest (MIT) but its npm forks are unmaintained,
   so vendor the core behind `src/lib/nest.ts` under test. The GA is seeded (URL carries
   inputs only, layout recomputes, so share links reproduce), and it runs in a Web Worker.
5. **License gate.** Only `CC0` / `CC-BY` / `CC-BY-SA` boxes may carry or export geometry.
   A cut file is the complete plan, so proprietary and most permission entries never do.

## Phase 1: rectangular optimizer, user-entered panels
Ships independently, no catalog data and no schema change.

- **Input**: a hand-typed or pasted panel list (label, wMm, hMm, qty, grain), plus stock
  (sheet W and H, thickness) and kerf.
- **Engine**: `src/lib/cutlist.ts`, a rectangular packer (guillotine / MaxRects), pure and
  unit-tested, in the coverage gate. Deterministic.
- **UI**: a Svelte island rendering the nested layout as SVG, with a cut sheet. Export via
  `src/lib/export.ts` (DXF / SVG / CSV Blob download). URL-state for inputs (ADR-008).
- **Entry points**: available per-box and on the stack page (see P2 entry points).
- **Value**: a working optimizer immediately, with zero data or licensing dependency.

### P1 tasks
- [ ] `src/lib/cutlist.ts` packer + tests (kerf, grain, multiple stock sizes, optional
      guillotine-cut constraint)
- [ ] yield / waste statistics (used area, offcuts, total cut length)
- [ ] `taxonomy.json`: add `panelRole`, `grainDirection`
- [ ] cutting-diagram island (SVG) + inputs, URL-state wired, printable cut sheet
- [ ] DXF/SVG/CSV export helpers (extend `src/lib/export.ts`, add `src/lib/dxf.ts` writer)

## Phase 2: catalog geometry from DXF
Adds the per-box DXF source, true-shape nesting, and layered DXF export, wired into the
catalog.

- **Source**: one layered DXF per box, committed by the contributor (see decision 2).
- **Build step**: parse and validate (units resolve to mm, contours closed, layers match
  the convention), then emit a generated `manifest` (part list, bounding boxes, feature
  summary). A DXF on a non-open license is a build error.
- **Interpretation**: through-cuts only, cutout baked in (decision 3).
- **Nesting**: `src/lib/nest.ts`, vendored SVGnest core, seeded, in a Web Worker
  (decision 4). This is the first worker in the codebase (islands are `client:only`
  today).
- **Export**: nested layered DXF, plus SVG preview and a human cut sheet, client-side Blob.
- **Entry points**: both a per-box export on the enclosure page and a stack-level
  "optimize the whole rig" that pools every cab's manifest.

### P2 tasks
- [ ] `src/lib/dxf.ts` parser + manifest derivation + tests
- [ ] frontmatter `stock[]` schema (supersede `plywoodThicknessMm` + `sheetSizeMm`,
      keep back-compat), regenerate `schema/*.schema.json`
- [ ] per-box DXF as a validated build input, license gate at build
- [ ] vendor + wrap SVGnest core in `src/lib/nest.ts`, seeded, tests
- [ ] Web Worker host for the nester, island integration
- [ ] stack-level aggregate export (pool manifests across cabs)
- [ ] license gate at export (refuse non-open)

## Feature parity with general cut optimizers (e.g. opticutter, cutlistoptimizer)
The core panel-cutting tool those sites offer is P1. Boxdex then goes beyond them with
true-shape and CNC output (P2), and intentionally drops the account-based parts.

| Their feature | Boxdex status |
|---|---|
| 2D rectangular sheet nesting | P1 core |
| Saw kerf allowance | P1 core |
| Grain direction / rotation lock | P1 (per-panel `grain`) |
| Multiple stock sizes and materials | P1, `stock[]` supports several, nester must handle mixed stock |
| Part labels / naming | P1 |
| Waste and yield statistics (used area, offcuts, cut length) | P1, add to scope |
| Guillotine-cut constraint (edge-to-edge, needed by panel saws) | P1, add as an option (irrelevant for CNC, which cuts any shape) |
| Print / PDF cut sheet | P1, SVG plus print CSS, PDF optional |
| Export (DXF / SVG / CSV) | P1 core, and richer than these sites |
| True-shape (irregular) nesting | P2, beyond these sites |
| Layered DXF for CNC / CAM import | P2, beyond these sites |
| Material cost estimate | Optional, a cost-per-sheet input times sheet count |
| 1D / linear cut optimizer (bar stock: battens, cleats, port lengths) | Optional, later, scope creep for v1 |
| Edge banding | Out of scope, niche for speaker builds |
| Accounts, saved projects, tiered limits | Out of scope by design, URL-state instead (ADR-008), free and open |

Net: yes, P1 reproduces what a builder actually uses opticutter for, once multiple stock
sizes, a guillotine-cut option, yield statistics, and a printable cut sheet are in P1
scope. The deliberate gaps are accounts and paywall features, which conflict with the
privacy-first, accountless design, and edge banding, which is niche here.

## Data model changes
- **Frontmatter**: add `stock[]` (thickness, sheet W and H, optional material),
  superseding scalar `plywoodThicknessMm` and `sheetSizeMm`, single-entry box stays the
  common case.
- **Per-box DXF**: a new validated build input that produces a generated manifest.
- **Taxonomy**: add `panelRole`, `grainDirection`.
- **`sheetCount` semantics**: stays the designer's **stated** figure. The optimizer shows
  a **computed** minimum alongside it and flags any mismatch, never overwrites it. (Keeps
  the "never derive or fabricate" rule from ADR-012.)

## Dependencies to vet (against the repo dependency rules)
- DXF **parser** (read contributed files) and DXF **writer** (emit nested result). Check
  maintenance, download counts, and audit before adding.
- Nesting core is **vendored**, not an npm dependency, and carries its own license header.

## Risks and open questions
- **First Web Worker** in a codebase where every island is `client:only`. Worker
  lifecycle (spawn, message, terminate) and bundling with Astro need a spike.
- **DXF variance**: real-world DXF from different CAD tools varies (units, layer naming,
  open vs closed contours). Validation must be strict and the contributor guidance clear.
- **Nesting cost**: the GA is heavy. Confirm acceptable runtime for a full-stack pool in a
  worker, and tune the time budget.
- **Contribution path**: v1 assumes the DXF is committed via PR. Extending the
  box-contribute pipeline (ADR-011) to accept a DXF upload is a separate, later question.
- **Authoring effort and licensing** are the real gate on P2 coverage: only openly-licensed
  boxes can ship geometry, and each needs a real DXF. This is content, not code.

## Docs to update on adoption
- Extract decisions 1-5 into focused Accepted ADRs (next number is 014).
- `docs/methodology.md` section 11 ("what Boxdex does not do"): add "no machine G-code or
  toolpath generation, cut export stops at CAM-import geometry".
- `docs/data-model.md`: document `stock[]`, the per-box DXF, and the manifest shape.
- `README.md`: link the new ADR(s) in the architecture table.
