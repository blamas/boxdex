# ADR-008: URL as the only client-side state persistence

## Status
Accepted

## Date
2026-07-09

## Context
Several islands manage non-trivial interactive state:

- **CatalogGrid / DriverExplorer**: active filter chips, sort order, search query.
- **StackBuilder**: per-slot driver/enclosure selection, channel overrides, crossover
  overrides.
- **Compare / DriverCompare / HornCompare**: selected items, normalise toggle.

This state must survive a page reload (so users can bookmark a configuration), be
shareable via a copy-paste URL, and work without a login or server session.

## Decision
Encode all interactive state in the URL query string and hash. `src/lib/url-state.ts`
provides the serialisation/deserialisation helpers. Islands read initial state from the
URL on mount and write back on every state change using `history.replaceState` (no
navigation, no scroll reset). The "pin/share" button in `PageActions.svelte` copies
`window.location.href`.

No `localStorage`, `sessionStorage`, `IndexedDB`, or cookie is used for interactive
state.

## Alternatives Considered

### localStorage
- Pros: survives tab close without appearing in the URL bar, larger capacity than URL.
- Cons: not shareable (two users opening the same URL see different state); not
  bookmarkable in a meaningful way, harder to clear/reset (user must know to clear
  storage vs. just editing the URL); requires explicit migration handling if the
  schema changes.
- Rejected: shareability is a first-class requirement, the "pin" feature would be
  meaningless if state were local.

### Global Svelte store (in-memory)
- Pros: simple reactive wiring, no serialisation code.
- Cons: state is lost on reload, not shareable, not bookmarkable. A store shared
  across islands via a module singleton would survive within a session but not across
  tabs or after a reload.
- Rejected: same shareability and persistence problems as localStorage.

### Server-side session (short link / slug)
- Pros: arbitrarily complex state, clean short URLs.
- Cons: requires a write endpoint and a database or KV store, the site is intentionally
  static (ADR-001) and has no server-side session infrastructure.
- Rejected: incompatible with the static architecture; overkill for the actual state
  volume.

## Consequences
- URL length is the practical limit. The StackBuilder encodes up to ~8 slots with
  driver ids, channel overrides, and crossover overrides, this stays well within the
  ~2000-character URL limit for all realistic configurations.
- State schema changes (renaming a URL param) are breaking changes for existing
  bookmarks. Parameters are kept stable, new optional params are additive.
- `history.replaceState` is called on every state change; this does not add browser
  history entries, so Back navigates away from the page rather than stepping through
  filter states. This is intentional: filter history inside a catalog page is not
  useful.
- Islands must handle the case where URL params are absent or invalid (first visit,
  corrupted link). `url-state.ts` parsers return safe defaults for missing/unparseable
  values.
