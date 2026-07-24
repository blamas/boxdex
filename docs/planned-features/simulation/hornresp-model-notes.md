# Hornresp modeling notes (for boxdex)

Field notes on **how Hornresp actually works**, gathered from David McBean's diyAudio posts, the Hornresp Help file, and the (unofficial, machine-translated) Hornresp manual. Purpose: build boxdex to *match* Hornresp where it counts, and know exactly where it diverges.

> **Sourcing caveat — read this.** diyAudio, manuals.plus and the OldWiki Help all block automated fetching, so many quotes below are **search-engine extracts** of McBean's posts, not verbatim reads. The English manual is a **machine translation** of McBean's Swedish/German Help, so exact wording is approximate. Parameter *semantics* are reliable; exact *equations* mostly are not (McBean rarely publishes the internal circuit equations). Everything flagged **[inferred]** is standard Beranek/Thiele convention, not a McBean statement. Confirm anything critical against the in-app Help or by black-box testing (§ our validation plan §12) before shipping a parity claim.

---

## 0. The findings that should change how you build (TL;DR)

1. **Voice-coil inductance = single `Le` + optional "Lossy Le" that *derates Bl*** — NOT a semi-inductance (Leb/Ke/Rss) network. Leb/Ke/Rss is VituixCAD/REW, not Hornresp. To match Hornresp, replicate the Bl-reduction, not a reactive ladder.
2. **The horn engine = per-segment ABCD/transmission matrices cascaded mouth→throat**, terminated by a **piston-in-infinite-baffle** radiation impedance at 2π (a **pulsating sphere** at 4π). Independent implementers report this "exactly matches Hornresp."
3. **Two wavefront models.** Default = **Webster plane-wave**. Le Cléac'h / OS / spherical switch to an **isophase (curved) wavefront** that integrates area over the spherical cap ("the bubble"). Plane-wave-only boxdex will match CON/EXP/PAR/HYP but diverge on Lec/OS.
4. **The headline SPL curve is a POWER response, not on-axis**, valid only below the directivity-onset frequency. Don't present it as a mic measurement.
5. **Losses are physical, not Q-factors.** Hornresp does **not** use `Ql/Qa/Qp`. Damping = per-segment **flow resistivity** (`Fr1`, mks rayls/m) × **fill fraction** (`Tal1`, %). Any Ql/Qa/Qp you see is WinISD-world, not Hornresp.
6. **Tapped horn = one waveguide with the driver injecting two velocity sources at two taps** (S2 and S4), summed with their path-length phase. Two-driver THs collapse to one equivalent driver at the mean offset.
7. **Max SPL = per-frequency `min(SPL@Pmax, SPL@Xmax)`**; black = power-limited, red = displacement-limited; **Xmax is one-way mean-to-peak**.
8. **2nd-harmonic distortion = horn air non-linearity** (Beranek & Mellow eq. 9.32), single-segment horns only. It is **not** a motor/Bl(x) (Klippel) model.
9. **`Ang` gives ~5 dB (not 6) per halving of space** because the mouth loading impedance changes with angle, not just geometry. Let it emerge from the radiation impedance, don't hard-code +6 dB.

---

## 1. Driver & electrical

**Driver representation.** Lumped electro-mechanical driver: `Sd, Bl, Cms, Rms, Mmd, Re, Le`. You can enter these directly or let Hornresp derive `Bl/Cms/Rms/Mmd` from T/S (`Fs, Vas, Qes, Qms, Sd, Re`) via a double-click calculator. Note **Mmd** (moving mass excluding air load) vs **Mms** (incl. air load) — Hornresp keeps them distinct.
*Source:* Free Speaker Plans Help mirror; audiojudgement tutorial. *Conversion equations not published by McBean* — the textbook relations (`Cms=Vas/(ρc²Sd²)`, `Mms=1/((2πFs)²Cms)`, `Bl=√(2πFs·Mms·Re/Qes)`) are standard theory, treat as **[inferred]**.
*boxdex:* accept T/S or explicit; derive internally; preserve the Mmd/Mms distinction so imported drivers agree.

