# Boxdex simulation engine: plan

**Status**: Proposal, not yet adopted. Nothing here is built.
**Date**: 2026-07-24

This is a forward-looking plan for adding loudspeaker simulation to Boxdex. When the
approach is adopted, the durable decisions in "Key decisions" become focused Accepted ADRs
(one decision each, matching `docs/decisions/`), and the phasing below is executed and then
retired. It follows the same honesty posture as [ADR-012](../../decisions/012-data-provenance-and-model-limits.md)
and [`methodology.md`](../../methodology.md): state what we compute and where it breaks, first.

---

## Goal

Turn Boxdex from a catalog of measured/stored curves into a catalog that can also
**simulate**. Two capabilities, in order:

1. **"I have a box + driver, simulate it."** Predict SPL, impedance, excursion, port
   velocity, group delay for an enclosure loaded with a driver. Target: cover the common
   cases Hornresp is used for (sealed, vented, bandpass, simple horns/lines, single driver
   plus basic multi-driver) well enough to be trustworthy.
2. **"How does the stack respond in space."** Array/spatial simulation (AkAbak / ArrayCalc
   territory): sum multiple boxes over a field, model sub-array configurations (endfire,
   cardioid, arc, delay steering), coverage, and interference.

These are a **pipeline, not two parallel products**: capability 2 consumes the per-source
complex response produced by capability 1.

## Non-goals (the scope boundary)

- **No runtime backend.** The engine runs client-side (Web Worker) and/or at build time.
  No simulation server, no Pyodide-in-browser. This preserves Boxdex's static, private,
  self-hostable identity ([ADR-001](../../decisions/001-static-site-generation.md),
  [ADR-003](../../decisions/003-r2-worker-hosting.md)).
- **No BEM / FEM at runtime.** Boundary-element directivity is offline-only (precompute →
  import), never in the browser.
- **No directivity we do not have data for.** Boxdex holds no measured polar/balloon data,
  so 3D directivity is synthesized (approximate) or imported (SOFA), never claimed as
  measured.
- **No large-signal distortion or thermal compression** beyond illustration, because the
  driver data (Klippel large-signal curves, thermal `R_th`/`τ`) is not in the catalog.
- **Licensing of reused code is handled separately** by the maintainer and is deliberately
  out of scope for these docs.

## Strategy

- **Language: TypeScript, client-side.** The compute is small (a dense complex solve per
  frequency over a few hundred bins; array sums over a grid). No performance reason to
  leave the browser; every reason (static, private, self-hostable, one language, Vitest,
  zod, ECharts) to stay. See [ADR-014](./014-simulation-engine.md).
- **Two execution modes from one engine.** The same `packages/sim` code runs **live** in a
  Web Worker (interactive tweaking) and **at build time** (precompute catalog curves into
  static data, served like the existing measured CSVs).
- **Python is an offline oracle, never runtime.** os-lem, pyroomacoustics, python-acoustics
  run in CI/local to generate golden test vectors and precompute data. They never ship.
- **Escalate to Rust→WASM only on a real trigger** (genuinely heavy compute: real
  directivity, BEM, optimization sweeps), and even then client-side WASM before any server.

## Architecture (`packages/sim`)

Framework-agnostic, a typed contract in `sim-core`; engines depend on it; the site and any
build-time precompute both consume the engines.

```
packages/
  sim-core     units, complex math, freq grid, curve/FRD types, shared zod schemas  ← contract
  sim-box      box + driver electroacoustic (ref §1, §3)      depends on core
  sim-line     distributed acoustics / ABCD network (ref §2)  depends on core
  sim-space    array / spatial superposition (ref §4)         depends on core, consumes sim-box output
  sim-post     time-domain / observations (ref §5-6 post)     depends on core
app (boxdex)   consumes engines live (Worker) + at build time (precompute → static curves)
tools/oracle   Python (os-lem, pyroomacoustics) → golden vectors + offline precompute
```

One repo, packages not projects. Split repos only later, once the `sim-core` contract is
stable and an engine proves independently valuable. (`ref §N` points into
[`simulation-reference.md`](./simulation-reference.md).)

## Phased roadmap

Ordered by value-to-effort from the feature catalog. Each phase ships validated (see the
validation strategy) before the next opens.

