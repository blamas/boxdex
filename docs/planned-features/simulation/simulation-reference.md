# boxdex — LEM / Array Simulation Feature Dossier

A fully-documented reference for building loudspeaker enclosure + array simulation into boxdex.
Target runtime: **client-side TypeScript** (Web Worker for heavy work, build-time precompute for catalog curves), with an optional **offline Python oracle** (e.g. os-lem) for validation and golden test vectors.

**How to read each entry**
- **Model / math & refs** — governing physics, key equations, authoritative sources to implement from.
- **Watch out for** — the real numerical / physical / convention traps.
- **Reference implementations** — projects and tools to study.
- **Tags** — `Value` (★★★ core mission · ★★ strong · ★ nice/far) · `Cx` (1 trivial → 5 research-grade) · `Client-side` (✅ / ⚠️ import-only / ❌ offline) · `Data-gated` where the model needs data catalogs rarely have.

---

## Master ranked view (value first, best-ROI at top of each tier)

| Feature | Value | Cx | Client-side | Notes |
|---|---|---|---|---|
| Radiation space / half-space loading | ★★★ | 1 | ✅ | Solid-angle factor; correctness everywhere |
| Sealed (closed) box | ★★★ | 1 | ✅ | Closed-form 2nd-order |
| Vented / bass-reflex | ★★★ | 3 | ✅ | 4th-order + losses + port end-correction |
| Electrical impedance (mag+phase) | ★★★ | 2–3 | ✅ | Needs semi-inductance for HF tail |
| Cone excursion vs freq | ★★★ | 2–3 | ✅ | Sub-Fb runaway is the safety headline |
| Port velocity + chuffing | ★★★ | 2–3 | ✅ | Report curve, flag Mach %, flare-dependent |
| Alignment tables + auto-tune | ★★★ | 3 | ✅ | QB3/SBB4/B4/C4/EBS/Bessel |
| Multi-driver (series/parallel/isobaric) | ★★★ | 2 | ✅ | Isobaric changes Mms not Sd |
| Point-source array superposition | ★★★ | 2 | ✅ | The spatial engine core |
| Sub-arrays (endfire/cardioid/arc/steer) | ★★★ | 3 | ✅ | Highest-value spatial feature |
| Piston on/off-axis directivity | ★★ | 1 | ✅ | `2J1(ka)/ka`, needs Bessel |
| Group delay | ★★ | 1 | ✅ | −dφ/dω, unwrap first |
| Comb filtering / interference | ★★ | 2 | ✅ | Falls out of complex sum |
| Baffle step + edge diffraction | ★★ | 2 | ✅ | Vanderkooy/Bagby secondary sources |
| Boundary loading / Allison dip | ★★ | 2 | ✅ | Image sources |
| Amp source model (Rg, Eg, current drive) | ★★ | 2 | ✅ | Current drive removes damping |
| Zobel / conjugate / notch | ★★ | 2 | ✅ | Tie to real Le model |
| Transmission line (straight/tapered) | ★★ | 2 | ✅ | ABCD chain, quarter-wave |
| Max SPL (Xmax vs Pe) | ★★ | 2 | ✅ (partly data-gated) | Xmax/Pe usually on datasheets |
| Impulse / step response | ★★ | 2–3 | ✅ | IFFT with Hermitian symmetry |
| MLTL / TQWT / quarter-wave | ★★ | 3 | ✅ | Mass-loaded terminus |
| Coverage / SPL mapping | ★★ | 3 | ✅ | Band-average at HF |
| Distance loss + ISO 9613 air absorption | ★★ | 3 | ✅ | Per-frequency α |
| Active filters / PEQ / delay / bi-amp | ★★ | 3 | ✅ | RBJ biquads + delay summation |
| Min-phase reconstruction (Hilbert) | ★★ | 3 | ✅ | Only valid for min-phase systems |
| Polar maps + DI / beamwidth | ★★ | 3 | ✅ | True DI needs full-sphere integral |
| Node-based ABCD/two-port solver | ★★ (enabler) | 5 | ✅ | The AkAbak-style general engine |
| Passive radiator | ★★ | 4 | ✅ | Notch below Fb |
| Bandpass (4/6/8) | ★★ | 4 | ✅ | Two-param optimization, ripple |
| Horn profiles (conical…OS) | ★★ | 4–5 | ✅ | Webster; mouth-size vs cutoff |
| Crossover synthesis | ★★ | 4 | ✅ | Needs real (non-resistive) load |
| Ground-plane / half-space arrays | ★★ | 4 | ✅ | Image sources, R(f)<1 |
| Line-array splay | ★ | 4 | ✅ | Far-field-per-element caveat |
| Tapped / back-loaded horn | ★ | 4 | ✅ | Two-tap coupling, phase sum |
| Multi-segment horns | ★ | 3 | ✅ | Flare continuity at joints |
| Throat adapter / flare continuity | ★ | 2–3 | ✅ | Slope-match, not just area |
| Lossy / semi-inductance Le | ★ | 4 | ✅ | Fractional-order fit |
| TS derivation from impedance | ★ | 4 | ✅ | Sd error, Re drift |
| CSD / waterfall | ★ | 3 | ✅ | Visualization only for LTI |
| .wav impulse export | ★ | 1 | ✅ | RIFF/WAVE writer |
| 2D wavefront visualizer | ★ | 3 | ✅ (qualitative) | FDTD, 2D≠3D levels |
| Balloon + GLL/CLF/SOFA | ★ | 4 | ⚠️ import | No measured data; SOFA is the open target |
| Power compression / thermal | ★ | 2 (math) | ✅ | Data-gated (R_th, τ rarely published) |
| Distortion (Bl(x)/Cms(x)/Le(x)) | ★ | 5 | ✅ | Data-gated (Klippel curves) |
| BEM radiation/directivity | ★ | 5 | ❌ offline | Precompute → import balloon |

**Sweet spot to build first:** the top block of ★★★ at Cx 1–2 (radiation space, sealed, impedance, excursion, port velocity, multi-driver, point-source superposition) gives the entire "box + driver, Hornresp-for-common-cases" story plus the array core off one small closed-form engine.

---

# 1. Enclosure lumped-element models (Thiele/Small)

> These are the classic small-signal electro-mechano-acoustic analogy evaluated as a frequency-domain transfer function `H(jω)`. Same engine as WinISD/Basta!/VituixCAD; not a wave/BEM solver.
> Common primary sources: **Thiele** "Loudspeakers in Vented Boxes" (JAES 19, 1971); **Small** closed-box / vented-box / passive-radiator series (JAES 1972–74); **Beranek & Mellow** *Acoustics: Sound Fields and Transducers*; **Leach** *Introduction to Electroacoustics*; **Dickason** *Loudspeaker Design Cookbook*.

## 1.1 Sealed (closed) box — ★★★ · Cx 1 · ✅
**Model / math & refs.** Second-order high-pass. `α = Vas/Vb`; `Fc = Fs·√(1+α)`; `Qtc = Qts·√(1+α)` (so `Qtc/Qts = Fc/Fs`); box for target Qtc: `Vb = Vas/((Qtc/Qts)²−1)`. Response `|H|² = (f/Fc)⁴ / [(f/Fc)⁴ + (f/Fc)²(1/Qtc²−2) + 1]`. Butterworth Qtc=0.707; critically damped ≈0.5; Qtc≈1.1 ≈ +1 dB peak. (Small Closed-Box I–II; Leach Ch.4.)
**Watch out for.** Fold box losses in (effective Qtc slightly below lossless formula). Vb = net internal volume (subtract driver/bracing/port displacement); stuffing raises effective Vb ~15–25% (adiabatic→isothermal). 2nd-order roll-off ignores Le (adds HF tilt). Don't confuse Qtc with Qts.
**Reference implementations.** `kbasaran/Speaker-Calculator` (Python), `be1/qspeakers` (C++/Qt); WinISD/Basta! (freeware) for behaviour.

## 1.2 Vented / bass-reflex — ★★★ · Cx 3 · ✅
**Model / math & refs.** 4th-order high-pass (driver + Helmholtz resonator). Lossless normalized `G(s) = s⁴/(s⁴+a₃s³+a₂s²+a₁s+1)`, `s` normalized to `ω₀=2π√(Fs·Fb)`. Design params `{h=Fb/Fs, α=Vas/Vb, Qts, Ql}`. Port tuning `Fb = (c/2π)·√(Sv/(Vb·Leff))`, `Leff = Lv + end corrections`; port end correction ≈ `0.85r` (flanged) + `0.61r` (free) ≈ `0.85d` total for a one-flanged tube. (Thiele 1971; Small Vented-Box I–IV.)
**Watch out for.** Port **end correction** shifts Fb by several Hz if omitted. Bigger Sv → longer tube (can be impractical). Model three losses: leakage `Ql` (~5–20, dominant, fills impedance saddle), absorption `Qa`, port `Qp` (~50–100). **Port pipe resonance** (organ-pipe modes ~c/2L) is outside the lumped model → real spurious spike. Pick one normalization (Fb vs √(Fs·Fb)). Below Fb the cone is acoustically unloaded (see 1.8).
**Reference implementations.** `jmpolom/Vented` (Python, explicit T/S vented); `vasilenkoalexey/Boxed` (C++/ImGui); WinISD/Basta!.

