# boxdex full review + comment cleanup prompt

Run a full review + cleanup pass on the boxdex codebase.

## Read-only audits, run in parallel

- **agent-skills:code-reviewer** — correctness, readability, architecture, simplicity across `src/`, `worker/`, `scripts/`.
  - For every `.svelte` / `.svelte.ts` file, route through the **svelte:svelte-file-editor** agent (or at minimum load **svelte:svelte-core-bestpractices** + **svelte:svelte-code-writer**) and validate findings with the `svelte-autofixer` MCP tool — flag legacy reactive-statement patterns instead of runes (`$state`/`$derived`/`$effect`).
  - For `worker/` and `wrangler.toml`, load **cloudflare:workers-best-practices** (Worker anti-patterns: floating promises, global state, secrets, bindings, observability) and **cloudflare:wrangler** (config/CLI correctness) — check binding choices against **cloudflare:cloudflare** (KV vs D1 vs Durable Objects fit).
  - Also flag missing/stale docs in `CLAUDE.md`/`CONTRIBUTING.md`/`docs/`, and comments that are overly verbose or just restate the code.
- **agent-skills:security-auditor** — threat model the Worker: bindings, D1/KV access, secrets, input validation. Cross-check against **cloudflare:cloudflare**'s security section (WAF/secrets/bindings guidance) and **cloudflare:workers-best-practices**' anti-pattern list rather than generic web advice.
- **agent-skills:web-performance-auditor**, combined with **cloudflare:web-perf** (Chrome DevTools-measured Core Web Vitals: LCP/INP/CLS, render-blocking resources, caching) — cross-reference render/hydration cost against **svelte:svelte-core-bestpractices** to catch unnecessary reactivity or over-hydration in `.svelte` components.
- **agent-skills:test-engineer** — coverage gaps between `test/`, `e2e/`, and actual source surface.

Each agent reports concrete `file:line` findings ranked by severity, not general advice. Don't edit any code in this phase. Consolidate into one prioritized punch list at the end.

## Then, as a direct edit pass (not an audit)

- **Comment cleanup** across `src/`, `worker/`, `scripts/` — delete comments that just restate the code; keep only non-obvious WHY comments; cut multi-line blocks to one line or remove them. Route any `.svelte` file edits through **svelte:svelte-file-editor** and re-validate with `svelte-autofixer` after editing. Skip `dist/`, `node_modules/`, `.wrangler/`, `coverage/`, `test-results/`. Start from the code-reviewer's verbose-comment findings, then sweep the rest.

## Frontend + API/interface audit (read-only, no edits)

Run **agent-skills:frontend-ui-engineering** and **agent-skills:api-and-interface-design** against boxdex in review mode — apply their standards as a checklist against the *existing* code, don't build anything new.

- **agent-skills:frontend-ui-engineering** — audit `src/` (Astro pages/layouts + `.svelte` components) for:
  - accessibility gaps (WCAG: missing labels/alt text, keyboard nav, focus management, color contrast, ARIA misuse)
  - responsiveness issues (fixed widths, missing breakpoints, layout that breaks on mobile viewports)
  - state management smells (props/state that should be derived, prop-drilling, state that belongs in a store)
  - anything that reads as "AI-generated placeholder" quality rather than production-grade (inconsistent spacing/sizing, unhandled loading/error/empty states, no optimistic UI where it matters)
  - cross-check `.svelte` findings against **svelte:svelte-core-bestpractices** so accessibility/state findings don't conflict with idiomatic runes usage.
- **agent-skills:api-and-interface-design** — audit `worker/` (API routes) and `schema/` for:
  - unstable or leaky interface contracts (endpoints that expose internal DB/D1 shapes directly, inconsistent naming/casing, missing versioning where it'd matter)
  - type contract mismatches between frontend calls (`src/`) and worker responses, anywhere the two sides could drift silently
  - module boundary violations (worker logic reaching into frontend-only concerns, or vice versa)
  - REST conventions: status codes, error shape consistency, idempotency where expected
  - cross-check against **cloudflare:workers-best-practices** for Worker-specific interface conventions (binding exposure, error handling patterns).

Both report concrete `file:line` findings ranked by severity (breaking/misleading > inconsistent > cosmetic), with a one-line fix suggestion each, not general advice. Consolidate into a single prioritized punch list at the end, separate from the code-quality/security punch list produced by the earlier review pass.
