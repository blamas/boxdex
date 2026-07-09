# ADR-005: Discriminated union for the driver data model

## Status
Accepted

## Date
2026-07-09

## Context
Boxdex catalogs two fundamentally different transducer types:

- **Cone drivers** (woofers, mids): characterised by Thiele-Small parameters (Fs, Qts,
  Vas, Xmax, Sd, …) used for enclosure tuning calculations (EBP, Vb hints).
- **Compression drivers** (horn HF units): characterised by throat exit diameter, voice
  coil size, frequency range, protection crossover floor, and horn sensitivity
  (`sensitivityHornDb` on a reference horn), none of which are Thiele-Small.

The two types share a small base (brand, model, impedance, power rating) but their
meaningful fields are disjoint. A cone carrying CD-only fields (or vice-versa) is a
data error that must be caught at build time, not silently ignored.

## Decision
Model drivers as a `z.discriminatedUnion("type", [coneDriverSchema, compressionDriverSchema])`
in `src/lib/schemas.ts`. The `type` field (`"cone"` | `"compression"`) is required in
every driver JSON file. Files live under `data/drivers/cone/` or
`data/drivers/compression/` for organisation, but the **id is the bare filename**; the
folder is not part of the identity.

Islands receive the inferred `Driver` type from `src/lib/schemas.ts` via type-only
imports; zod never reaches a browser bundle.

## Alternatives Considered

### Single flat schema with all fields optional
- Pros: simpler schema, one type everywhere.
- Cons: any field is valid on any driver; a CD sensitivity value silently accepted on a
  cone driver would corrupt SPL calculations. TypeScript would have no way to narrow
  which fields are present. EBP hints and Vb calculations would need defensive checks
  throughout.
- Rejected: data integrity depends on the discriminant being enforced, not on
  contributor discipline.

### Two separate Astro content collections (`drivers-cone`, `drivers-compression`)
- Pros: each collection has its own schema; no union type needed.
- Cons: enclosure frontmatter references drivers by id; with two collections the
  reference resolution would need to search both, and the UI's "all drivers" catalog
  view would need to merge and sort two separate collections. The union type is cleaner.
- Rejected: the discriminated union gives the same type safety in one collection with
  simpler reference resolution.

### Horns as a third driver variant
- The horn/waveguide catalogue is physically stored under `data/drivers/horns/` but is
  its own Astro collection excluded from the drivers glob (`pattern: ["cone/**",
  "compression/**"]`). Horns are not transducers; they mate with compression drivers
  via `exitInch` throat match. Treating them as a third driver variant would conflate
  two different domain concepts.
- Rejected: horns are a separate catalogue, not a driver type.

## Consequences
- Any caller that needs cone-only fields (EBP, Vb hint, free-field sensitivity) must
  gate on `d.type === "cone"`. This is enforced by the TypeScript discriminated union;
  accessing a cone-only field on an unnarrowed `Driver` is a type error.
- `sensitivityHornDb` (CD on a reference horn) and `sensitivityDb` (cone free-field)
  are distinct fields with different semantics and must never be used interchangeably.
- Adding a new driver type in the future requires a new zod schema variant and a new
  literal in the discriminated union. The folder under `data/drivers/` and the
  collection glob pattern both need updating.
- `minCrossoverHz` on compression drivers is the CD's protection floor. For multi-way
  enclosures with internal crossovers, this floor does not constrain the system
  crossover; it is baked into the `EnclosureRecord` only for all-compression boxes.