## 1.3 Bandpass (4th / 6th / 8th order) — ★★ · Cx 4 · ✅
**Model / math & refs.** Driver between two chambers, output through port(s). 4th = sealed rear × ported front (12 dB/oct edges). 6th = both chambers ported (two Helmholtz tunings, steeper). 8th = two coupled BP sections (very peaky, rare). Design from sealed-chamber Qtc + vented-chamber Fb; ripple↔bandwidth↔efficiency trade (Keele/Bullock bandpass tables). (QSC "Understanding Closed/Vented/Bandpass".)
**Watch out for.** No single closed-form alignment; it's a 2-parameter optimization with ripple. Efficiency-bandwidth is fundamental (narrower = louder). Chamber/port resonances create **out-of-band spikes** the lumped model misses (real BP needs filtering). 6th/8th are alignment-sensitive. Report center freq + −3 dB edges.
**Reference implementations.** `be1/qspeakers`; WinISD (4th/6th).

## 1.4 Passive radiator (drone cone) — ★★ · Cx 4 · ✅
**Model / math & refs.** Vented box with port air mass replaced by a compliant mass-loaded diaphragm (`Mmp`, `Cmp`). `Fb = 1/(2π√(Cmp·Mmp))`. Adds an extra **transmission zero (notch)** at the PR free-air resonance → steeper skirt (~5th-order-like). Key ratio δ = Cmp/Cas. (Small Passive-Radiator I–III, 1974.)
**Watch out for.** Notch sits just below Fb; undersized/heavy PR pushes notch into passband → use larger/lighter cone + tuning mass. PR compliance is a finite series element (not an ideal massless port) → don't reuse port math directly. PR displacement Vd must exceed driver's. Model PR losses Qmp (damps notch). Cmp drifts with temp/age.
**Reference implementations.** `be1/qspeakers`; WinISD/Basta!.

## 1.5 Alignment tables + auto-tune (QB3/SBB4/BB4/B4/C4/SC4/EBS/Bessel) — ★★★ · Cx 3 · ✅
**Model / math & refs.** Names of the target denominator polynomial; auto-tune = solve `{Vb,Fb}` placing the driver's `{Qts,Fs,Vas}` onto the chosen alignment. B4 Butterworth (needs Qts≈0.383 lossless); QB3 for lower Qts (smaller box, common DIY); C4 Chebyshev for higher Qts (bigger, peaky); SBB4/BB4 (Bullock, Fb≈Fs family); EBS (bigger box, lower tuning, deeper −3 dB); Bessel (flat group delay). (Thiele's 9 alignments; Bullock/Benson tables; Dickason.)
**Watch out for.** Charts assume **lossless** box; real Ql (~7) shifts ideal Qts up → use Bullock lossy tables. Real Qts rarely lands on a textbook alignment → snap to nearest and report mismatch. Sealed "alignments" are 2nd-order (B2/C2), a different family. Bessel trades amplitude flatness for phase. The numeric alignment coefficients are public facts.
**Reference implementations.** `be1/qspeakers` (has "optimize"); `jmpolom/Vented`.

## 1.6 Radiation space / half-space / quarter-space — ★★★ · Cx 2 (space factor) → 4 (full diffraction) · ✅
**Model / math & refs.** Reference SPL/LF-gain depend on radiating solid angle. Each halving → **+3 dB efficiency / +6 dB pressure** at long wavelengths. 4π free, 2π baffle/floor, π corner, π/2 tri-corner. `η₀ = (4π²/c³)·Fs³Vas/Qes`; half-space sensitivity `= 112.2 + 10log₁₀η₀` dB @2.83V/1m. Baffle-step transition ≈ `f ≈ c/(πW)` spread ~2 octaves. (Beranek; Raczynski Bodzio papers; sound-au.com/bafflestep.htm.)
**Watch out for.** Datasheet **sensitivity is usually 2π** — compute 4π and you'll read ~6 dB low; state your reference. Baffle step is a smooth ~6 dB transition, not a step, and rides with diffraction ripple (needs baffle dims). Room/cabin gain adds further LF boost. Doubling radiation resistance only raises efficiency while mechanical impedance dominates.
**Reference implementations.** Raczynski Bodzio Software PDFs; VituixCAD diffraction; `python-acoustics` for helpers.

## 1.7 Electrical impedance (magnitude + phase) — ★★★ · Cx 2–3 · ✅
**Model / math & refs.** `Z(jω) = Re + jωLe + Zmot`, `Zmot = (Bl)²·Ymech_acoustic`. Sealed: single peak at Fc, height ~`Re(1+Qms/Qes)`. Vented: **double peak** straddling a saddle near Fb whose depth is set by Ql. Use semi-inductance `Le(jω)=K(jω)ⁿ`, n≈0.6–0.8, not plain jωLe. (Small; Leach lossy-inductance.)
**Watch out for.** Real Z rises like ω^0.6–0.8, not ω¹; pure jωLe diverges and misplaces HF phase. Vented saddle ≈ Fb (tuning check) but its depth needs the loss model. Peak height sensitive to Qms/Qes. Phase must wrap correctly (0 at peaks/saddle). Report Zmin (amp load), not Re. Eddy losses lower the peak.
**Reference implementations.** `kbasaran/Speaker-Calculator`; `mincequi/qLouder`, `dechamps/LoudspeakerExplorer` (measured); WinISD/Basta!.

## 1.8 Cone excursion vs frequency — ★★★ · Cx 2 (sealed) → 3 (vented) · ✅
**Model / math & refs.** Peak displacement `X(f)` from the box volume-velocity transfer. Sealed: rises as f drops, flattens below Fc; `X ∝ P/(Sd·f²)` in mass region. Vented: **deep minimum at Fb** (port unloads cone), rises both sides, and **below Fb excursion shoots up** (needs infrasonic HP filter). `Vd = Sd·Xmax` (one-way). (Small large-signal analyses.)
**Watch out for.** Sub-Fb runaway is the safety headline — max-SPL must be checked there. Use one-way linear Xmax, never peak-to-peak. `X ∝ 1/f²` → 4×/octave down. Sd = effective piston area (to surround midpoint). For bandpass, excursion shaped by both chambers.
**Reference implementations.** `kbasaran/Speaker-Calculator`; `jmpolom/Vented`; WinISD cone-excursion/max-SPL graphs.

## 1.9 Port / vent air velocity + chuffing (Mach) — ★★★ · Cx 2 → 3 (flare) · ✅
**Model / math & refs.** `v_port = (Sd·Xpeak·2πf)/Sv` (continuity), peaking near Fb; express as Mach fraction `v/c`, c≈343. Chuffing = turbulence/compression at high velocity.
**Watch out for.** No hard limit; heuristics depend on **port flare**: HiFi/low-noise ≤~17 m/s (~5% Mach); common ~20–25 m/s; SPL/car 35–40+. Report velocity as a **curve** and flag the max; scales with drive level. Straight sharp ports chuff far earlier than flared. Too-large a port → impractically long + pipe resonance. Mach fraction is the meaningful normalization.
**Reference implementations.** WinISD air-velocity graph; `vasilenkoalexey/Boxed`, `jmpolom/Vented` for the volume velocity.

---

# 2. Distributed acoustics (transmission lines, horns, the general engine)

> `p`=pressure, `U`=volume velocity, `S`=area, `Z₀=ρc/S`, `k=ω/c`. State vector `[p,U]ᵀ`. System = cascade/network of 1-D Webster/waveguide elements + lumped driver + radiation terminations.
> Common refs: **Webster** (1919); **Salmon** (JASA 1946); **Kolbrek** "Horn Theory: An Introduction" (audioXpress 2008, grc.com/acoustics PDF); **Leach** "CAD with SPICE" (JAES 39(12), 1991); **Augspurger** MLTL papers; **Martin J. King** worksheets (quarter-wave.com).

## 2.1 Transmission line (straight & tapered) — ★★ · Cx 2 · ✅
**Model / math & refs.** Quarter-wave resonator, `f₁ ≈ c/(4·Leff)`. Uniform segment ABCD: `[[cos(kL), jZ₀sin(kL)],[j sin(kL)/Z₀, cos(kL)]]`. With loss replace `jk→γ=α+jβ`: use `cosh(γL)`, `Z₀sinh(γL)`, `sinh(γL)/Z₀`. Taper = segment into N uniform slices, multiply matrices.
**Watch out for.** Input impedance blows up/zeros at pipe resonances (kL=nπ/2) → near-singularities; work in admittance where possible. Segment count needs convergence testing. Stuffing loss α is frequency-dependent and empirical (Augspurger/King, or flow-resistivity) and dominates ripple structure. Mouth **termination impedance** with end-correction (≈0.6a flanged, ≈0.3a unflanged) matters; rigid/free ends are wrong.
**Reference implementations.** Hornresp (freeware); Martin J. King MathCad; transmissionlinespeakers.com "Simulation Model"; `python-acoustics` (Delany–Bazley/Attenborough porous loss).

## 2.2 MLTL / TQWT / quarter-wave pipes — ★★ · Cx 3 · ✅
**Model / math & refs.** TQWT = tapered quarter-wave tube. MLTL adds a terminal port (mass `Ma = ρ(Lp+endcorr)/Sp`) in series with line output → lowers tuning below c/4L for a shorter cabinet. `Z_term = jωMa + Z_rad` cascaded onto the line chain. (Augspurger; King.)
**Watch out for.** Port mass interacts with line modes — keep the full distributed line, don't lump. Driver **position along the line** nulls modes (needs an internal tap point / T-junction, not just end-driving). End correction significant at low MLTL tunings. Stuffing placement changes results qualitatively.
**Reference implementations.** Martin J. King worksheets; Augspurger TLwrx (validation oracle); Hornresp.

