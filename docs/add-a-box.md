# Add-a-box feature

## Context

Boxdex is a fully static Astro site served from an R2 bucket by a read-only
Cloudflare Worker (`worker/index.ts`), and all content lives as files in git
(`data/enclosures/<slug>/index.mdx` plus sibling assets). Contributing a box
today means writing MDX frontmatter by hand and opening a GitHub PR, a wall for
non-technical builders.

Goal: a public web form on the site that lets anyone submit a complete box, plus
a new Worker endpoint that opens a GitHub PR with the generated files. The
maintainer reviews and merges the PR manually. Decisions locked in:

- **Full-fidelity form**: every enclosure frontmatter field, including
  `simulations[]`, `measurements[]`, `sources[]`, `revision`, `ways`.
- **Full uploads**: curve CSVs, PDF plans, and images are uploaded and committed
  as real files alongside `index.mdx`.
- **Cloudflare Turnstile** guards the endpoint against bot/spam PRs.
- **GitHub App** identity opens the PRs (installation token minted per request).

This is the first mutating surface in the Worker, its first outbound `fetch`,
and its first secrets. The header comment at `worker/index.ts:2` already
anticipates it ("The add-a-box POST will branch here before the lookup").

## Architecture overview

```
Browser form (Svelte island)                    Cloudflare Worker
  /[locale]/contribute                            POST /api/add-box
  - full frontmatter inputs        multipart/     1. verify Turnstile token
  - driver picker (validated)  ->  form-data   -> 2. validate payload (shared zod)
  - repeatable sim/meas/source     + Turnstile    3. mint GitHub App install token
  - file uploads (csv/pdf/img)     token          4. build files (index.mdx + assets)
  - client-side zod validation                    5. Git Data API: branch+tree+commit+PR
  - shows returned PR URL          <- {prUrl} --  6. return PR url (or 4xx w/ errors)
```

The PR's CI build (`astro sync` / `mise run build`) remains the final
correctness gate: dangling driver refs, schema violations, and license rules all
fail the build and show up as red checks on the PR.

## Part 1 - Shared, environment-agnostic enclosure schema

The enclosure schema is currently inline in `src/content.config.ts` and uses
`reference("drivers")` and `image()`, which only work inside Astro's content
layer, so neither the browser island nor the Worker can reuse it. Mirror the
driver/horn pattern (`src/lib/schemas.ts`) instead:

- Add `enclosureFrontmatterSchema` to **`src/lib/schemas.ts`** as a plain zod
  object: identical to the inline schema but with `reference("drivers")` becoming
  `z.string()` (driver ids), `image()` becoming `z.string()` (filename), and the
  `simulations`/`measurements` `driver` arrays as `z.array(z.string()).min(1)`.
  Keep the two `.superRefine` license rules and the `count`/`spl_stacked`
  coupling here so client, Worker, and build all agree.
- In **`src/content.config.ts`**, define the collection as
  `enclosureFrontmatterSchema.extend({ ... })` where the extend re-declares
  `drivers`, `images`, `simulations`, `measurements` with their reference/image
  variants, then re-applies `.superRefine(...)`. Referential and image checks
  stay build-time only, scalar fields come from the shared schema (single source
  of truth, no drift).
- Export the inferred `EnclosureFrontmatter` type for the island and Worker.
- Regenerate mirrors: extend `npm run schema:gen` to also emit
  `schema/enclosure.schema.json` from the shared schema (today only driver/horn
  are mirrored). The CI drift check then covers it.

## Part 2 - Contribute page and form island

- **Page**: `src/pages/[locale]/contribute.astro` (mirrors `stack.astro`):
  `export { localeStaticPaths as getStaticPaths }`, `useLocale(Astro.params)`,
  wraps `<ContributeBox client:only="svelte" t={t.contribute} ... />` in
  `Layout`. Add a nav link in `src/components/Layout.astro` (the `.nav-links`
  block) via `navHref("/contribute")`.
