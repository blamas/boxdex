# ADR-012: Data provenance and stated model limits

## Status
Accepted

## Date
2026-07-20

## Context
Boxdex presents two very different kinds of number side by side:

- **Stored data**: driver Thiele-Small parameters, enclosure specs, SPL curves. Sourced
  externally, transcribed, of uneven and mostly unrecorded provenance.
- **Derived predictions**: array gain, coverage headroom, crossover suggestions, composite
  system response, substitution ranking. Computed by `src/lib/` from that stored data
  under simplifying assumptions.

The UI renders both as bare figures in the same visual language. A reader has no way to
tell, from a number alone, whether it was transcribed from a datasheet, computed under an
unbounded coupling model, or invented as a ranking aid.

Three specific problems motivated this ADR:

1. `LICENSE.md` claimed driver specs were "transcribed from manufacturer datasheets". In
   fact the majority of `datasheetUrl` values point to third-party parameter aggregators,
   several hundred entries have no source link, and no field records which is which.
2. The glossary described the crossover algorithm as taking "the geometric mean of the
   overlap range". The code had since moved to curve-crossing detection. Docs describing
   an algorithm the code no longer uses cost more credibility than no docs at all.
3. Assumptions that materially change a result, most importantly that the crossover model
   is magnitude-only with no phase term, and that array gain is unbounded, existed only as
   source comments. A reader had to reverse-engineer them.

The target audience is professional audio system engineers. This audience will find these
simplifications quickly, and will judge the project by whether it stated them first.

## Decision
State the limits explicitly rather than improve the models.

`docs/methodology.md` is the single authoritative statement of what Boxdex computes and
what it does not. It quotes every material constant from source with its file location, so
a reader can verify rather than trust. It includes an explicit "what Boxdex does not do"
list covering time alignment, phase, directivity, rigging, limiter settings, power
compression, and physical-fit checking in substitution.

Three supporting rules follow:

- **Documentation that describes an algorithm must name its source module.** When the
  algorithm changes, the doc is part of the change.
- **Judgment constants are named, not literal.** Substitution weights moved from `w0..w4`
  to `CONE_WEIGHTS` / `COMPRESSION_WEIGHTS` and are published in the methodology, so a
  reader can disagree with a specific weighting rather than with the idea of weighting.
- **Provenance claims must match the data.** `LICENSE.md` now describes the actual mix of
  sources rather than the aspirational one.

## Alternatives Considered

### Improve the models instead of documenting their limits
- Pros: addresses the underlying gap rather than disclosing it. Phase-aware crossover
  summing and bounded array coupling are both tractable.
- Cons: each is a substantial piece of work with its own validation burden, and none of
  them removes the need to state what the model still does not cover. Undocumented
  *better* models are no more trustworthy than undocumented simple ones.
- Rejected for now: documentation is a prerequisite for the model work, not a substitute
  that blocks it. The methodology doc gives any future model change a place to land.

### Add per-value provenance and tolerance fields to the driver schema
- Pros: machine-readable, filterable, surfaces provenance at the point of use rather than
  in a document a reader may not open.
- Cons: ~5,900 driver files with no reliable way to backfill the distinction
  retroactively. A `paramSource` field populated by guesswork would be worse than an
  honest catalog-wide statement that provenance is uneven.
- Deferred: worth doing for new entries. Recorded here so the option is not lost.

### Add UI-level warnings on every derived figure
- Pros: unmissable, appears exactly where the number is read.
- Cons: warning fatigue. The existing targeted disclaimers (the stack page notice, the
  crossover note, the substitution hint) already sit at the highest-risk surfaces, and
  diluting them across every figure would make all of them easier to ignore.
- Rejected: keep in-UI disclaimers targeted, put the exhaustive treatment in one document
  and link to it.

## Consequences
- `docs/methodology.md` must be updated whenever a constant or model in `src/lib/` changes.
  It quotes specific values (`DEFAULT_CREST_DB`, `AMP_EFFICIENCY`, `IEC_MIN_IMPEDANCE_RATIO`,
  the substitution weights, band edges, spectral-balance regions), so drift is possible and
  is not currently caught by any automated check.
- The substitution weights are duplicated between `src/lib/similarity.ts` and the
  methodology table. The source comment notes the dependency, but nothing enforces it.
- Stating that curves are not reliably comparable across entries, because the
  half-space / anechoic / ground-plane reference is per-entry prose and unvalidated, invites
  the obvious follow-up: make measurement conditions a validated field. That is a schema
  change affecting existing entries and is deliberately not taken here.
- The document is candid about limits a reader might otherwise not have noticed. This is
  intentional. The alternative is that a domain expert discovers them independently and
  reasonably concludes the rest of the site is equally unexamined.