## 2.3 Horn profiles (conical, exp, hypex, tractrix, Le Cléac'h, OS) — ★★ · Cx 4–5 · ✅
**Model / math & refs.** Webster: `ψ'' + (S'/S)ψ' + k²ψ = 0`. Conical `S=St(1+x/x₀)²`; Exponential `S=St·e^{mx}`, `fc=mc/4π`, `β=√(k²−(m/2)²)`; Hypex (Salmon) `S=St(cosh(x/x₀)+T·sinh(x/x₀))²`, T=0 catenoidal→1 exponential→∞ conical; Tractrix (Voigt, spherical wavefront); Le Cléac'h (iterative, numerically generated); OS waveguide (Geddes) `r(x)=√(rt²+(x tanθ)²)`. (Kolbrek; Beranek; Geddes *Audio Transducers* ch.6; Batík at-horns.eu.)
**Watch out for.** Interpolate **area, not radius** (or be explicit). Below cutoff exp/hypex are evanescent (imaginary β) → cosh/sinh forms, keep segments short to avoid overflow. **Mouth size vs cutoff**: a horn must be acoustically large at fc (mouth circumference ≳ λc) or it unloads and ripples — flag undersized mouths. Conical/OS have no analytic cutoff → radiation-impedance termination dominates. Le Cléac'h/OS need numerical generation + smooth termination.
**Reference implementations.** Ath4/ATH (at-horns.eu) profile generator; Kolbrek PDFs; Hornresp; bempp-cl for full-field validation.

## 2.4 Multi-segment concatenated horns (mixed profiles) — ★ · Cx 3 · ✅
**Model / math & refs.** Cascade of heterogeneous segments; `M_total = M₁·M₂·…·M_N` carrying `[p,U]`. Segment continuous profiles into many short elements (Locanthi horn-analog). (Hornresp multi-segment S1–S4; Kolbrek.)
**Watch out for.** **Flare continuity at joints:** match `S` and ideally `dS/dx` or you inject a reflection → spurious ripple (see 2.7). Consistent matrix ordering/orientation (throat→mouth). Accumulated round-off at high k → prefer stable cosh/sinh forms, avoid explicit inverses. Composite effective cutoff ≠ any single segment's. Convergence-test refinement against the analytic single-profile result.
**Reference implementations.** Hornresp (reference); AkAbak Duct/Waveguide chains; `python-acoustics` primitives.

## 2.5 Node-based ABCD / two-port network solver (the general engine) — ★★ (enabler) · Cx 5 · ✅
**Model / math & refs.** The unifying engine behind AkAbak/Hornresp. Nodes = acoustic pressures; branches = two-ports (driver electro-mechano-acoustic gyrator from T/S, chambers `Ca=V/(ρc²)`, ducts/ports, horn segments, radiation loads). Series = ABCD product; parallel/junctions combine as admittances (convert ABCD↔Y at nodes); solve per frequency by nodal KCL `Σ U_into_node = 0`, sweep ω. ABCD→Y: `Y = (1/B)[[D, −(AD−BC)], [−1, A]]`. (Leach JAES 1991; Beranek & Mellow.)
**Watch out for.** Pick one analogy (impedance: p↔V, U↔I) and never mix with mobility mid-network. Characteristic-impedance normalization across electrical→mechanical→acoustic (Sd², Bl² scaling) is the classic bug. Ill-conditioning at resonances and near DC (B≈0 in the 1/B) — guard it, use Z-form where B is small. Radiation/coupling loads are frequency-dependent complex impedances. 1-D breaks where dimensions ≳ λ — bound validity. Place loss elements at physically correct nodes.
**Reference implementations.** AkAbak / AkAbak 3 / ABEC3; Hornresp; Leach SPICE models (ngspice as reference solver); **os-lem** (Python LEM kernel — your validation oracle / porting base); `python-acoustics` primitives.

## 2.6 Tapped & back-loaded horn — ★ · Cx 4 · ✅
**Model / math & refs.** §2.5 network with the driver coupled to the line at **two** points. Tapped horn (Danley): both driver faces feed one folded horn at two nodes; path difference cancels the first null. Back-loaded: front radiates direct, rear feeds a folded horn via a rear chamber; direct+mouth outputs sum with phase offset. (Danley "Tapped/Synergy Horn Explained"; quarter-wave.com BLH article.)
**Watch out for.** **Phase summation of two outputs** is everything — track absolute phase/path length of both faces; a sign error turns reinforcement into cancellation. Driver acoustic-center offset + chamber compliances shift the notch. Retain the standing-wave mode (no over-lumping). Coherent (complex) summation, not power sum. Needs two-tap node connectivity, not an end-driven chain.
**Reference implementations.** Hornresp (dedicated TH/BLH modes); AkAbak; quarter-wave.com worksheets.

## 2.7 Throat adapter / flare-continuity — ★ · Cx 2–3 · ✅
**Model / math & refs.** Bridges driver exit to horn throat; generally the problem of keeping `S(x)` and `dS/dx` continuous across every joint. Good adapter = short matched flare (exp/conical) matching S and slope at both ends. (Kolbrek; Batík OS-SE/R-OSSE termination work.)
**Watch out for.** **Non-physical flare discontinuities:** abrupt dS/dx (even with continuous S) reflects HF energy → ripple; slope-match, not just area-match. Area steps act like an acoustic transformer/loss — warn on |ΔS| at joints. Compression-driver front cavity/phase plug adds lumped mass/compliance ahead of the throat. Interpolation basis (area vs radius) must be consistent. Adapter benefit is band-limited (transparent at low f).
**Reference implementations.** Ath4/ATH (published continuity formulas); Hornresp throat adapter + join warnings; Kolbrek.

---

# 3. Driver & electrical

> Standard T/S notation. Refs: **Small** direct-radiator analysis (JAES 1972); **Thorborg & Futtrup** semi-inductance (JAES 59(9), 2011); **Leach** voice-coil inductance (JAES 50(6), 2002); **Mills & Hawksford** current drive (JAES 1989); **RBJ Audio EQ Cookbook** (w3.org/TR/audio-eq-cookbook).

## 3.1 Multi-driver (series/parallel/isobaric/N-slave) — ★★★ · Cx 2 · ✅
**Model / math & refs.** Series N: `Re,Le,Bl ×N` → motor factor `Bl²/Re ×N`. Parallel N: `Re,Le /N`, `Bl` same → `Bl²/Re ×N`. Both: `Mms ×N`, `Cms /N` → **Fs, Qes, Qms, Qts unchanged**. Array: `Sd,Vas ×N`, η₀ rises with N. Isobaric: two motors, **one Sd**; `Mms ×2`, `Cms /2` → **Fs unchanged, Vas halves** (Sd NOT doubled). SPL@2.83V: parallel-double +3 dB, series-double −3 dB.
**Watch out for.** Don't scale Sd for isobaric (classic error). Series raises Le linearly (worse HF roll-off, affects crossover). Parallel drops nominal impedance (2×8Ω=4Ω). Qts invariant only for identical drivers — mixed drivers need full superposition. Mutual coupling / mounting geometry changes summed SPL beyond the lumped model.
**Reference implementations.** VituixCAD (≤6-way, series/parallel/isobaric); Speakerbench box module.

