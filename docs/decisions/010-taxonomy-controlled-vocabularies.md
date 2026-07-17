# ADR-010: Taxonomy-driven controlled vocabularies

## Status
Accepted

## Date
2026-07-09

## Context
Several fields across the enclosure and horn schemas accept values from a closed list:
`topology`, `topologyVariant`, `recommendedFor`, `connectors`, `license`, `hornProfile`.
These lists need to be:

- Enforced at build time (an out-of-list value fails the build, not silently passes).
- Editable by contributors who are adding content, not modifying application code.
- Consistent between the zod validation schema and any UI that renders the values
  (filter chips, glossary anchors, display labels).

The alternative is to hardcode the enum values directly in `src/lib/schemas.ts` or
`src/content.config.ts`.

## Decision
Controlled vocabularies live in `data/taxonomy.json`. The `enumOf(field)` helper in
`src/lib/schemas.ts` reads the JSON at build time and converts each array to a
`z.enum([...])`. A `null` value in the JSON means the field is free-form (`z.string()`).

Adding a new topology value: edit `data/taxonomy.json`, add the glossary entry at
`/glossary#<topology>` (enforced by convention, not by the build), and the new value
becomes valid in enclosure frontmatter immediately.

## Alternatives Considered

### Hardcode enums in `src/lib/schemas.ts`
- Pros: type-safe in TypeScript (literal union types), no runtime JSON import.
- Cons: adding a taxonomy value requires a code change, schema regeneration
  (`npm run schema:gen`), and a commit that touches `src/`. Contributors adding
  content must understand the schema code. The enum values are duplicated between the
  zod schema and any place that renders them (filter chips, display labels).
- Rejected: vocabulary additions are data changes, not code changes, conflating the
  two raises the barrier for content contributors.

### Separate TypeScript file of const arrays
- Pros: type-safe, importable in both schemas and UI without a JSON import.
- Cons: same friction as hardcoded enums for content contributors. Still requires a
  code commit for every vocabulary addition. Prettier/Biome formatting of TS arrays
  is noisier than JSON.
- Rejected: same contributor friction as the hardcoded approach.

### Derive vocabularies from existing data (scan `data/` at build time)
- Pros: no manual taxonomy file, adding a new topology is implicit from the first
  enclosure that uses it.
- Cons: the first use of a new value would succeed silently even if misspelled.
  The vocabulary becomes open by default (any string is valid until two entries
  conflict), which defeats the build-time enforcement goal. UI filter chips would
  show values that only appear once.
- Rejected: build-time enforcement requires an explicit list, not an inferred one.

## Consequences
- `data/taxonomy.json` is the single source of truth for all closed enums. Adding a
  value there is sufficient, no code change needed.
- The JSON import loses TypeScript literal types, so `enumOf()` casts to
  `[string, ...string[]]` to satisfy `z.enum`'s non-empty tuple requirement. The
  type of fields using `enumOf()` is `string` in TypeScript, not a narrow literal
  union. This is an acceptable trade-off: validation happens at build time via zod,
  not at the TypeScript type level.
- When adding a topology value, a matching glossary entry at `/glossary#<topology>`
  is expected (enclosure pages deep-link to it). This is enforced by convention;
  the build does not currently verify the anchor exists.
- `null` in `taxonomy.json` signals a free-form field. This distinction must be
  preserved when editing the file: changing an array to `null` removes build-time
  enforcement for that field.