**Voice-coil inductance.** Baseline = scalar `Le` (mH), a simple inductor. Optional **"Lossy Le"** (empirical, from diyAudio user "just a guy", adopted by McBean) for high-inductance drivers (Le:Re ≥ ~1:1): it does **not** add reactance — it **reduces effective Bl** (lossy inductance looks like a weaker motor: higher Qts, raised LF cutoff). Adjusted Bl shows in the status bar.
*Source:* Audio Asylum lossy-inductance thread; diyAudio Hornresp thread (search extracts). **Correction:** Le/Leb/Ke/Rss semi-inductance is **VituixCAD/REW/ARTA (Wright LR-2), not Hornresp** — the "double-click Le → semi-inductance dialog" snippet described VituixCAD. Treat a Hornresp semi-inductance network as **unverified/likely false**.
*boxdex:* (a) Hornresp-parity: plain `jωLe` + optional Bl-derate keyed on Le/Re. (b) Better than Hornresp: implement true semi-inductance `Z(ω)` from Leb/Ke/Rss (REW/ARTA export these) for better sub-100 Hz impedance — but that will *not* match Hornresp numerically.

**Drive.** `Eg` = amplifier **open-circuit (Thévenin) voltage**, not power; default 1 W/8 Ω → **2.83 V**. `Rg` = amp source resistance, **default 0** (ideal constant-voltage source); non-zero Rg forms a divider with driver Z (models damping factor / series R).
*Source:* diyAudio Hornresp thread pp.316/56 (search extracts; wording consistent with McBean, authorship not fetched).
*boxdex:* model as Thévenin (Eg, Rg); default Eg=2.83, Rg=0; derive input power from the electrical branch; expose Rg.

**Multiple drivers.** `Nd` = count. Series (two identical): `Bl,Re,Le,Rms ×2, Cms ×½`; parallel = the duals (`Re/2`…). `ND`↔`OD` toggle: OD = **offset driver** at a segment junction (needs ≥2 segments). Isobaric (series or parallel) supported.
*Source:* audiojudgement (ND/OD); diyAudio isobaric thread + Hornresp p.316 (the ×2/×½ from a forum example — physically correct, not a fetched McBean post).
*boxdex:* support series/parallel electrical combination + offset-at-junction placement + isobaric compound; match ND/OD semantics for clean record import.

**`Ang` radiation angle.** Steradians as a multiple of π: `4`=4π full, `2`=2π half, `1`=π quarter, `0.5`=π/2 eighth, `0`=infinite horn (theory only). Halving the space raises SPL by **~5 dB** (not 6) because the loading impedance also changes.
*Source:* Hornresp Help oldwiki; manual PDF; "what is 2 pi and 4 pi" thread.
*boxdex:* expose {4π,2π,π,π/2,∞}; let the SPL offset emerge from the angle-dependent radiation impedance (target ~5 dB), default 2π.

---

## 2. Horn & acoustic-segment model