## 3.2 Amplifier source model (Rg, Eg, current drive) — ★★ · Cx 2 · ✅
**Model / math & refs.** Thévenin `Eg` behind `Rg`; driver sees `Rg+Re+jωLe+Zmot`. Voltage drive `Rg→0`; current drive `Rg→∞`. `Eg = √(P·R_nom)` (1W/8Ω=2.83V). 2.83V/1m is the IEC reference (=1W only at 8Ω). (Mills & Hawksford; ESP sound-au.com/articles/current-drive.htm.)
**Watch out for.** Current drive **removes electrical damping**: `Qes→∞`, total Q collapses to Qms, big Fs peak — needs a pole-shifter/feedback/RLC to tame (don't present as free). Finite `Rg>0` raises Qes: `Qes' = Qes(Re+Rg)/Re` — fold Rg into every alignment calc. Passive crossovers designed for a voltage source misbehave under high Rg.
**Reference implementations.** ESP project pages; any nodal RLC solver / scipy.signal for the divider.

## 3.3 Zobel / conjugate / series notch — ★★ · Cx 2 · ✅
**Model / math & refs.** Zobel (R∥C across driver): `Rc=Re` (1.0–1.25 Re), `Cc=Le/Re²` — flattens rising |Z|. Fs-peak trap: parallel R-L-C across driver, `f₀=1/(2π√(LC))`, `R=Res`, `Q=R√(C/L)`. Response notch (breakup) = series L∥C in signal path (different topology). (Leach Zobel note.)
**Watch out for.** `Cc=Le/Re²` assumes ideal jωLe; real semi-inductance (n≈0.6–0.8) → textbook Zobel over-corrects HF. Fs trap uses large expensive parts, rarely worth it. Zobel dissipates power; only helps if the crossover truly needs a resistive load.
**Reference implementations.** XSim (live R-L-C solver); VituixCAD calculator; scipy.signal.

## 3.4 Passive crossover synthesis (BW/LR/Bessel/Cheby) — ★★ · Cx 4 · ✅
**Model / math & refs.** Component = `k·R/(2πfc)` (series L), `k/(2πfc·R)` (shunt C). BW1: `L=R/(2πfc)`, `C=1/(2πfc R)`. BW2 (Q=0.707): `L=0.2251R/fc`, `C=0.1125/(fc·R)`. LR2 (Q=0.5): `L=R/(πfc)`, `C=1/(4πfc R)` + invert one driver. LR4 = two cascaded BW2. (Linkwitz JAES 1976; ESP sound-au.com/lr-passive.htm.)
**Watch out for.** Closed forms assume **flat resistive load** — real drivers have rising Le + Fs peak → wrong acoustic slope; include actual Z (add Zobel) or iterate. Acoustic target order = electrical + driver roll-off + baffle step + phase/offset — LR flat-sum holds only for the *acoustic* transfer function. Odd-order gives quadrature/tilted lobe; verify acoustic-center Z-offset (delay).
**Reference implementations.** XSim, VituixCAD (full synthesis + optimization); scipy.signal (`butter`/`bessel`/`cheby1`).

## 3.5 Active filters / PEQ / delay / bi-amp — ★★ · Cx 3 · ✅
**Model / math & refs.** Per-way filter (unloaded, resistive-load caveat gone) + PEQ + gain + delay, then acoustic sum. RBJ peaking biquad `H(s)=(s²+s(A/Q)ω₀+ω₀²)/(s²+s/(Aω₀)+ω₀²)`, `A=10^(dB/40)`; stay in s-domain for prediction. Delay `e^{−jωτ}`, `τ=Δx/c`. System `= Σ Hway·Hdriver·e^{−jωτ_way}`. (RBJ cookbook; Linkwitz.)
**Watch out for.** Active LR/BW summing still needs correct **polarity + delay** (aligned acoustic centers) or you get lobing. PEQ boost costs excursion headroom — model Xmax. BLT frequency warping only matters if emulating a specific digital device. Bi-amp per-way sensitivities must be explicit.
**Reference implementations.** endolith RBJ biquad gist; scipy.signal; CamillaDSP (algorithm reference); REW EQ math.

## 3.6 Lossy / semi-inductance Le (Wright/Leach/Thorborg/LR-2) — ★ · Cx 4 · ✅
**Model / math & refs.** Simple jωLe overestimates HF tail. Wright: `Re{Z_L}=K_R ω^a`, `Im{Z_L}=K_X ω^b` (a,b<1). Leach: `Z_L=Ke(jω)ⁿ`, n≈0.6–0.8. Vanderkooy semi-inductor `Z=Ks√(jω)`. Thorborg-Futtrup L2RK (5-param: Le + R₂∥L₂ + semi-inductor K). Le(x) for large-signal. (Leach vcinduc.pdf; Thorborg cfuttrup.com/Thorborg_31.pdf.)
**Watch out for.** Fitting jωLe to LF then extrapolating gives big HF error + wrong Zobel. Exponent n is neither 1 nor 0.5 universally — fit it. Le(x) is large-signal (needed only for distortion/current-drive claims). Shorting rings change n and R₂. The √(jω) semi-inductor isn't exactly a finite RLC — approximate with an R-L ladder.
**Reference implementations.** Speakerbench (Thorborg-Futtrup in-browser); scipy.optimize for the fit.

## 3.7 T/S derivation from measured impedance (added-mass/volume) — ★ · Cx 4 · ✅
**Model / math & refs.** From free-air sweep: fit Re, peak at Fs gives Res, −3 dB points give `Qms=(Fs/(f2−f1))√(Res/Re)`, `Qes=Qms·Re/(Res−Re)`. Added-mass: `Mms=Δm/((Fs/Fs')²−1)`, `Cms=1/((2πFs)²Mms)`, `Vas=ρc²Sd²Cms`, `Bl=√(2πFs·Mms·Re/Qes)`. Added-volume: `Vas=Vb[(Fc·Qtc)/(Fs·Qts)−1]`. Dual added-mass (Candy/Futtrup) most accurate. (Small 1972; Novak; REW/ARTA docs.)
**Watch out for.** Vas depends on Sd (big error source — ~⅓ surround). Δm large enough but stuck symmetrically. Strip semi-inductance before the −3 dB Q fit or Qms/Bl skew. Sealed-box method needs airtight box, Vb≈Vas; leakage lowers Qtc. Re drifts with coil heating — measure Re cold each sweep.
**Reference implementations.** `srjh/speaker-driver-parameters`, `makerportal/thiele_small_parameters`; REW/ARTA (measurement); scipy.optimize.curve_fit.

---

# 4. Arrays & spatial ("how the stack responds in space")

> `p`=complex pressure, `k=ω/c`, c≈343, `r`=source→point distance.
> Refs: **Beranek & Mellow**; **Kolbrek & Dunker** *High Quality Horn Loudspeaker Systems*; **Merlijn van Veen** sub-array articles; **ISO 9613-1** (air absorption); L-Acoustics WST paper.

## 4.1 Complex point-source superposition — ★★★ · Cx 2 · ✅
**Model / math & refs.** `p(x,ω) = Σ_i (A_i/r_i)·e^{−jk r_i}·e^{jφ_i}·D_i(θ_i,ω)`, `r_i=|x−x_i|`, delay→phase `φ_i=−ω t_i`. `1/r` inverse-distance, `e^{−jkr}` propagation phase, `D_i` optional directivity. dB `L=20log₁₀(|p|/p_ref)`.
**Watch out for.** **Coherent (complex) sum** only for correlated sources; uncorrelated → power sum `Σ|p_i|²`. **Never sum in dB.** Monopole assumption valid only at LF/long range — over-predicts HF off-axis coherence without `D_i`. Define `A_i` at a stated `r_ref` (usually 1 m); clamp `r_i→0`. Cost `O(grid×freq×src)` — precompute `r_i`, vectorize, use typed arrays/Workers.
**Reference implementations.** `sfstoolbox/sfs-python` (`sfs.fd.source.point`); `LCAV/pyroomacoustics` (monopole/image-source).

## 4.2 Sub-arrays (endfire/gradient-cardioid/broadside/arc/steer) — ★★★ · Cx 3 · ✅
**Model / math & refs.** Special cases of 4.1 with prescribed positions+delays+polarities (`t=d/c` transit). Endfire: `t_i=i·d/c` (e.g. 1 m→2.9 ms/step). Gradient cardioid: rear box **polarity inverted** + delayed ≈`1.5·d/c` (e.g. 0.8 m → ~4.65 ms). Broadside: `t_i=0` (grating lobes by d/λ). Arc: position + radial aim. Delay-steer: `t_i=(i·d·sinθ)/c`. (Merlijn van Veen; EV Subwoofer Arrays white paper.)
**Watch out for.** Gradient costs ~6 dB forward vs endfire. Cardioid rear delay is **frequency-sensitive** — show pattern across a band, not one freq. **Grating lobes** when `d>λ/2` (at 100 Hz λ/2≈1.7 m). Polarity is a **±sign on A_i** (broadband), not a 180° single-freq phase. Delay-steering loses gain/broadens off-axis (≠ physical aim).
**Reference implementations.** Merlijn van Veen S.A.D. calculator (validation oracle); sfs-python/pyroomacoustics primitives.

## 4.3 Coverage / SPL mapping over a plane — ★★ · Cx 3 · ✅
**Model / math & refs.** Evaluate 4.1 on a 2-D grid. Single-freq map (one k) or **band map** `L=10log₁₀⟨|p|²⟩` over 1/3-oct set. Overlay target window (±3 dB), compute uniformity over seating polygon. Add 4.5 distance/absorption for absolute SPL. (Meyer MAPP / d&b ArrayCalc methodology.)
**Watch out for.** **Grid resolution vs spatial aliasing** — fringes ~λ; sample ≥2–4 pts/λ (10 kHz→λ≈34 mm, expensive → prefer band-averaged HF). **Single-freq maps mislead** — a null fills at adjacent freqs; always offer band/broadband. Label weighting (flat/A) and that it's direct-field only (not a venue prediction). Cost scales grid×freq×src.
**Reference implementations.** `sfs.fd.synthesize` + plotting; pyroomacoustics grid FR.

## 4.4 Comb filtering / interference — ★★ · Cx 2 · ✅
**Model / math & refs.** Footprint of the 4.1 sum. Two coherent arrivals, `Δd=|r₁−r₂|`, `Δt=Δd/c`: peaks `f_peak,n = n·c/Δd`, notches `f_notch,n=(2n−1)c/(2Δd)`; notch spacing `c/Δd`. Depth set by level difference (equal→−∞ null, >~10 dB offset→negligible). Falls out of `|p₁+p₂|`.
**Watch out for.** Only correct with coherent complex sum (power sum erases it). Depth needs matched levels — include 1/r + absorption differences. Sample enough frequency points (large Δd → closely spaced notches; 3.4 m→100 Hz comb). Real boxes decorrelate at HF (idealized combs are worst-case).
**Reference implementations.** sfs-python/pyroomacoustics sums; Merlijn van Veen visualizers.

## 4.5 Distance loss + ISO 9613-1 air absorption — ★★ · Cx 3 · ✅
**Model / math & refs.** `L(r)=L_ref − 20log₁₀(r/r_ref) − α(f,T,h,p)·(r−r_ref)`. Spreading −6 dB/doubling. α (dB/m) from ISO 9613-1:1993 with O₂/N₂ relaxation frequencies `f_rO`, `f_rN` (functions of pressure, temp, molar water-vapor `h`). Strongly frequency-dependent (~0.1 dB/m at kHz, rising fast).
**Watch out for.** Valid 50 Hz–10 kHz, −20…+50 °C, 10–100% RH, ~1 atm — flag outside. Humidity enters as **molar water-vapor `h`(%)**, derived from RH+T+p (saturation pressure) — common bug is feeding RH directly. Apply on absolute r consistent with r_ref. Compute α per band. (Part 1 = atmospheric only; ground = Part 2, see 4.7.)
**Reference implementations.** `python-acoustics` `standards/iso_9613_1_1993.py` + `atmosphere.py`; `Universite-Gustave-Eiffel/acoustic-toolbox`.

## 4.6 Line-array splay (basic) — ★ · Cx 4 · ✅
**Model / math & refs.** N directional sources along a (curved) line, each rotated by cumulative splay: `aim_i = aim_0 + Σ_{j≤i} splay_j`. Evaluate 4.1 with `D_i(θ−aim_i)`. WST coupling: coherent wavefront when inter-element step `<λ/2` + coverage/curvature criteria (Fresnel). (Urban/Heil/Bauman WST paper; L-Acoustics.)
**Watch out for.** Far-field-per-element assumption — near-field observers see individual boxes. Point-source-with-directivity is basic; above the WST λ/2 step, inter-element combing appears — don't over-sell HF smoothness. Splay must accumulate (each box's frame rotates). Show SPL-vs-throw, not just geometry.
**Reference implementations.** No open coverage engine (ArrayCalc/MAPP/EASE Focus proprietary); build on sfs-python/pyroomacoustics directional sums; WST L-Acoustics AES PDF for the math.

## 4.7 Ground-plane / half-space & boundary interference — ★★ · Cx 4 · ✅
**Model / math & refs.** **Image-source method:** add a mirror source per rigid boundary. `p=Σ_i (A_i/r_i)e^{−jk r_i} + Σ_i (R·A_i/r_i')e^{−jk r_i'}`. Rigid ground R≈1 (+6 dB half-space) + comb vs flying height; finite-impedance ground → complex `R(θ,f)`. Ground-bounce notch via 4.4 with Δd = r_i'−r_i. (Beranek & Mellow; ISO 9613-2; pyroomacoustics image model.)
**Watch out for.** R=1 only for hard infinite plane — grass/audience is `|R|<1`, freq/angle dependent (over-predicts +6 dB and null depth otherwise). Half-space normalization: +6 dB can double-count if A_i measured in half-space. Each boundary spawns images (2 planes→3, corner→7) — multiplies source count. Assumes specular/infinite/flat (weak at HF/small surfaces). Sample vertical grid finely (elevation combing).
**Reference implementations.** `LCAV/pyroomacoustics` image-source; sfs-python half-space; `python-acoustics` reflection/ground-impedance.

---

# 5. Directivity & diffraction

> **Baseline caveat:** boxdex has no measured polar/balloon data — directivity must be **synthesized** from analytic radiator models (fine for baffle/boundary/piston/DI/visualizer) or **imported** (balloon/SOFA). BEM is the only first-principles route to real directivity and is offline-heavy.

## 5.1 Baffle step + edge diffraction — ★★ · Cx 2 · ✅
**Model / math & refs.** Finite baffle transitions 4π→2π with diffraction ripple; step ≈ `f≈c/(πW)`. Models by fidelity: Olson shape data; **Vanderkooy** secondary-source ("A Simple Theory of Cabinet Edge Diffraction," JAES 39(12), 1991) — each edge re-radiates, `p=p_direct+Σp_edge`; Bagby point-source summation. (Leach notes.)
**Watch out for.** Approximations, not full wave — ignore depth, roundovers, rear radiation (real cabinets need BEM). **Driver offset** from center breaks up ripple (desirable); sum per-edge/corner path lengths, not one width. Usually treated minimum-phase (mag→phase via Hilbert). Don't double-count baffle-step gain with boundary loading (5.2) — keep reference solid angle explicit.
**Reference implementations.** The Edge (tolvan.com); Basta!; VituixCAD diffraction tool (all freeware, behaviour reference; Vanderkooy/Bagby math is published).

## 5.2 Boundary loading (floor/wall/corner, Allison) — ★★ · Cx 2 · ✅
**Model / math & refs.** Image-source sum: `p=Σ_i (A·D_i/r_i)e^{−jk r_i}` over source + images (1 boundary→1 image, wall+floor→3, corner→7). Solid-angle loading +6 dB per halving. **Allison effect** (JAES 1974): cancellation dip near `f_dip≈c/(4d)`, d=driver-to-boundary — the "mid-bass suckout." (Beranek.)
**Watch out for.** Assumes rigid/infinite/reflecting — add `R(f)<1` per image or dips are unrealistically deep. Correct solid-angle reference to avoid double-count with 5.1. Comb spacing depends on all three distances. Coherent sum only (power sum hides the dip).
**Reference implementations.** VituixCAD, The Edge (freeware); `pyroomacoustics` image sources (algorithm reference).

## 5.3 Piston on/off-axis directivity — ★★ · Cx 1 · ✅
**Model / math & refs.** Rigid circular piston in infinite baffle, far field: `D(θ)=2J₁(ka sinθ)/(ka sinθ)`, `k=2π/λ`, a=radius, D(0)=1. Off-axis = on-axis × 20log₁₀|D(θ)|. Single param `ka`: ka≲1 near-omni, beaming ~ka≈2–3, first null ka sinθ≈3.83. Non-piston geometry → Rayleigh integral. (Beranek & Mellow; Kinsler & Frey.)
**Watch out for.** Far-field + infinite-baffle only — wrong in near field (r≲a²/λ) and ignores cabinet (that's 5.1). J₁ needs a stable impl + sinθ→0 limit (D→1). Real cones aren't rigid pistons at HF (breakup) — over-predicts smoothness. Choose effective radiating radius (nominal diameter over-beams).
**Reference implementations.** `SheetJS/bessel` (npm, J₁); ~30 lines of TS.

## 5.4 Polar maps + DI / beamwidth — ★★ · Cx 3 · ✅
**Model / math & refs.** Polar map = `SPL(θ,f)` normalized to on-axis, per plane, from 5.3. `Q(f)=4π/∫∫|D|²dΩ`, `DI=10log₁₀Q`. Beamwidth = angle between −6 dB points (state −3 vs −6). CEA-2034 "Spinorama" is the modern presentation (on-axis, listening window, early reflections, sound power, DI). (Beranek & Mellow.)
**Watch out for.** DI needs a **full-sphere integral** — from H+V polars only it's approximate; state "estimated". Document integration solid angle (2π vs 4π → ~3 dB shift). Oversample θ near beaming freqs. Normalization reference (on-axis vs listening-window) changes the picture.
**Reference implementations.** `pierreaubert/spinorama` (CEA-2034 math + plot conventions); VituixCAD polar/DI/CEA-2034.

## 5.5 Balloon directivity + GLL/CLF/SOFA — ★ · Cx 4 · ⚠️ import-only · Data-gated
**Model / math & refs.** Balloon = `SPL(θ,φ,f)` on a sphere; spherical-harmonic `p=Σ C_nm(f)Y_n^m(θ,φ)`. Formats: **CLF** (CF1 10°/octave, CF2 5°/⅓-oct); **GLL** (AFMG proprietary, complex, EASE); **SOFA/AES69** (open, netCDF/HDF5; SOFA 2.1 adds `FreeFieldDirectivityTF` + spherical-harmonic directivity — the open target). (sofaconventions.org; AFMG GLL docs; clfgroup.org.)
**Watch out for.** **Data-gated** — no measured balloons; only import (CLF/SOFA) or synthesize approximate from 5.3. Resolution/interpolation (5°/10° grids alias at HF; slerp/SH beats bilinear near poles). Coordinate conventions differ (azimuth/elevation sign, pole, front, mag-vs-complex) → wrong convention silently mirrors. GLL is closed/binary. SOFA is HDF5 → needs a WASM HDF5 reader.
**Reference implementations.** SOFA readers `pyfar/sofar`, `andresperezEUT/pysofaconventions`; browser HDF5 `usnistgov/jsfive` or `h5wasm`. CLF is a documented spec, simpler to parse.

## 5.6 BEM radiation / directivity — ★ · Cx 5 · ❌ offline
**Model / math & refs.** Exterior Helmholtz `∇²p+k²p=0` via Kirchhoff–Helmholtz boundary integral; use **Burton–Miller** (or CHIEF) to avoid fictitious eigenfrequencies. Reference-grade: captures cabinet shape, diffraction, horn loading exactly within mesh limits. (openBEM; Bempp handbook; Mesh2HRTF/NumCalc.)
**Watch out for.** Mesh ≥~6 elements/λ → element count grows as f²; dense complex matrix `O(N²)` assemble, `O(N³)` factor (FMM → ~O(N log N) but huge complexity). **Not client-side at HF** — a full-band cabinet solve is a desktop/server/HPC job (minutes–hours). Treat as **offline precompute → import balloon/SOFA**. Mesh quality (watertight, non-degenerate) dominates accuracy. Per-frequency → sweep multiplies cost.
**Reference implementations.** `bempp/bempp-cl` (Python, offline); openBEM (MATLAB); `Any2HRTF/Mesh2HRTF` (Burton–Miller + ML-FMM, outputs SOFA); ABEC3/AkAbak (behaviour reference).

## 5.7 2D wavefront / propagation visualizer — ★ · Cx 3 · ✅ (qualitative)
**Model / math & refs.** 2-D wave equation `∂²p/∂t²=c²∇²p` via explicit FDTD leapfrog `p^{n+1}=2p^n−p^{n−1}+(cΔt/Δx)²∇²p^n`. CFL: `cΔt/Δx ≤ 1/√2` (2D). Absorbing boundary (damping layer/PML); rigid baffle/cabinet as Neumann cells. Client-side friendly (Canvas/WebGL/WebGPU).
**Watch out for.** **2D≠3D**: cylindrical spreading (1/√r) not spherical (1/r) → absolute levels/DI not quantitative — visual/qualitative only. Numerical dispersion (HF travels wrong speed) → ≥~10 pts/shortest λ. CFL violation → blow-up (clamp Δt). Damp domain edges (else reflections mimic diffraction). Grid size vs frame rate is the budget.
**Reference implementations.** Paul Falstad Ripple Tank (`falstad.com/ripple`, JS/Java ports); many WebGL wave-equation demos; FDTD is textbook, easy from scratch.

---

# 6. Time-domain & large-signal

> Features 6.1–6.4, 6.8 are post-processing of the complex `H(ω)` you already compute (fully client-side). 6.5–6.7 need driver data catalogs often lack.
> Refs: **Oppenheim & Schafer** *DTSP*; **REW** help; **Klippel** large-signal papers/app notes.

## 6.1 Group delay — ★★ · Cx 1 · ✅
**Model / math & refs.** `τ_g(ω)=−dφ/dω=−(1/2π)dφ/df`. **Unwrap phase** first, then central difference `τ_g≈−(φ[k+1]−φ[k−1])/(ω[k+1]−ω[k−1])`. Excess GD = measured − minimum-phase. (REW GD help; Oppenheim.)
**Watch out for.** Unwrap before differentiating (one missed 2π → huge spike). Central difference beats forward/backward; on a log grid divide by actual Δω, not a constant. GD amplifies phase noise — smooth measured data. Report in ms; large/negative near sharp transitions is legitimate. ~5 lines (`unwrap`+`gradient`).
**Reference implementations.** REW; `scipy.signal.group_delay`.

## 6.2 Impulse / step response — ★★ · Cx 2–3 · ✅
**Model / math & refs.** `h(t)=IFFT{H(ω)}`. Real IR needs Hermitian symmetry `H(−ω)=conj(H(ω))`: fill bins 0..N/2, mirror conjugate into N/2+1..N−1, DC & Nyquist real, inverse FFT. Step `s[n]=Σ_{k≤n}h[k]`. `Δt=1/fs`, `T=N·Δt`.
**Watch out for.** Hermitian symmetry mandatory (check max|Im|≈0). Resample log-grid FR onto a **uniform linear** grid 0..fs/2 before IFFT (too coarse → time aliasing/wrap). Hard band-limiting → Gibbs ringing; zero-pad + gentle edge taper. Raw magnitude/arbitrary phase → acausal IR; use min-phase (6.4) for causality. DC bin real (often 0).
**Reference implementations.** `indutny/fft.js` (fwd + inverse); `python-acoustics`.

## 6.3 CSD / waterfall — ★ · Cx 3 · ✅
**Model / math & refs.** From the IR: `CSD(f,t_i)=|FFT{h(t)·w(t−t_i)}|`, sliding gate; surface = mag(dB) vs freq vs time. (REW Waterfall.)
**Watch out for.** Window dominates the look (too abrupt → own decay; too long → no time resolution). LF needs a long enough IR/window. Requires a clean causal IR. Purely visualization — for a synthesized min-phase LTI system the decay is fully determined by |H(ω)| (most meaningful with measured multi-resonance data).
**Reference implementations.** REW; `scipy.signal.stft`/`spectrogram`; build on fft.js.

## 6.4 Minimum-phase reconstruction (Hilbert) — ★★ · Cx 3 · ✅
**Model / math & refs.** For min-phase systems, `φ_min(ω)=−H{ln|H(ω)|}`. Homomorphic recipe: `x=ln|H|` (full symmetric spectrum) → IFFT to real cepstrum → apply causal min-phase window (double positive quefrency, zero negative, keep 0 & Nyquist) → FFT → exp. = SciPy `minimum_phase(method='homomorphic')`. (Oppenheim; REW.)
**Watch out for.** Most real loudspeaker+room responses are **not** min-phase (crossovers, reflections, multi-driver delays) — reconstruction silently discards excess phase (fine for a single sealed/vented driver, wrong for a full system with delays). `ln|H|` blows up at deep nulls — floor magnitude (−80…−100 dB). Needs dense symmetric zero-padded spectrum. DC & Nyquist real.
**Reference implementations.** `scipy.signal.minimum_phase`/`hilbert`; REW; port with fft.js.

## 6.5 Max SPL (Xmax vs Pe crossover) — ★★ · Cx 2 · ✅ · partly data-gated
**Model / math & refs.** Per frequency take the lower of: thermal `SPL_P(f)=SPL_1W1m(f)+10log₁₀(Pe/1W)`; displacement `SPL_x(f)=SPL_ref(f)+20log₁₀(Xmax/x_ref(f))`. Crossover freq = intersection (below = excursion-limited, above = power-limited). (Hornresp Max SPL tool.)
**Watch out for.** **Xmax convention** (one-way peak vs p-p vs RMS; Hornresp uses linear mean-to-peak) — 6 dB errors. Multi-driver: power adds per driver, excursion per driver. Pe is thermal only (interacts with power compression 6.6). Excursion depends on alignment (vented drops it near Fb — curve not monotonic). Xmax/Pe are usually on datasheets (most attainable large-signal feature).
**Reference implementations.** Hornresp; Speakerbench box; `SpeakerSim` (Java).

## 6.6 Power compression / voice-coil thermal — ★ · Cx 2 (math) · ✅ · Data-gated
**Model / math & refs.** `Re(T)=Re0(1+α(T−T0))`, copper α≈0.00393/K. Coil temp `T_vc(t)=T_amb+P_diss·R_th(1−e^{−t/τ})`, `τ=R_th C_th`; real drivers need two RC stages (coil ~s, magnet ~min) + convection. Rising Re → compression. (Klippel voice-coil-temperature know-how; Button AES.)
**Watch out for.** **Data-gated**: R_th, τ, Re0@T0 rarely on consumer datasheets (some pro sheets give τ + compression dB) — label demo constants as illustrative. Feedback: Re↑ → Qes↑, sensitivity↓, alignment shifts (rigorous sim re-solves at elevated Re). Single τ under-predicts steady-state under forced convection. Depends on program crest factor, not just RMS.
**Reference implementations.** Klippel know-how (model reference); `Re(T)`+single-RC ODE is a few lines.

## 6.7 Harmonic distortion (Bl(x)/Cms(x)/Le(x)) — ★ · Cx 5 · ✅ · Data-gated
**Model / math & refs.** Klippel large-signal: displacement-dependent polynomials `Bl(x)=Σb_n x^n`, `Cms(x)`, `Le(x)`. Nonlinear ODEs `u=Re i + d/dt(Le(x)i) + Bl(x)ẋ`, `Bl(x)i=mẍ+Rmsẋ+Kms(x)x+…`. Integrate (RK4/state-space) for a sinusoid, FFT displacement/SPL → HD2/HD3/THD. Bl asymmetry→2nd, Cms & symmetric Bl→3rd, Le(x)→IMD. (Klippel LSI papers.)
**Watch out for.** **Severely data-gated** — the polynomials come only from a Klippel LSI measurement; no catalog has them (toy model needs user-entered coefficients). ODE stiff near resonance/large x — small Δt, discard transient before FFT. Le(x) gives IMD (two-tone), not just HD. Output distortion ≠ displacement distortion (box/radiation re-weight harmonics).
**Reference implementations.** Klippel papers (reference); Hornresp approximate distortion tool.

## 6.8 .wav impulse export — ★ · Cx 1 · ✅
**Model / math & refs.** Write IR (6.2) as RIFF/WAVE: 44-byte header (`RIFF`/`WAVE`/`fmt`/`data`, fs, channels, bits) + PCM. 16-bit: scale [−1,1]→int16 with clipping, or 32-bit float to preserve IR dynamic range. Browser: `ArrayBuffer`/`DataView` + `Blob` download.
**Watch out for.** Normalize (record applied gain) or export float32 to avoid clipping. Sample rate must match the IFFT grid fs (`fs=2·f_max`) or wrong pitch/length. Little-endian; correct byteRate/blockAlign. Mono unless modelling L/R.
**Reference implementations.** `higuma/wav-audio-encoder-js`, `Experience-Monks/wavencoder`, `wavefile` (npm); ~40 lines hand-rolled.

---

# 7. Data formats & interop

**FRD (frequency response):** ASCII, whitespace-delimited, one point/line: `freq(Hz)  SPL(dB)  phase(deg)  [coherence]`. `*` comments, ascending freq. No canonical dialect — parse defensively (skip non-numeric lines, accept 2–3 cols). `.` decimal, spaces only (European `,`/`;` breaks parsers). dB magnitude, reference level not encoded. Phase convention unspecified (sign, min/excess/wrapped). Ref: speakerbench.com/doc/file_docs.html. Read/write: ARTA, REW, VituixCAD, XSim, Speakerbench, tracers.

**ZMA (impedance):** identical layout to FRD but **magnitude is linear ohms, not dB** — a shared parser must be told the unit. Phase often derived (min-phase) or omitted. Some tools export impedance as FRD (dB) — sniff the magnitude range. Read/write: REW, VituixCAD, XSim, LIMP, Speakerbench.

**AkAbak `.aks`:** human-readable network **script** (not tabular), lumped + waveguide elements. No public grammar (proprietary manuals); 2.x vs AkAbak 3 dialects differ; units/angle follow AkAbak conventions. Treat as export-only — **Hornresp can write `.aks`**, the practical path.

**Hornresp record / export:** "Input Record" (copy-paste block) saves inputs as `.aks` or (v24.10+) `.txt`; tagged params (Eg, S1–S4 areas, L12/L23/L34 lengths, Vrc/Lrc, Ang radiation angle, T/S). Schematic export = tab/CSV per-segment geometry. Undocumented, version-dependent field order; locale decimal separator varies; the 512-pt response is NOT in the record (re-simulate from inputs). `Ang` (e.g. 2.0 Pi) materially changes SPL.

**REW `.mdat`:** proprietary **binary** project container — don't parse directly. Interop via **text export** (multi-line header, then freq/SPL/phase columns); also exports impedance, impulse (WAV), filters. Locale/delimiter configurable. Skip header until first numeric line.

**SOFA / AES69:** open standard (AES69-2015/2020/2022), netCDF-4/HDF5 container; SOFA 2.1 adds source directivity (`FreeFieldDirectivityTF`, spherical-harmonic). The open directivity target for boxdex, but HDF5-backed (needs WASM HDF5 reader). Validate `Conventions`/version → array shapes/coordinates; angles in degrees but reference frames differ. Readers: `sofar`, `pysofaconventions`, `python-sofa`, libmysofa (C). **GLL** (AFMG) and **CLF** are effectively closed (GLL proprietary/binary; CLF viewer free but authoring SDK confidential) — not realistic import targets; SOFA is the one open option.

---

# 8. Tool landscape (study/benchmark reference)

**Simulators:** Hornresp (freeware, the LEM/horn/TL reference; `.aks`/record export = interop target) · AkAbak legacy + AkAbak 3/ABEC3 (LEM + BEM) · VituixCAD (freeware, gold-standard multi-way/diffraction/polar UX) · WinISD (core T/S box math) · Basta!/The Edge (diffraction/room gain) · XSim (schematic crossover, FRD/ZMA) · REW (measurement hub; its text export = boxdex import path) · ARTA/LIMP (measurement, FRD/ZMA).

**Web apps (UX competitors):** Speakerbench (advanced box sim + best FRD/ZMA/JSON format docs) · speakerdesign.dev (in-browser T/S + cutlists) · smallboxplots.com.

**Numeric libraries to study:** python-acoustics (weighting/bands/ISO 9613/porous loss) · sfs-python (sound-field synthesis) · pyroomacoustics (image sources, monopole sums) · bempp-cl (Helmholtz BEM) · wavextrema (speaker/waveguide numerical solver) · scipy.signal (filters, Hilbert, min-phase, group delay).

**LEM kernels closest to the goal:** **os-lem** (vladimir42000/os-lem, Python LEM kernel like AkAbak/Hornresp; test-first; your validation oracle / porting base) + **os-lem-studio** (its TypeScript GUI). Note: os-lem does not yet cover TL / passive radiator / multi-driver / crossover.

**Gap note:** as of this research there is **no mature, permissive TypeScript enclosure-simulation library** — the TS ecosystem here is nascent (small 2026 repos: `joachimth/speaker-design`, `flaviograf-AG/loudspeaker-sim` [Rust/WASM + React], `cozycactus/SpeakerBuilder`, `lor3nzo/speakerforge`). boxdex would be filling a real gap.

---

# 9. boxdex-native product features (no external docs — these are yours to invent)

Not simulation physics, but the payoff of being an open web catalog + git + data model. All ride on the same client-side engine (live) and build-time precompute (static):

- **Auto-simulate every catalog enclosure** with its recommended driver; cache curves as static data.
- **Swap-a-driver** — any catalog driver into any catalog box, live.
- **Overlay simulated vs measured** curves (you already store measured CSV) as a confidence check.
- **Search the catalog by simulated performance** (F3 < 40 Hz, max SPL > X, group-delay budget…).
- **Shareable permalink** of a full design (you already use URL-as-state).
- **Side-by-side compare** of designs (radar/overlay you already build).
- **Community-contributed sims** via the box-contribute PR pipeline.
- **Reproducible, git-versioned sims** with inspectable model assumptions.
- **Sim-confidence badges** (closed-form / numeric / measured).

---

# 10. Integration & tooling

The key split: **generic numeric primitives have solid JS/TS libraries** you `npm install` and run in the browser; the **speaker-specific physics has no mature TS library**, so you build that (from this dossier) and reuse the Python projects only offline. Assemble proven primitives + reimplement the physics + validate against the Python oracles. There is no drop-in whole TS engine to wrap (closest: `flaviograf-AG/loudspeaker-sim` Rust/WASM, `os-lem-studio` — both immature).

## 10.1 Integrate directly (JS/TS, runs client-side)

| Need | Library | Note |
|---|---|---|
| FFT / IFFT (impulse, CSD, min-phase cepstrum) | **fft.js** (indutny) | Fastest pure-JS, fwd + inverse. `webfft` to benchmark; `pffft-wasm`/`kissfft-wasm` for WASM speed later |
| Complex dense matrix solve (LEM node solver, box models) | **ml-matrix** | Real LU solve; map complex N×N → real 2N×2N. Box models have tiny N → a ~50-line hand-rolled complex Gaussian elimination is also fine and dependency-free |
| Complex arithmetic | **complex.js** or **mathjs** | Convenience only; hot loops use flat `Float64Array` re/im to avoid allocation |
| Bessel `J1` (piston directivity, radiation impedance) | **bessel** (SheetJS) | Has J1. Struve `H1` not included → build (10.3) |
| Charts: FR, impedance, polar, coverage heatmap, CSD | **ECharts** (already in boxdex) | Cartesian curves, `polar` coord, `heatmap`, `echarts-gl` surface for CSD/balloons. No new dep |
| Large field-grid coverage maps | **Canvas / WebGL** (`regl`) | For grid×freq×source, render to a texture; faster than ECharts heatmap |
| `.wav` impulse export | **wavefile** | Or ~40 lines hand-rolled |
| Offload sims to a Web Worker | **comlink** | Worker calls as normal async functions; keeps UI responsive |
| Curve fitting (T/S from impedance) | **ml-levenberg-marquardt** | Nonlinear least-squares |
| Box auto-tune / optimizer | **fmin** (Nelder-Mead) | Most alignment auto-tune is closed-form; use this only for the general optimizer |
| SOFA / HDF5 directivity import (if/when) | **h5wasm** or **jsfive** | Parse HDF5, then interpret SOFA conventions yourself. Only if adding directivity import |

## 10.2 Integrate offline (Python, at build/CI, not shipped)

Mature, cover the array/acoustics math, but Python → use two ways: **precompute static data** and **generate golden test vectors** to validate the TS port.

- **pyroomacoustics** (image-source, monopole sums) — precompute array coverage / ground-reflection maps in CI, ship as static JSON/CSV. Strongest "reuse existing" path for the spatial side: proven lib does the field math offline, boxdex renders the result, everything stays static.
- **python-acoustics** — ISO 9613-1 air absorption, weighting, bands. Port formulas to TS or precompute α tables.
- **sfs-python** — sound-field synthesis reference for the superposition math.
- **os-lem** — LEM-kernel oracle and (with author grant) porting base for the hard node solver.

## 10.3 Build yourself (no library exists)

- The **physics**: box transfer functions, ABCD chains, the node solver, radiation impedance. Core value, yours.
- **Struve `H1`** (baffled-piston radiation impedance) — from the Aarts-Janssen approximation, a few lines; os-lem shows the shape.
- The **field-grid renderer** for coverage maps (Canvas/WebGL).

## 10.4 Recommended minimal starter stack (sweet-spot features)

Gets you sealed/vented + impedance + excursion + arrays:
```
fft.js          IFFT for impulse response
ml-matrix       (or hand-rolled) complex solve
bessel          J1 for directivity
comlink         Web Worker ergonomics
echarts         already present
+ physics from this dossier, validated against os-lem golden vectors
```

## 10.5 Suggested module layout (`packages/sim`)

Framework-agnostic, typed contract in `sim-core`, engines depend on it; the site and any build-time precompute both consume the engines. Run client-side (Worker) and/or at build time from one codebase.

```
packages/
  sim-core     units, complex math, freq grid, curve/FRD types, shared zod schemas   ← the contract
  sim-box      box + driver electroacoustic (§1, §3)        depends on core
  sim-line     distributed acoustics / ABCD network (§2)    depends on core
  sim-space    array / spatial superposition (§4)           depends on core, consumes sim-box output shape
  sim-post     time-domain / observations (§5–6 post)       depends on core
app (boxdex)   consumes engines live (Worker) + at build time (precompute → static curves)
tools/oracle   Python (os-lem, pyroomacoustics) → golden vectors + offline precompute
```

Split repos only later, once the `sim-core` contract is stable and an engine proves independently valuable.

---

# 11. Validation strategy

Turn "plausibly correct" into "trustworthy." boxdex's unfair advantage: it already stores **measured curves** for catalog enclosures, so real-world truth is built in. Validate every model against the strongest reference available for it.

## 11.1 The validation ladder (strongest → weakest)

1. **Exact closed-form / analytic** — tightest tolerance, where a formula exists.
2. **Golden vectors from the Python oracle** (os-lem + analytic scripts) — the cross-language backbone.
3. **Trusted external simulator** (Hornresp / WinISD / VituixCAD) for overlapping scope (see §12).
4. **Internal convergence / self-consistency** (refinement, reciprocity, dual formulations).
5. **Measured data** — real-world truth, noisiest.

## 11.2 Primitive-physics unit tests (vs closed form)

Test each element formula at sample points before any assembly: volume `Y=jωC`, duct `M=ρL/S`, radiation impedance J1/Struve at `ka ∈ {0.05,0.2,0.5,1,2}`, piston directivity `2J1(ka)/ka` (small-ka limit = 1 exactly).
- **Universal invariants** (property tests, `fast-check`): passivity `Re{Z}≥0`, energy balance at nodes, unit-normalization idempotence, `ω→0`/`ω→∞` asymptotics, low-frequency mass-like radiator reactance sign.
- **Dual-formulation agreement**: transfer-matrix (ABCD) vs nodal-admittance forms of the same element must match numerically. Best single catcher of algebra/sign bugs.

## 11.3 Analytic whole-model checks

Where a closed form exists, assert it exactly:
- Sealed: `Fc=Fs√(1+α)`, `Qtc`, F3; Butterworth `Qtc=0.707` → maximally flat.
- Vented: alignment denominators (B4/QB3), impedance saddle at Fb, double-peak positions.
- Array: two-source comb notches `f=(2n−1)c/(2Δd)`; cardioid/endfire rear-null depth + front gain.

## 11.4 Golden-vector oracle (makes the port safe)

The mechanism that lets you reimplement os-lem's physics in TS with confidence:
- Python (os-lem + analytic) computes reference outputs for a fixed corpus → checked-in **JSON reference files**.
- Vitest asserts TS matches within a **frozen tolerance policy**: complex `|z_test−z_ref| ≤ max(τ_abs, τ_rel|z_ref|)`, τ_rel=1e-6, τ_abs=1e-12, per-test overrides allowed.
- Any drift fails CI. **Determinism** (same input → identical output) is a hard test too, critical for static precompute.

## 11.5 Convergence & self-consistency

- **Segmentation refinement** for lines/horns (4/8/16/32/64 → converge; 32-vs-64 input-|Z| within 2%, resonances within 1%). Release blocker.
- **Frequency-grid insensitivity**; **field-grid resolution** for array maps (≥2–4 pts/λ or band-average).
- **Node-order reversal invariance**: swap a duct's endpoints → `input_impedance`/`spl` unchanged, signed flow flips per convention, profile x-axis reverses.

## 11.6 Measured-data validation (the catalog superpower)

Turn each catalog entry's measured FRD/impedance into a regression fixture:
- Overlay simulated vs measured; metrics = mean/max dB deviation over a band, F3/Fb agreement.
- **Be honest about confounds**: measurement includes baffle diffraction, room, driver sample variance, real box losses. Define a **fair comparison band** (e.g. gated near-field LF below the baffle step) and realistic tolerances, or you fail on physics you deliberately didn't model.
- **Catalog-scale continuous validation**: auto-simulate every enclosure in CI, flag any that deviates from measured beyond threshold. Ongoing large-scale validation no desktop tool can match.

## 11.7 Reference-model corpus (one fixture per failure mode)

- Free-air driver — electromechanical coupling before box loading.
- Symmetric front/rear — catches driver sign errors.
- Sealed box — resonance shift, excursion reduction.
- Vented box — double impedance peak, excursion null at Fb, port velocity.
- spl_sum cancellation — catches dB-vs-linear summation errors.
- Line / TQWT — standing-wave structure in the profile.
- Chained waveguides — junction pressure continuity + volume-velocity conservation.
- Side-branch notch — topology from primitives.
- Two-source comb + endfire/cardioid — array analytic checks.

## 11.8 Negative / robustness tests

Reject `f=0` and negative frequencies with clear errors; detect singular/ill-posed models (disconnected subnetwork, no shunt path to reference) rather than returning garbage; assert determinism.

## 11.9 Governance

- All tests in Vitest, gated in the existing `verify` pre-push (lint + typecheck + coverage + build).
- Coverage thresholds on `sim-core`.
- A **validation status matrix** per feature (analytic / oracle / cross-sim / convergence / measured), mark "Validated" only when a test backs it (model on os-lem's capability matrix).
- Surface it as **sim-confidence badges** to users: closed-form / numeric / measured-validated. Validation becomes a visible product feature.

---

# 12. Cross-tool validation against Hornresp / AkAbak

Hard constraint: **neither tool has a CLI or API** — both are Windows GUI apps. "Batch" = generate their text input, drive the GUI with automation, parse their text output. What makes it practical: do it **offline and occasionally, then commit the results as static reference fixtures**. Hornresp/AkAbak never touch CI or runtime.

## 12.1 What each tool allows

- **Hornresp** — closed, Windows, no scripting. Imports an "Input Record" (Eg, S1–S4 areas, L12/L23/L34 lengths, Vrc/Lrc, Ang, driver T/S…); exports SPL/impedance as text/FRD and can export `.aks`. Automatable only via GUI.
- **AkAbak** — legacy but **script-native** (`.aks` text with `Def_Const` for parametric sweeps) → far better for large batches. Output `.spl` text. Execution still GUI (or AkAbak 3 project runner).

## 12.2 Pipeline (mint once, compare forever)

Reference data is static and committed; you run these tools once on Windows to produce golden curves, commit them, and CI compares cross-platform forever. Regenerate only when expanding coverage.

**Hornresp:** generate N Input Records from the fixture corpus → AutoHotkey/AutoIt loop (import → Calculate → export SPL + Z as FRD/text → save) → commit exported FRD/ZMA → Vitest asserts boxdex matches within tolerance.

**AkAbak** (cleaner, scripted): generate `.aks` per fixture (`Def_Const` for families) → run (GUI automation or AkAbak 3 batch) → export `.spl` → commit → same harness.

Windows access: local box, VM, or GitHub Actions `windows` runner for the occasional mint job. Do not GUI-automate inside headless CI continuously (fragile); keep minting a deliberate offline step.

## 12.3 Single source of truth (fair comparison)

Define each fixture **once in a neutral spec**, then generate *both* the boxdex model *and* the Hornresp record / `.aks` from it. No transcription, no drift. Encode identical assumptions on both sides: radiation angle (`Ang`/solid angle), losses, drive voltage, driver params, segment counts.

```
fixtures/<name>.spec.json      ← neutral source of truth
  └─ generate → boxdex sim-core model     (TS)
  └─ generate → Hornresp Input Record     (.txt)
  └─ generate → AkAbak script             (.aks)
reference/<name>.hornresp.frd  ← minted offline, committed
reference/<name>.hornresp.zma
reference/<name>.akabak.spl
tests/ compares boxdex(model) vs reference/*  within per-fixture tolerance
```

## 12.4 What to compare, where to expect divergence

- Compare SPL (dB), impedance (mag+phase), excursion, group delay over a defined band.
- Use **band-limited metrics** (mean/max dB deviation) and **exclude bands where tools legitimately differ**: out-of-band port pipe modes Hornresp models and you don't, HF where 1-D breaks, features one side lacks. Document expected deviation per fixture rather than a global tight match.

## 12.5 Division of labor

- **os-lem + analytic (scriptable, batch-native)** → the *extensive* automated validation (hundreds of models, golden vectors). Where batch actually scales.
- **Hornresp / AkAbak** → a *smaller, curated, credibility-establishing* set (tens of fixtures, one per topology/failure mode), minted occasionally via GUI automation. Their value is community trust as the gold standard → earns the "replaces Hornresp" claim.
- Seed extra fixtures from **published Hornresp designs** on diyAudio where the response is already documented (reference data with zero automation).

## 12.6 Tooling & scale

- **AutoHotkey / AutoIt** (Windows GUI automation); record/`.aks` **generators** (Python or TS); **parsers** for Hornresp export / AkAbak `.spl` / FRD / ZMA (you build FRD/ZMA parsers anyway, §7).
- Scale realism: tens-to-low-hundreds of curated fixtures minted occasionally, not thousands nightly (GUI automation is seconds per model). Cover each topology and bug class representatively; let os-lem/analytic handle volume. AkAbak `.aks` + `Def_Const` is the route for genuinely large parametric sweeps against a trusted tool.

---

*Compiled 2026-07-24 from deep web research across enclosure lumped models, distributed acoustics, driver/electrical, arrays/spatial, directivity/diffraction, time-domain/large-signal, and formats/tooling. Equations are for implementation; verify against the cited primary sources before shipping.*
