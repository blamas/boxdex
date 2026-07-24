# Black-box characterization of Hornresp / AkAbak

**Status**: Proposal, not yet adopted.
**Date**: 2026-07-24

Hornresp and AkAbak encode decades of tuned acoustic modeling, but their **internal
equations are largely unpublished** (McBean states parameters and behavior, rarely the
formulas), and they are closed-source with no CLI. This doc describes how to recover the
parts we need **legitimately and reliably**: by treating each tool as an oracle, driving it
with controlled inputs, and fitting its exported outputs. This is standard behavioral
characterization (observing a program's outputs), it needs no source and no decompilation,
and it gives us the thing we actually want: **behavioral parity plus fitted constants for
the sub-models the docs leave implicit.**

It complements, and is more useful than, reading theory threads: the threads tell us the
*shape* of a model ("piston-in-baffle mouth termination", "flow-resistivity losses"), and
black-box fitting pins the *constants and edge behavior* the threads omit.

## What this gets us (and what it does not)

**Recoverable by black-box fitting:**
- The mouth/radiation impedance vs frequency (drive a horn, back out the termination).
- Port/vent **end-correction constants** (sweep length, watch Helmholtz tuning).
- The **loss model** mapping (flow-resistivity + fill% → effective damping per segment).
- The **T/S → lumped** conversion Hornresp applies (enter T/S, read back computed Bl/Cms/Mms/Rms).
- The **radiation-space SPL offset** vs `Ang` (the ~5 dB, not 6, per halving).
- The size of the **isophase/plane-wave** divergence on Le Cléac'h / OS profiles.
- Golden reference curves for regression (SPL, impedance, excursion, velocity, group delay).

**Not recoverable / out of scope:**
- Proprietary source code or its structure (we do not want it; we want behavior).
- Anything the tool itself does not model (it will not teach us physics it omits).
- Absolute "why" of an empirical fudge factor, only its value and validity band.

## Export mechanisms (the oracle's output side)

- **Hornresp**: `File → Export` and the `F9` data export produce text/CSV for **SPL /
  Acoustical power / Electrical impedance / Diaphragm displacement / Particle velocity /
  Phase / Group delay**, plus the schematic geometry export. The "Input Record" (`.txt`
  since v24.10, or `.aks`) captures the full input so a run is reproducible.
- **AkAbak**: script-native (`.aks`, with `Def_Const` for parametric sweeps); outputs `.spl`
  text data files. Far easier to batch than Hornresp.
- Neither has a CLI, so runs are driven by **GUI automation** (AutoHotkey / AutoIt on
  Windows). This is done **offline and occasionally**; the fitted constants and golden
  curves are committed as static artifacts and CI never touches the tools. (Same pipeline
  as cross-tool validation, `simulation-reference.md` §12.)

## Method: isolate one unknown per experiment

The core technique is **controlled decomposition**: design inputs so that all but one
sub-model is trivial or known, sweep the variable that exercises the unknown, export, and
fit. Each experiment below yields either a constant, a small table, or a fitted function to
bake into `sim-core`.

### E1 - Mouth / radiation impedance
- **Setup**: a single straight (constant-area) segment of known length/area, no chamber, no
  filling, `Ang = 2π`. This is a lossless duct with a known transfer matrix, so the only
  unknown in the exported throat impedance is the **mouth termination**.
- **Sweep**: frequency; also vary mouth area and `Ang` (2π vs 4π).
- **Extract**: invert the known duct ABCD from the exported throat impedance to recover the
  mouth radiation impedance vs frequency. Compare against piston-in-infinite-baffle (2π) and
  pulsating-sphere (4π) analytic forms; confirm identity and fit any scaling.
- **Deliverable**: confirmed termination model + any correction, plus the `Ang` SPL-offset
  curve.

### E2 - Port / vent end correction
- **Setup**: a sealed rear chamber (`Vrc`) + rear vent (`Ap`, `Lpt`), no horn.
- **Sweep**: `Lpt` (and `Ap`) across a range; read the **Helmholtz tuning** (status bar / the
  impedance-saddle frequency in the export).
- **Extract**: solve `Fb = (c/2π)√(Ap/(Vrc·Leff))` for `Leff`, then `end_correction = Leff −
  Lpt` as a function of `Ap` (expect ≈ 0.85·r flanged + 0.61·r free, but fit Hornresp's
  actual value since it adds an "internal end correction").
- **Deliverable**: the end-correction constant(s) to match Hornresp's tunings.

### E3 - Loss / damping model
- **Setup**: one lossy segment (a line), vary `Fr1` (flow resistivity, mks rayls/m) and
  `Tal1` (fill %).
- **Sweep**: `Fr1 ∈ {0, 250, 500, 1000, 2000}`, `Tal1 ∈ {25, 50, 100}%`; export impedance +
  SPL ripple.
- **Extract**: fit the per-segment **complex propagation constant** `γ(ω) = α(ω) + jβ` that
  reproduces the observed resonance damping/broadening as a function of resistivity and fill.
  Confirm the reported "equivalent polyfill mass (kg)" mapping below 1000 rayls/m, and find
  where the model "breaks down at high resistivity" (a validity ceiling to document).
- **Deliverable**: `α(Fr1, fill, ω)` for the `sim-line` loss element.

### E4 - Driver T/S → lumped conversion
- **Setup**: enter drivers as full T/S (`Fs, Vas, Qes, Qms, Re, Le, Sd`); read back the
  Hornresp-computed `Bl, Cms, Rms, Mmd/Mms`.
- **Sweep**: a spread of drivers across the T/S space.
- **Extract**: confirm/pin the conversion (expect the textbook `Cms=Vas/(ρc²Sd²)`,
  `Mms=1/((2πFs)²Cms)`, `Bl=√(2πFs·Mms·Re/Qes)`, and the Mmd-vs-Mms air-load split), or fit
  any deviation. Also characterize the **"Lossy Le" Bl-derate** vs `Le/Re`.
- **Deliverable**: the exact conversion + the Bl-derate law, so imported drivers agree.

### E5 - Wavefront / isophase divergence
- **Setup**: identical geometry as a plane-wave profile (Exp) and as an isophase profile
  (Le Cléac'h / OS) where Hornresp switches models.
- **Extract**: the delta between plane-wave and isophase SPL/impedance vs frequency, to size
  the "bubble" correction and decide whether `sim-line` needs the isophase area integral or
  can stay plane-wave with a documented divergence on those profiles.
- **Deliverable**: a go/no-go + magnitude estimate for the isophase model.

### E6 - Reference-curve capture (regression golden set)
- **Setup**: the curated fixture corpus (one per topology + failure mode; see
  `simulation-reference.md` §11.7 and §12).
- **Extract**: export SPL / impedance / excursion / velocity / group delay for each; commit
  as golden files.
- **Deliverable**: the `reference/*.hornresp.frd|zma|spl` fixtures the Vitest suite compares
  against.

## Parameter-estimation workflow

For E1-E5 (fitting), not just capture:

1. **Generate** an input grid from a neutral fixture spec (one spec → Hornresp record +
   `.aks`, guaranteeing matched assumptions; see §12).
2. **Run + export** via GUI automation; parse the text/CSV exports.
3. **Fit** the unknown constant/function offline with least squares (Python + scipy, in
   `tools/oracle`), isolating one unknown per experiment.
4. **Lock** the result three ways:
   - a **fitted constant/table** baked into `sim-core` (e.g. the end-correction, `α(Fr1)`),
   - a **golden fixture** for regression (the raw exported curves),
   - a **documented assumption** in the reference (what was fit, over what band, with what
     residual and validity ceiling).

## Tooling

- **AutoHotkey / AutoIt** to drive the Hornresp/AkAbak GUI (load record → calculate → export
  → save), looping over the input grid.
- **Record / `.aks` generators** (TS or Python) from the neutral fixture spec.
- **Parsers** for Hornresp export text, AkAbak `.spl`, FRD, ZMA (shared with the interop
  work, reference §7).
- **A fitting notebook** (`tools/oracle`, Python + scipy.optimize) for E1-E5.
- **Version-pin** the Hornresp build used (record it per fixture), since model corrections
  land in specific versions (e.g. the 2nd-harmonic `1/√2` fix ~v48.60).

## Guardrails

- **Single source of truth for inputs.** Generate both the Boxdex model and the tool input
  from one spec; never hand-transcribe. Encode identical assumptions (radiation angle,
  losses, drive voltage, driver params, segment counts).
- **Isolate one unknown at a time.** A fit over a model with two unknowns is not a fit.
- **Exclude out-of-model bands.** Do not fit where the tool is knowingly wrong (port pipe
  modes it does not model, HF past directivity onset, above the loss-model breakdown).
  Record the excluded bands.
- **Report residuals and validity range** for every fitted constant. A constant without a
  stated band is a landmine.
- **Black-box only.** Observe inputs and outputs. Do not decompile; there is nothing in the
  binary we need that this method does not give us (see the discussion in the plan history).

## Deliverables checklist

- [ ] E1 mouth/radiation impedance: model confirmed + `Ang` SPL-offset curve.
- [ ] E2 port end-correction constant(s), fitted to Hornresp tunings.
- [ ] E3 per-segment loss `α(Fr1, fill, ω)` + breakdown ceiling.
- [ ] E4 T/S→lumped conversion + Lossy-Le Bl-derate law.
- [ ] E5 isophase-vs-plane-wave divergence sizing (go/no-go).
- [ ] E6 golden reference curves for the fixture corpus.
- [ ] Fitted constants baked into `sim-core`, each with residual + validity band documented
      in `simulation-reference.md`.
- [ ] The GUI-automation + generator + parser + fitting scripts committed under
      `tools/oracle`.
