# ADR-011: Add-a-box contribution pipeline (Worker-opened GitHub PRs)

## Status
Accepted

## Date
2026-07-12

## Context
All content lives as files in git (`data/enclosures/<slug>/index.mdx` plus sibling
assets), validated at build time. Contributing a box meant hand-writing MDX
frontmatter and opening a GitHub PR, a wall for non-technical builders. The goal is a
public web form that accepts a complete box (every frontmatter field, plus curve CSV,
PDF plan and image uploads) while keeping the maintainer-review-then-merge workflow
and the CI build as the correctness gate.

This is the first mutating surface in the Worker, its first outbound `fetch`, and its
first secrets.

## Decision
A `/[locale]/contribute` Svelte island posts `multipart/form-data` to
`POST /api/add-box` on the same Worker that serves the site (`worker/add-box.ts`,
branched in `worker/index.ts` before the R2 read path). The Worker verifies a
Cloudflare Turnstile token, runs structural guards only, mints a GitHub App
installation token, and uses the Git Data API to push a `contribute/<slug>` branch
and open a labelled PR against `main`. The response is the PR URL. Nothing is
published without a maintainer merging.

Validation is split in three deliberate layers:

- **Island**: the shared `enclosureFrontmatterSchema` runs client-side for inline
  field errors. This is the one documented exception to the "zod stays out of client
  bundles" rule, client-side validation is the point of the form.
- **Worker**: structural guards only, no runtime zod. The pure validators (upload
  caps, extension roles, filename<->upload matching, required-field presence) live in
  `src/lib/contribute.ts`, imported by both the island and the Worker so the two
  cannot drift. Local validation runs before the Turnstile `siteverify` call so a
  fixable 422 never consumes the single-use token, and a `content-length` guard
  rejects oversized bodies before buffering.
- **CI**: the PR build (`astro sync`) is the final gate for schema correctness,
  dangling driver refs, and license rules.

The emitted `index.mdx` frontmatter goes through an allowlist YAML emitter:
`KEY_ORDER` fixes field order, is compile-time checked against the schema keys
(`tsc -p worker` fails if a schema field is unlisted), excludes `verified`
(contributions cannot self-verify), and quotes any key that could alter YAML
structure.

Submissions are **production-only**: the GitHub App private key and Turnstile secret
exist only on the production Worker, and the island disables submit when
`window.location.origin` is not the production origin. Dev and PR previews still
render the form and preview client-side validation.

## Alternatives Considered

### GitHub issue forms (contributor fills a template, maintainer commits files)
- Pros: zero new code, no secrets in the Worker.
- Cons: no file uploads, every submission needs manual transcription, no CI
  validation until the maintainer has already done the work.
- Rejected: moves the wall from the contributor to the maintainer instead of
  removing it.

### Direct commit to `main` from the Worker
- Pros: simplest happy path.
- Cons: no review gate, spam or malformed data goes live, licensing mistakes ship.
- Rejected: the PR is the review queue, and CI on the PR is the validation gate.

### Full zod validation in the Worker
- Pros: 422s catch everything before a PR exists.
- Cons: bundles `astro/zod` into the Worker, duplicates the error surface, and CI is
  still required for referential checks (driver ids against the catalog), so it
  cannot replace the build gate anyway.
- Rejected: structural guards + CI keep one source of truth. Shared pure guards in
  `src/lib/contribute.ts` (zod-free at runtime, type-only schema imports) give the
  Worker and island identical caps and messages without the bundle cost.

### Per-contributor GitHub identity (OAuth, fork + PR as the user)
- Pros: attribution for free, no bot identity.
- Cons: requires every contributor to have and connect a GitHub account.
- Rejected: defeats the non-technical-builder goal. Attribution is carried by the
  `author` frontmatter field instead.

### Third-party form backend (Formspree-style) feeding a manual PR
- Pros: no Worker changes.
- Cons: uploads live outside git, another vendor, still manual PR assembly.
- Rejected: the Worker already fronts every request and the Git Data API does the
  whole job server-side.

### CAPTCHA alternatives (hCaptcha, reCAPTCHA)
- Pros: interchangeable in principle.
- Cons: third-party origin in the CSP, separate account, reCAPTCHA tracking.
- Rejected: Turnstile is native to the Cloudflare stack already serving the site,
  free, and needs only `challenges.cloudflare.com` in `script-src`/`frame-src`.

## Consequences
- The Worker gains secrets (`GITHUB_APP_PRIVATE_KEY`, `TURNSTILE_SECRET`) and one
  write path. Setup runbook in `docs/deployment.md`.
- A GitHub App scoped to this repo (Contents + Pull requests, read and write) is a
  standing credential able to open PRs. Its blast radius is limited by the emitter
  allowlist (paths are always `data/enclosures/<slug>/…`) and by review-before-merge.
- Schema field additions flow automatically: the form derives its spec inputs from
  the schema shape, and `KEY_ORDER` drift is a compile error instead of silent data
  loss.
- Preview deploys cannot exercise the endpoint (no secrets), so end-to-end testing of
  the submit path happens against production only.
