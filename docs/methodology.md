# Methodology, model assumptions and limits

This document states exactly what Boxdex computes, what it does not, and which
simplifications are baked into the numbers it shows. Every constant below is quoted from
the source with its location so you can check it rather than trust it.

The short version: Boxdex is a **catalog and a first-pass planning aid**. Its predictions
are arithmetic over stored curves and stated specs. They are not acoustic simulations, and
nothing here replaces a measurement session with the actual boxes in the actual room.

---

## 1. Where the data comes from

### Drivers

The driver catalog (`data/drivers/`) is real: cone drivers carry Thiele-Small parameters,
compression drivers carry throat and bandwidth specs, horns carry coverage and cutoff.

**Provenance is uneven, and this matters.** Of the entries carrying a `datasheetUrl`:

- roughly two thirds point to third-party parameter aggregators (predominantly
  `petoindominique.fr`, plus `speakerboxlite.com`), not to a manufacturer document
- roughly a quarter point to manufacturer domains
- a smaller number point to retailer product pages
- several hundred entries carry no `datasheetUrl` at all

There is currently **no field recording whether a given parameter set is
manufacturer-published, aggregator-transcribed, or independently measured**. Treat every
figure as manufacturer-nominal unless you have checked the linked source yourself.

### Tolerances you should assume

Published Thiele-Small parameters are typically **single-sample and ±10-20%** unit to
unit, and manufacturers do not consistently state which. Fs and Qts in particular drift
with break-in and with temperature. Boxdex displays stored values to the precision they
were published at, which is **not** a claim about their accuracy: a `qts` shown as `0.337`
is a transcribed figure, not a measured tolerance band.

Any derived figure inherits that uncertainty and compounds it. Do not read a computed
sealed-box volume or a suggested crossover point as more precise than the parameters that
produced it.

### Measurement conditions

Curve files carry free-form notes (for example `1W/1m, half-space`, `gated, half-space`).
There is **no catalog-wide enforced convention**: the reference (anechoic, half-space,
ground-plane) is per-entry prose and is not validated at build time.

**Consequence: SPL curves are not reliably comparable across entries**, and nothing in the
code normalises or even flags a mismatch before summing curves from different boxes
together. When you overlay two curves in Compare, or stack two models in the rig builder,
verify their notes agree before reading anything into the difference.

### Simulated vs measured

The data model separates `simulations` (`hornresp_sim`, `akabak_sim`) from `measurements`
(`rew_measured`, `klippel`), and the two are never blended: the UI shows provenance as a
badge, distinguishes them by line style in the curve charts and by marker shape in the
design-space scatter, and offers a measured-only filter.

---

## 2. Array gain and coupling

`src/lib/stack.ts`

```ts
function gainCoeff(category) { return category === "sub" ? 20 : 10; }
export function arrayGainDb(category, n) {
  if (n <= 1) return 0;
  return gainCoeff(category) * Math.log10(n);
}
```

Subs gain **+6 dB per doubling** (`20·log10 N`, coherent), everything else **+3 dB per
doubling** (`10·log10 N`, power sum).

**Limits of this model, in order of how much they will bother you:**

- **It is unbounded.** 16 subs reads +24 dB, 32 subs reads +30 dB, with no rolloff. Real
  arrays stop coupling coherently once spacing approaches a wavelength.
- **It is frequency-independent.** A sub array's coupling is applied identically at 30 Hz
  and at 100 Hz, though the wavelength changes by more than a factor of three across that
  span.
- **It ignores geometry entirely.** Spacing, splay, stack height, and array shape are not
  inputs. A 4-wide horizontal line and a 2x2 block produce identical numbers.
- **The sub/broadband split is a category boundary, not a physical one.** The coefficient
  is chosen by the box's declared category, not by the frequency being evaluated.

Different categories always combine in the power domain regardless of their own coupling
law, since they occupy different bands.

---

## 3. Distance and coverage

`src/lib/stack.ts`

```ts
const splAtD = splAt1m - 20 * Math.log10(distanceM);
const requiredPeakDb = targetSplDb + crestDb;
headroomDb = splAtD - requiredPeakDb;
```

Point-source inverse-square only: **-6 dB per doubling of distance**, at every frequency.

Not modelled: air absorption (which removes a great deal of HF over long throws, and
varies with temperature and humidity), the `-3 dB` per doubling line-source regime, the
near-field to far-field transition, ground reflection, and any room or boundary effect.

For a long outdoor throw this model is **optimistic at high frequencies** and the error
grows with distance.

### Crest factor

```ts
export const DEFAULT_CREST_DB = 6;
```

Default 6 dB peak-above-RMS, user-editable. AES2 driver testing and heavily compressed
live material both sit near this figure; a sine is 3 dB and uncompressed program can
exceed 12 dB. If your material is not compressed, raise it.

