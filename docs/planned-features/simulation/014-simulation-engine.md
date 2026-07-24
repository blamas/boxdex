# ADR-014: Simulation engine as client-side TypeScript with an offline Python oracle

## Status

Proposed

## Date

2026-07-24

## Context

Boxdex is adding loudspeaker simulation (see [`docs/simulation/README.md`](./README.md)):
first "box + driver" prediction (SPL, impedance, excursion, port velocity), then array/
spatial response. This forces a choice of **where the simulation runs and in what language**,
and that choice touches the properties Boxdex is built on.

Constraints in tension:

1. **Boxdex is a static, private, self-hostable site** ([ADR-001](../../decisions/001-static-site-generation.md),
   [ADR-003](../../decisions/003-r2-worker-hosting.md)): static output on R2, a thin Worker, no accounts, no
   backend state, and a self-hosted mirror stays purely static. Any runtime simulation
   service would spend exactly these properties.
2. **The mature acoustics libraries are Python** (os-lem, pyroomacoustics, python-acoustics,
   sfs-python) and depend on NumPy/SciPy, which **cannot run in a Cloudflare Worker or the
   browser** (except Pyodide, a ~15-30 MB download per visit for SciPy, browser-only, wildly
   disproportionate to the compute).
3. **The compute is small.** Box + driver is a dense complex solve on a handful-to-tens of
   nodes over a few hundred frequencies (sub-millisecond). Array field sums are grid × freq
   × source, still a Web-Worker job, not a server job. There is no performance forcing
   function to leave the browser.
4. **There is no mature, permissive TypeScript enclosure-simulation library.** The TS
   ecosystem here is nascent, so this part is built regardless of language choice.
5. The reusable acoustics code is Python (offline) and the reference kernel we lean on
   (os-lem) is GPL Python; licensing of any reuse is handled separately by the maintainer
   and is out of scope for this ADR.

## Decision

**Write the simulation engine in TypeScript and run it client-side (Web Worker) and at build
time. Use Python only offline, as a validation oracle and precompute step. Never stand up a
runtime simulation server; never ship Python (no Pyodide).**

Concretely:

- A framework-agnostic `packages/sim` with a typed `sim-core` contract; per-domain engines
  (`sim-box`, `sim-line`, `sim-space`, `sim-post`) depend on it. The site consumes the
  engines **live** in a Web Worker (interactive design) and **at build time** (precompute
  catalog curves into static data, served like the existing measured CSVs).
- The physics is reimplemented in TS from published theory and the feature reference. Small
  primitives are integrated from JS/TS libraries (FFT, complex/matrix solve, Bessel,
  ECharts, WAV); the pieces with no library (the physics, Struve `H1`, the field-grid
  renderer) are built.
- Python (os-lem, pyroomacoustics, python-acoustics) runs in `tools/oracle` **offline** to
  generate golden test vectors and precomputed data. It never reaches a user.
- **Escalation path**: if a genuinely heavy feature is ever needed (real directivity, BEM,
  large optimization sweeps), reach for **Rust → WASM** (runs client-side and compiles to an
  offline CLI) before any server. Preserve "no backend" as long as possible.

## Consequences

**Positive**

- Boxdex stays static, private, and self-hostable; a self-hosted mirror needs no simulation
  infrastructure.
- One language across app, engine, tests (Vitest), and schemas (zod); shared types between
  the sim inputs and the driver/enclosure data model ([ADR-005](../../decisions/005-driver-discriminated-union.md)).
- One engine serves both interactive (Worker) and precomputed (build-time) use.
- ECharts ([ADR-009](../../decisions/009-echarts-import-gateway.md)) already covers the output charts; no new
  charting dependency.
- A full simulation is shareable and reproducible via URL state ([ADR-008](../../decisions/008-url-state-persistence.md)).

**Negative / costs**

- The physics must be reimplemented in TS; there is no NumPy/SciPy, so a small complex
  solver, special functions (Struve `H1`), and the field-grid renderer are built by hand.
- Correctness rests on a disciplined validation program (analytic checks + Python golden
  vectors + external-simulator cross-checks + the measured catalog), described in
  [`simulation-reference.md`](./simulation-reference.md) §11-12. This is real
  ongoing work, and is the main risk this decision takes on.
- Matching Hornresp/AkAbak requires black-box characterization of their undocumented
  internals ([`blackbox-characterization.md`](./blackbox-characterization.md))
  rather than importing a reference implementation.

**Rejected alternatives**

- **Python simulation service** (call it from the site): breaks static/private/self-hostable,
  adds an ops and privacy surface. Rejected on identity grounds despite the mature libraries.
- **Pyodide (Python→WASM in the browser)**: ~15-30 MB SciPy download per visit to run a
  sub-millisecond solve, browser-only, mobile-hostile. Worst size-to-work ratio; rejected.
- **Rust/Go→WASM now**: solves a scale problem Boxdex does not have yet, at the cost of a
  second toolchain. Kept as the escalation path for a real future trigger, not adopted now.