**Segments.** Up to 4 in series: area stations `S1..S5` joined by lengths `L12,L23,L34,L45` (the L locks the segment). Flare per segment by focusing the length box + a letter key.
- Multi-segment: **Con** (conical), **Exp** (exponential), **Par** (parabolic).
- Single-segment only: **Hyp** (hyperbolic-exponential/Salmon), **Lec** (Le Cléac'h), **OS/Obl** (oblate spheroidal), **Sph** (spherical), **Tra** (tractrix).
- **Salmon T** (entered in `F23`): `S = S1(cosh(x/x0) + T·sinh(x/x0))²`; verbatim manual: `0 = catenoidal; <1 = cosh; 1 = exponential; >1 = sinh; 99999.99 = conical`.
*Source:* Hornresp manual pp.9-10,44-46; Help mirror; McBean diyAudio thread.
*boxdex:* one parametric `S(x)` sampler per profile with the same key set; store Salmon T in one field so records round-trip.

**Acoustic solve.** 1-D **Webster horn equation**; each segment a **two-port/ABCD transmission matrix**; cascade **mouth→throat**, transforming the mouth radiation impedance down to the throat impedance the driver sees. Driver end = full electro-mechano-acoustic lumped circuit. Per frequency: build matrices → cascade → throat Z → driver circuit → SPL. Radiated power `W = |p/Zfr|²·Ra` (Ra = resistive part of radiation impedance).
*Source:* diyAudio Hornresp pp.408/700/312 (McBean + users); independent implementers confirm "horn transfer matrix + piston-in-infinite-baffle radiation exactly matches Hornresp."
*boxdex:* mirror it — per-segment ABCD, cascade mouth→throat, piston-in-baffle termination (area = mouth area) at 2π. Cheap per frequency and Hornresp-comparable.

**Wavefront models (the key subtlety).**
1. **Default = Webster plane-wave.** Wavefront area = geometric cross-section; linear `Ang`↔area. Ignores the mouth "bubble."
2. **Isophase (curved) wavefront** for Le Cléac'h / OS / spherical: area integrated over the curved spherical-cap surface; **accounts for the bubble**; the mouth wavefront-shape assumption changes the mouth acoustical impedance, which transforms down to the throat. In *both* models the driver is a rigid plane piston and the **wavefront is planar at the throat** (curvature develops along the horn).
*Source:* David McBean, diyAudio Hornresp p.312 (verbatim); wavefront-simulator thread.
*boxdex:* plane-wave engine matches CON/EXP/PAR/HYP. To match Lec/OS you must integrate area over the isophase cap and use the bubble impedance as termination. Authoritative math: Kolbrek & Dunker, *High Quality Horn Loudspeaker Systems*.

**Scope.** Output is **power response**, accurate up to the directivity-onset frequency; McBean rejected FEM for multi-segment directivity ("unacceptable calc times").
*Uncertain / not found:* explicit "acoustic path vs folded physical length" wording; any numerical segment-count accuracy rule; Hornresp's exact OS/Tra/Sph wall equations.

---

## 3. Radiation impedance, mouth termination, far-field SPL

**Mouth termination (angle-dependent).**
- **2π:** rigid round flat **piston in an infinite baffle**, piston area = mouth area.
- **4π:** **pulsating sphere**, surface area = mouth area.
- **π / 0.5π:** the 2π case with acoustic-mirror (boundary) images ("on the ground the sphere is cut in half… the ground doubles the effective mouth").
- **0:** reflection-free ideal termination (horn theory only).
Mouth impedance mismatch → **throat-impedance ripple** → power-response ripple.
*Source:* McBean diyAudio pp.797/676 (extracts); Help mirror. *Literal Bessel/Struve `R1/X1` formula not retrieved* — model identity is verified, the equation is **[inferred]** (standard Beranek piston).
*boxdex:* terminate with piston-in-baffle (2π) / pulsating-sphere (4π), area-matched, selected by `Ang`; reproduces the ripple behavior.

**SPL derivation.** Default "SPL Response" = pressure at **1 m re 20 µPa**, but it's a **power response** ("different than the on-axis response you'd measure with a mic"; "accurate up to where the horn becomes directional"). From resistive radiation load × mouth volume velocity.
*Source:* manual PDF ~l.1220; Help mirror; diyAudio p.676. *Exact pressure-from-volume-velocity relation not retrieved* → **[inferred]**.
*boxdex:* compute baseline SPL as a power response at 1 m re 20 µPa; label it as such; layer directivity-corrected pressure on top for a chosen axis.

**Directivity (limited, separate tool).** Single-segment finite horns only; source modeled as a **rigid circular piston = throat radius**; **flare directional behavior is NOT taken into account**; DI = `10·log10(directivity factor)`; outputs −6 dB beamwidth + polar maps.
*Source:* manual PDF (Directivity section); diyAudio directivity thread; p.312.
*boxdex:* if added, follow the same coarse model (flat piston, single-segment, flare ignored) and say so.

**Combined response & phase.** Multi-path systems sum direct + mouth + port radiation with a **path-length (delay) phase term**; a user "path length difference" parameter shifts the port-to-listener distance before the complex sum. Some topologies sum as **pressure**, others as **acoustic power**.
*Source:* manual PDF (Combined sections).
*boxdex:* sum sources as complex pressures with an explicit inter-source delay; offer both coherent-pressure and power-sum outputs per topology, matching Hornresp's choice.

**Power vs pressure outputs.** Two domains: **Acoustic Power** (W, efficiency %, input power → drives the power-response SPL) and **Acoustic Pressure/SPL** (dB re 20 µPa @1 m; where the true directional curves live). Efficiency ignores directivity.
*boxdex:* keep radiated-power/efficiency separate from far-field pressure; default response from power, directivity-corrected pressure as an overlay.

---

## 4. Chambers, transmission lines, tapped horns, losses

**Tapped horn.** 3–4 CON/EXP/PAR segments + `TH`/`TH1` flag; single driver couples into the same path at **two taps** (3-seg TH: S2; 4-seg TH: **S2 and S4**; 4-seg TH1: S2 and S3). Chain: closed end → rear tap → driver → front tap → mouth; the two faces sum with path-length phase (→ the TH ripple). Set TH by `Vrc`/`Lrc`=0 (rear-chamber slot repurposed). **Driver = point source** (accurate at LF; degrades once a pressure maximum passes the cone). Two drivers **collapse to one** at the geometric-mean offset ("S2 is the midpoint between the drivers").
*Source:* manual; diyAudio 2-driver-TH thread (extracts).
*boxdex:* one waveguide + driver as **two velocity sources at two path positions**, summed with path-difference phase; encode `[segments]+TH+tap indices`; collapse multi-driver to a single equivalent at mean offset (document the point-source limit).

**Offset / distributed driver.** `OD` (entry at S2, ≥2 seg), `OD1` (entry at S3, ≥3 seg) place the driver between segments; position via segment lengths or the Loudspeaker Wizard; `Lo1`/`Lo2` set per-chamber offset (Auto = symmetric, Manual = independent); `L12=0.01 cm` when not offset.
*boxdex:* driver position = fractional distance along the chain, splitting into behind/in-front sub-lines; Auto/Manual offset toggle for dual-chamber.

**Chambers.** `Vrc` (rear vol, **litres**), `Lrc` (rear length, cm); rear can be sealed/lined/vented/PR. Rear-vented: `Vrc`+`Ap`(port area)+`Lpt`(port length) = Helmholtz behind driver, with **automatic internal end correction on Lpt** (Helmholtz f in status bar). Throat/neck chamber: `Vtc` (**cc**), `Atc` (avg area); throat gate `Ap1`(entry area <Sd)+`Lp`(≈baffle thickness). Closed box = all S/L = 0, Vrc/Lrc > 0.
*boxdex:* `Vtc/Atc` → series compliance (coupling area Atc); `Ap1/Lpt` → acoustic mass + end correction; `Vrc(+Ap+Lpt)` → compliance / Helmholtz with auto end correction. Mind units (Vtc in cc, Vrc in litres). Element→equation mapping is **[inferred]** standard Beranek — verify against exports.

**Transmission line / MLTL.** No dedicated mode — a TL is a **horn with equal (or mildly tapered) end areas** (zero/negative expansion, enabled since v16.40). Straight = `S1=S2`; tapered = `S1>S3`; MLTL = several Con segments in series; offset-driver TL = 2 segments (closed end → driver center → exit). The vent must be the **line terminus**, not a side branch.
*boxdex:* TL/MLTL = the constant/near-constant-area special case of the same segmented-waveguide engine; "make it a line" forces equal end areas; vent only at the terminus.

**Losses / damping / filling (important — NOT Q factors).** Hornresp does **not** use `Ql/Qa/Qp`. Damping = per-segment **flow resistivity** `Fr1` (mks rayls/m; ~500 light poly → 1000+ rockwool) × **fill fraction** `Tal1` (%, fills from the closed end first). Chamber lining uses `Fr` (rayls/cm) + thickness. Below 1000 rayls/m it can report equivalent polyfill mass (kg). The absorbent model **can break down mathematically at very high resistivity**. Separate "mask neck/rear chamber resonances" Option = a **display idealization**, not physical damping — don't confuse.
*Source:* manual (Filling/Fr1/Tal1/Options); audiojudgement; diyAudio Ql-Hornresp thread (extracts).
*boxdex:* model damping as **distributed resistive loss per segment = f(flow-resistivity, fill %)** inside the waveguide propagation, not a lumped Q. Expose `Fr1`-style resistivity + `Tal1`-style fill-% with fill-from-which-end semantics. Keep any T/S-style box-Q model separate and labeled "not Hornresp."

---

## 5. Max SPL, displacement, velocity, distortion, group delay

**Max SPL (Pmax vs Xmax).** Per frequency plot `min(SPL@Pmax, SPL@Xmax)`: drive at rated **Pmax** sine sweep; wherever cone displacement > **Xmax**, recompute input power down so displacement = Xmax and plot that reduced SPL. **Black = power-limited, red = displacement-limited** (LF usually red, HF usually black), with a kink at the crossover. **Xmax = linear one-way mean-to-peak** (the entered value).
*Source:* manuals.plus Help; diyAudio "What does the Max SPL tool show" (McBean); speakerplans.
*boxdex:* compute SPL at Pe and at the level giving one-way excursion = Xmax, plot the lower envelope, color by binding limit, mark the kink; Xmax one-way, not half of p-p.

**Diaphragm displacement.** Excursion(f) for the set drive voltage/power; the curve Max SPL compares to Xmax. (Peak vs RMS not stated → assume **peak** to match the mean-to-peak Xmax; **[inferred]**.)
*boxdex:* drive linear model at user voltage, plot excursion(f), overlay Xmax line.

**Port/particle velocity + chuffing.** Dedicated particle-velocity tool at **port/segment ends** — explicitly **not** the narrowest internal section, so it **under-reports** the true worst case. Hornresp does **not** model chuffing/turbulence; it's a linear output vs a rule-of-thumb (~<17 m/s conservative; ~30–35 m/s for a well-flared port).
*boxdex:* `v = volume velocity / area`; flag amber ~17, red ~30; warn on the **smallest cross-section** (which Hornresp deliberately doesn't).

**2nd-harmonic distortion.** For **single-segment horns only**: computed from **horn air non-linearity** (finite-amplitude propagation) via **Beranek & Mellow eq. 9.32** (older Beranek form was low by **1/√2**, corrected ~v48.60). Rises with throat SPL and f/fc. **Not** a Bl(x)/Kms(x) motor (Klippel) model; not offered for multi-segment/ported/tapped/chamber designs.
*Source:* diyAudio "Mellow Sounds of Second Harmonic"; "Concrete Bass Horn" pp.60-61 (McBean on eq. 9.32 + the 1/√2); Hornresp p.544.
*boxdex:* if implemented, replicate the physical basis (air non-linearity, eq. 9.32, function of throat SPL and f/fc, single-segment exp/conical only) and label it as such — don't conflate with motor distortion. *Verify eq. 9.32 form + the version of the 1/√2 fix against the actual Help/build.*

**Group delay & phase.** GD = `−dφ/dω` (s). Overlays **1/f** and **Claus Futtrup** audibility-limit lines; the **acoustic propagation delay is added as an offset** to those limit lines because they apply to **excess** GD, not total GD.
*Source:* diyAudio Hornresp pp.601-602 (McBean); manuals.plus; cross-ref REW GD help.
*boxdex:* GD = `−dφ/dω` from the modeled complex response; if showing audibility limits, distinguish **total vs excess** GD (subtract bulk propagation delay) so the "acceptable" region lines up.

---

## 6. boxdex parity checklist (decisions to lock)

- [ ] Driver: T/S ↔ lumped derivation; keep Mmd vs Mms distinct.
- [ ] Inductance: plain `jωLe` + optional Bl-derate for Hornresp parity; (separately) true semi-inductance for better-than-Hornresp accuracy.
- [ ] Drive: Thévenin (Eg=2.83 default, Rg=0).
- [ ] Horn engine: per-segment ABCD, cascade mouth→throat, piston-in-baffle (2π) / pulsating-sphere (4π) termination.
- [ ] Profiles: Con/Exp/Par (multi-seg) + Hyp via one Salmon `T`; Lec/OS/Sph/Tra single-seg.
- [ ] Wavefront: plane-wave first (matches most profiles); isophase/bubble later for Lec/OS.
- [ ] SPL labeled as **power response**, valid below directivity onset.
- [ ] `Ang`: radiation-impedance-driven SPL offset (~5 dB/halving), not hard +6 dB.
- [ ] Losses: flow-resistivity × fill-% per segment, **not** Ql/Qa/Qp.
- [ ] Tapped horn: two velocity taps on one waveguide, path-phase sum; multi-driver → mean-offset equivalent.
- [ ] Chambers: Vtc(cc)/Atc, Vrc(litres)/Ap/Lpt with auto port end correction.
- [ ] Max SPL: `min(Pmax, Xmax)` envelope, one-way Xmax, color-coded limits.
- [ ] Port velocity: warn on smallest cross-section (improve on Hornresp).
- [ ] 2nd harmonic: air non-linearity eq. 9.32, single-segment only (optional/far).
- [ ] Group delay: `−dφ/dω`, total vs excess distinction.

## 7. Open items to verify (before any parity claim)

- Exact Beranek & Mellow eq. 9.32 form + the build where the 1/√2 correction landed (cited v48.60).
- Hornresp's exact OS/Tractrix/spherical wall equations and the isophase-area integral.
- Whether Diaphragm Displacement plots peak vs RMS.
- The internal T/S→lumped and radiation-impedance equations (McBean doesn't publish them) — best obtained by **black-box fitting against Hornresp exports** (F9 / Export: Impedance, Displacement, Acoustical Power), per validation plan §12.
- Re-confirm all diyAudio quotes verbatim from the live threads / in-app Help (current notes are largely search-extracts).

---

*Compiled 2026-07-24 from David McBean's diyAudio posts (thread #119854 and topic threads), the Hornresp Help file, and the unofficial translated manual. Treat as engineering field notes with the sourcing caveats above, not a verbatim spec. Companion to `simulation-reference.md`.*