- **Island**: `src/components/ContributeBox.svelte`, following the StackBuilder
  pattern (Svelte 5 runes `$state`/`$derived`/`$effect`, controlled inputs with
  `oninput` handlers, not `<form>` semantics). Sections:
  - Basics: `name`, `category`, `topology`, `topologyVariant`, `ways`,
    `revision`, `buildComplexity`. `verified` is omitted (reviewer-only).
  - Drivers: multiselect built on the existing `src/components/Combobox.svelte`,
    fed by `fetch(\`${BASE}/api/drivers.json\`)` on mount so ids validate against
    the real catalog (also reused for the `driver[]` arrays in sim/meas rows).
  - Dimensions and volumes and plywood: `dims{h,w,d}`, `netVolumeL`,
    `grossVolumeL`, `weightKg`, `plywoodThicknessMm`, `sheetCount`, `sheetSizeMm`.
  - Specs: all `specs.*` fields (`f3Hz` required), grouped under an
    `.advanced-toggle` so casual submitters are not overwhelmed.
  - Repeatable rows for `simulations[]`, `measurements[]`, `sources[]` with
    add/remove buttons. Each sim/meas row: `driver[]` (Combobox), `kind`,
    `source`, `note`, a file input for the CSV, and a `count` field shown only
    when `kind === spl_stacked`.
  - Files: image uploads (`images[]`), PDF plan uploads (`plans[]`). Enforce
    allowed extensions plus per-file and total size caps client-side.
  - License: `license` select (required, no default), `licenseNote`, `author`,
    `sourceUrl`. Enforce both cross-field rules inline (mirrors the schema's
    `superRefine`) with clear messages.
  - Body: a textarea for the free-form MDX build-notes body.
- **Validation**: run `enclosureFrontmatterSchema.safeParse` client-side, surface
  `issue.path.join(".")` plus `issue.message` next to fields (same formatting as
  `scripts/validate-driver.mjs`). Block submit while invalid.
- **Submit**: assemble `FormData` with a `payload` JSON part (frontmatter plus
  body), one part per uploaded file (field name references the frontmatter
  filename), and the Turnstile token, then `POST ${BASE}/api/add-box`. On 200
  show the returned PR URL and a success state, on 4xx render server-side field
  errors.
- **i18n**: add a `pages.contribute` block and a `contribute` island block to
  both `src/i18n/locales/en.json` and `fr.json` (en is the schema of record).
  Reuse existing `categoryLabels`, `curveLabels`, and taxonomy-derived option
  lists.
- **Turnstile widget**: load
  `https://challenges.cloudflare.com/turnstile/v0/api.js` and render the widget
  with the public site key (safe to bake in). Because islands are `client:only`,
  add the script tag/init in the island or page as an `is:inline` block guarded
  against double-registration.

## Part 3 - Worker POST endpoint

Add the branch at the top of `worker/index.ts:fetch`, right after `new URL(...)`
and **before** the GET/HEAD method gate, delegating to a new testable module:

```ts
if (url.pathname === "/api/add-box" && request.method === "POST") {
  return handleAddBox(request, env, ctx);
}
```

- **New module `worker/add-box.ts`** (imported like `resolve.ts`, pure helpers
  unit-tested per the `worker-resolve.test.ts` pattern). Flow:
  1. Parse `request.formData()`. Extract `payload` JSON plus files.
  2. **Verify Turnstile**: POST token plus `env.TURNSTILE_SECRET` to
     `https://challenges.cloudflare.com/turnstile/v0/siteverify`. Reject on fail.
  3. **Validate payload** with the shared `enclosureFrontmatterSchema` (imported
     from `src/lib/schemas.ts`, dependency-free zod, bundlable into the Worker).
     Enforce the file allowlist (`.csv`/`.pdf`/`.jpg`/`.png`), per-file and total
     size caps, image count cap, and that every frontmatter-referenced filename
     (`simulations[].file`, `measurements[].file`, `plans[]`, `images[]`,
     `sources[].file`) has a matching upload and vice-versa. Return 4xx with a
     field-keyed error list on failure.
  4. **Slug**: kebab-case `name`, check `data/enclosures/<slug>/` existence via
     the GitHub contents API and de-dupe with a numeric suffix if taken.
  5. **Serialize** frontmatter to YAML plus body into `index.mdx` (a small
     deterministic YAML emitter in `add-box.ts`, respecting the repo punctuation
     rules: no em dashes, no semicolons).
  6. **GitHub App auth**: sign an RS256 JWT with `env.GITHUB_APP_PRIVATE_KEY`
     using `crypto.subtle` (Workers WebCrypto supports RSASSA-PKCS1-v1_5 plus
     SHA-256 natively, no library, no `nodejs_compat`), exchange it at
     `POST /app/installations/{env.GITHUB_APP_INSTALLATION_ID}/access_tokens`
     for a short-lived installation token.
  7. **Open PR via Git Data API** (multi-file commit): get base `main` SHA,
     create blobs (text for mdx/csv, base64 for pdf/img), create tree, create
     commit, create ref `refs/heads/contribute/<slug>`, then `POST /pulls` with
     title `Add box: <name>`, a body summarizing submitted fields plus author,
     and the `add-a-box` label.
  8. Return `{ prUrl }` JSON (200) or a structured error (4xx/5xx).