- **P1 - Box + driver sweet spot.** Radiation space, sealed + vented, electrical impedance,
  cone excursion, port velocity, alignment auto-tune, basic multi-driver. All closed-form,
  client-side, Cx 1-3. Delivers the bulk of "replace Hornresp for common cases" off one
  small engine. Wire in **auto-simulate the catalog**, **swap-a-driver**, and
  **simulated-vs-measured overlay** here.
- **P2 - Distributed + the general engine.** Transmission line / MLTL, conical/exp/hypex
  horns, and the **node-based ABCD/two-port solver** (Cx 5, the AkAbak-style engine). This
  is where os-lem is worth the most as a porting base and oracle.
- **P3 - Arrays in space.** Complex point-source superposition, sub-array configs
  (endfire/cardioid/arc/steer), comb-filtering, coverage maps, distance/air absorption.
  Capability 2. Reuse pyroomacoustics offline for precomputed coverage where useful.
- **P4 - Directivity & interop.** Baffle diffraction, boundary loading, piston directivity,
  polar/DI, FRD/ZMA import-export, SOFA import. Import-only for measured balloons.
- **P5 - Time-domain & large-signal.** Group delay, impulse/step, CSD, min-phase, max SPL
  (Xmax vs Pe). Distortion/thermal only as data allows.

## Key decisions (to become ADRs on adoption)

1. **Client-side TypeScript engine, offline Python oracle** ([ADR-014](./014-simulation-engine.md)).
   Keeps Boxdex static/private/self-hostable; Python never ships.
2. **`packages/sim` with a typed `sim-core` contract**, engines consumed live and at build
   time. One repo, packages not projects.
3. **Hornresp-parity model choices** where they diverge from textbook defaults (single
   `Le` + Bl-derate, power-response SPL, flow-resistivity losses not Q-factors, piston/
   pulsating-sphere mouth termination). Documented in [`hornresp-model-notes.md`](./hornresp-model-notes.md).
4. **Three-layer validation**: analytic + Python golden vectors + external-simulator
   cross-check, with the **measured catalog as continuous ground truth**. Surface a
   **sim-confidence badge** (closed-form / numeric / measured-validated) per result, in the
   spirit of ADR-012.
5. **Black-box characterization** for Hornresp/AkAbak internals McBean does not publish
   (radiation impedance, end corrections, loss model, T/S→lumped conversion), instead of
   guessing or decompiling. See [`blackbox-characterization.md`](./blackbox-characterization.md).

## Document map

| Doc | What it is |
|---|---|
| [`README.md`](./README.md) (this) | The plan: goals, scope, strategy, roadmap, decisions |
| [`simulation-reference.md`](./simulation-reference.md) | The engineering reference: ~50 features (math, pitfalls, reference implementations), the integration/tooling map (§10), the validation strategy (§11), and cross-tool validation against Hornresp/AkAbak (§12) |
| [`hornresp-model-notes.md`](./hornresp-model-notes.md) | How Hornresp actually models each thing (from McBean's posts + Help), with a Boxdex parity checklist and open items |
| [`blackbox-characterization.md`](./blackbox-characterization.md) | Method for extracting Hornresp/AkAbak's undocumented internals by driving them and fitting their exports, and turning the results into golden fixtures + fitted constants |
| [ADR-014](./014-simulation-engine.md) | The core engine decision (client-side TS + offline oracle) in ADR form |

## How this fits Boxdex

- **Provenance and stated limits** (ADR-012, methodology.md): simulated numbers get the
  same honesty as stored ones. The sim-confidence badge tells a reader whether a figure is
  closed-form, numeric, or measured-validated, and every model's assumptions are documented
  in the reference.
- **Data model**: the driver discriminated union ([ADR-005](../../decisions/005-driver-discriminated-union.md))
  is the sim input; enclosure specs + measured CSV curves are the validation targets.
- **Charts**: ECharts ([ADR-009](../../decisions/009-echarts-import-gateway.md)) already covers
  FR curves, polars, coverage heatmaps, and (via echarts-gl) CSD/balloons. No new chart dep.
- **State**: a full simulation is shareable via URL state ([ADR-008](../../decisions/008-url-state-persistence.md)),
  and recomputes deterministically, so share links reproduce.