### Band edges

```ts
export const CATEGORY_UPPER_HZ = { sub: 100, kick: 200, mid: 3500, top: 20000 };
```

Fixed boundaries used to assign category bands, not derived from any box's actual response.

---

## 4. What the SPL ceilings do and do not account for

Enclosures may carry `maxSplExcursionDb` (Xmax-limited, dominant below Fb),
`maxSplThermalDb` (power-limited, dominant above Fb), and `maxSplDb` as the headline
figure. `maxVelocityMs` records port velocity. Distortion and power-compression curves can
be stored and plotted.

**None of these derate the rig prediction.** `summarizeStack` and `calcCategoryCoverage`
work from the static `maxSplDb` and add array gain on top. Specifically, the predicted
system SPL does **not** account for:

- **power compression** (voice-coil heating raising Re and reducing output as the box
  warms, commonly 2-4 dB into a long set, sometimes more)
- **port compression** and port noise at high excursion
- **thermal derating over a set** as opposed to a single burst
- **distortion rising** as excursion approaches Xmax

The headline number is therefore a **short-term, cold-voice-coil ceiling**. Sustained
real-world output will be lower, and the gap widens the harder the system is driven.

`maxSplDb` is optional and is **never defaulted or derived**: boxes without it are
excluded from SPL sorts and plots rather than being assigned a guess.

---

## 5. Crossovers

`src/lib/crossover.ts`

### How suggestions are found

Suggestions come from the boxes' **own loaded SPL curves**, not from stated specs: the
suggested point is where two adjacent bands' composite curves actually cross at equal SPL,
searched on a 1/12-octave logarithmic grid. Boxes sharing a category form one band via a
power-sum composite, and crossings are found between adjacent categories in band order
(sub, kick, mid, top).

The search may reach up to `EXTRAPOLATION_OCTAVES = 1` past a curve's own last data point,
using that edge's own final-segment slope. Beyond that it returns null rather than
inventing data. When no true crossing exists, a closest-approach fallback applies, capped
at `MAX_APPROX_DIFF_DB = 20` before reporting a gap instead.

Every corner carries status flags surfaced in the UI: `gap`, `clampedToCdMin`,
`approximated`, `extrapolated`. **Read them.** A corner marked `approximated` is not a
crossing, it is the least-bad point available.

Compression-driver protection floors (`minCrossoverHz`) clamp the suggestion upward and
are never blended between boxes.

### The filter model, and its central limitation

```ts
export function lr4Db(f, fcHz, type) {
  const r = type === "lowpass" ? f / fcHz : fcHz / f;
  return -20 * Math.log10(1 + r ** 4);
}
```

This is a correct Linkwitz-Riley 4th-order **magnitude** response: -6.02 dB at fc,
asymptotically 24 dB/octave.

**There is no phase term anywhere in the model.** When crossovers are applied, bands are
summed coherently (`20·log10`), which assumes every band is perfectly in phase at every
frequency.

The consequence is the single most important caveat on this page: **the predicted response
cannot show lobing, polarity errors, or crossover-region cancellation.** Those are the
exact failure modes an LR4 alignment exists to manage. The chart will draw a smooth sum
through the crossover region that you will not measure in the field.

Also absent: no per-band delay, no polarity inversion control, no driver offset
compensation, and therefore **no time alignment calculation of any kind**. Group-delay
curves can be stored and plotted but never enter a calculation.

Treat suggested corners as **starting points for a real alignment**, which is what the
source comments call them. They are not DSP presets.

---

## 6. Spectral balance

```ts
const SUB_REGION = [20, 100];
const TOP_REGION = [1000, 16000];
```

The tilt figure is the unweighted mean of the composite over `SUB_REGION` minus the
unweighted mean over `TOP_REGION`.

**The 100-1000 Hz region is excluded entirely.** A rig with a large hole or a large hump
through the low mids can report a perfectly neutral tilt. The figure is a coarse two-point
balance indicator, not a response evaluation.

The mean is unweighted per grid point on a log-spaced grid, so it is not an energy average
and carries no psychoacoustic weighting.

---

## 7. Amplifier matching and wiring

`src/lib/wiring.ts`

All series-parallel arrangements of N identical cabinets are enumerated as p parallel
branches of s cabinets in series (`s·p = N`), with load `Z·s/p`.

Load ratings: below 2 Ω `danger`, below 4 Ω `caution`, above 16 Ω `inefficient`, otherwise
`ok`.

```ts
const IEC_MIN_IMPEDANCE_RATIO = 0.8;   // IEC 60268-5 dip allowance
const SUGGESTED_MAX_W_PER_CHANNEL = 4000;
ampChannelW: minW = AES × qty, idealW = 2 × AES × qty
```