- **CSP**: widen the HTML CSP at `worker/index.ts:91` to allow Turnstile: add
  `https://challenges.cloudflare.com` to `script-src` and add a
  `frame-src https://challenges.cloudflare.com` directive (the widget runs in an
  iframe). `connect-src` stays `'self'` (the form posts same-origin, siteverify
  is server-side). Simplest to widen globally, low risk.
- **`Env` interface** gains: `GITHUB_APP_ID` (var), `GITHUB_APP_INSTALLATION_ID`
  (var), repo owner/name (vars, default `blamas/boxdex` from `GIT_REPO_URL`),
  `GITHUB_APP_PRIVATE_KEY` (secret), `TURNSTILE_SECRET` (secret). The public
  Turnstile site key is a build-time env for the island. Add vars to
  `wrangler.toml [vars]`, set secrets via `wrangler secret put`.

## Part 4 - GitHub App and Cloudflare setup (manual, one-time)

Out-of-band steps, not code:

1. Register a GitHub App on the `blamas/boxdex` repo: permissions Contents:write
   plus Pull requests:write, install it, note App ID plus Installation ID,
   generate a private key (PEM).
2. Create a Turnstile widget (managed mode), note the site key (public) plus
   secret.
3. `wrangler secret put GITHUB_APP_PRIVATE_KEY` and
   `wrangler secret put TURNSTILE_SECRET`, add the non-secret ids to
   `wrangler.toml [vars]`.
4. Preview deploys (`versions upload`) do not inherit secrets automatically.
   Decide whether the endpoint is live on PR previews or production-only (default
   recommendation: production-only, the island can hide/disable submit when not
   on the production origin).

## Files to touch

- `src/lib/schemas.ts` - add `enclosureFrontmatterSchema` plus inferred type
- `src/content.config.ts` - consume shared schema via `.extend()` for the
  reference/image fields
- `package.json` / schema-gen script - emit `schema/enclosure.schema.json`
- `src/pages/[locale]/contribute.astro` - new page (pattern: `stack.astro`)
- `src/components/ContributeBox.svelte` - new form island
- `src/components/Layout.astro` - nav link
- `src/i18n/locales/en.json` and `fr.json` - `pages.contribute` plus `contribute`
- `worker/index.ts` - POST branch, widened CSP, `Env` fields
- `worker/add-box.ts` - new module (Turnstile, validation, YAML, JWT, GitHub API)
- `wrangler.toml` - `[vars]` for app/repo ids
- `test/worker-add-box.test.ts` - unit tests for pure helpers
- this doc updated with the finalized manual setup steps

## Reuse (do not re-declare)

- Page/island wiring: `stack.astro` plus `StackBuilder.svelte` patterns, and
  `Combobox.svelte`
- `BASE` and `GIT_REPO_URL` from `src/lib/site.ts` (never re-derive)
- i18n via `useLocale` and props into the island, en.json is schema of record
- Global CSS classes (`.chip`, `.advanced-toggle`, `.card`, `.empty-state`,
  `.filter-row`, skeleton) and design tokens, no hardcoded colors
- zod error formatting from `scripts/validate-driver.mjs`
- Worker module plus unit-test pattern from `resolve.ts` and
  `test/worker-resolve.test.ts`

## Verification

- `mise run check`, `mise run lint`, `mise run knip` clean.
- Unit tests (`mise run test`) for `worker/add-box.ts` pure helpers: slug
  de-dupe, YAML emit round-tripping through the shared schema, payload validation
  (missing file, extra file, bad extension, oversize, license rules,
  spl_stacked count), and JWT header/claim shape.
- Client validation: load `/contribute` in `mise run dev`, submit an invalid
  form, confirm field errors mirror build errors, then submit a valid minimal
  box and a full-fidelity box with uploads.
- End-to-end against GitHub: point the App at a throwaway branch/repo first,
  submit from a `wrangler dev` (or preview) session, confirm a PR is opened with
  `index.mdx` plus all asset files and correct content, then confirm that PR's CI
  build passes (proving the generated frontmatter satisfies the real content
  schema). Test Turnstile rejection with a bad token (expect 4xx, no PR).
- Regression: existing GET serving, 404, cache, and 304 paths in `worker/index.ts`
  still behave (the POST branch returns before the method gate).