A stated `impedanceMinOhm` dip is normalised through the IEC allowance before rating, and
can only ever **worsen** the nominal rating, never improve it.

```ts
export const AMP_EFFICIENCY = 0.85;
export const GENERATOR_HEADROOM = 1.3;
recommendedGeneratorW = (totalAesW / efficiency) * headroom;
```

Not modelled: cable resistance and the resulting damping-factor loss, amplifier current
draw and mains phase balancing, bridge-mode and minimum-load limits of specific amplifier
models, inrush, or limiter settings. **Boxdex does not compute limiter thresholds** and
should not be used to set them.

`nominalImpedanceOhm` is the stated value, or the driver's nominal for single-driver boxes
only. Multi-driver boxes without a stated value are left undefined rather than guessed,
because internal wiring topology is not recorded.

---

## 8. Figures of merit

`src/lib/metrics.ts`

```ts
outputDensity = maxSplDb − 10·log10(netVolumeL)
outputPerKg   = maxSplDb − 10·log10(weightKg)
```

These are **invented ranking aids, not physical quantities.** The units shown (`dB/size`,
`dB/kg`) are labels, not dimensional analysis. They are useful for sorting a catalog by
"loud for its size" and meaningless in isolation. Both are undefined when `maxSplDb` is
absent.

The Pareto frontier on the explore page is an honest pairwise dominance test over the two
selected axes.

---

## 9. Driver substitution

`src/lib/similarity.ts`

Candidates are hard-filtered to the same type and the same nominal size (cone) or throat
exit (compression), then ranked by a weighted mean of per-parameter deviations measured in
octaves (`|log2 ratio|`), or dB/6 for sensitivities.

Weights, from `CONE_WEIGHTS` and `COMPRESSION_WEIGHTS`:

| Cone | weight | | Compression | weight |
|---|---|---|---|---|
| Qts | 3 | | min crossover | 3 |
| Fs | 2.5 | | f low | 2 |
| Vas | 2 | | sensitivity | 1.5 |
| Xmax | 1.5 | | voice coil | 1.5 |
| sensitivity | 1 | | f high | 1 |

A candidate that betters the target on Xmax (or on crossover floor) is penalised at
`BETTER_THAN_TARGET_PENALTY = 0.25` of full weight, since headroom is not a mismatch.
Tier thresholds: `close` at ≤0.15 weighted deviation, `usable` at ≤0.4, `risky` above.

These weights are a **judgment call**, published here so you can disagree with them
specifically rather than in general.

**Substitution ignores physical fit.** Mounting depth, cutout diameter, bolt circle,
gasket pattern, and magnet clearance are not checked and in most cases are not recorded.
The size gate is nominal only. A driver ranked `close` may not physically mount.

A substitution suggestion is a parametric hint. A real swap still needs a simulation and
usually a re-tune.

---

## 10. Enclosure design math

`src/lib/driver.ts` is deliberately small:

```ts
ebp = fs / qes           // <50 → sealed, >100 → ported, else flexible
sealedVbL: Vb = Vas / ((Qtc/Qts)² − 1)   // Qtc default 1/√2
```

That is the entirety of the driver-side design math. **Not provided:** ported alignment
design (Vb/Fb targets, QB3/SBB4/C4), port area or length calculation, excursion-limited
SPL derived from Sd and Xmax, power-limited SPL from Pe, baffle step compensation, voice
coil inductance effects, or passive crossover component values.

The EBP thresholds are a conventional heuristic, not a rule.

---

## 11. Summary of what Boxdex does not do

Listed plainly so nothing here is a surprise:

- no time alignment or delay calculation
- no phase in the crossover model, so no lobing or cancellation prediction
- no directivity, polar, or coverage-vs-frequency plotting (stored coverage angles are
  displayed and compared, never used in a calculation)
- no cardioid, end-fire, gradient, or arc sub-array patterns
- no rigging or flying data: no fly points, working load limits, centre of gravity, or
  stack stability
- no limiter, EQ, or DSP preset output
- no power, port, or thermal compression in any prediction
- no air absorption, temperature, or humidity in the distance model
- no room, boundary, or ground-plane modelling
- no THD computation
- no physical-fit checking in driver substitution

---

## 12. Where to check any of this

All prediction logic is in `src/lib/`, is pure, and is unit tested:

| Concern | Source |
|---|---|
| Array gain, distance, coverage, composite response, spectral balance | `src/lib/stack.ts` |
| Crossover search and LR4 application | `src/lib/crossover.ts` |
| Wiring, load rating, amp sizing | `src/lib/wiring.ts` |
| Derived catalog metrics, Pareto | `src/lib/metrics.ts` |
| Driver substitution ranking | `src/lib/similarity.ts` |
| EBP, sealed volume | `src/lib/driver.ts` |

Corrections to this document, or to the assumptions it describes, are welcome as issues or
pull requests.
