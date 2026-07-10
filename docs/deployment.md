# Deployment

## Overview

The build is a plain static site in `dist/`. Hosting is Cloudflare: files live in an R2
bucket, a Worker serves them. GitHub Actions runs the build and the sync. There is no
Cloudflare Pages or Workers Builds integration: the Git integration is disconnected.

The fully-static architecture is a deliberate privacy choice: there is no server-side
session handling, no application database, and no opportunity to log user behaviour
beyond what Cloudflare's infrastructure captures for any CDN request (IP, user-agent,
URL). We add nothing on top of that. Future write endpoints (e.g. the planned add-a-box
form) will operate on enclosure metadata only and will not require or store any personal
data.

See [ADR-003](decisions/003-r2-worker-hosting.md) for why R2+Worker over Pages/Workers
static assets, and [ADR-004](decisions/004-diffed-pr-previews.md) for the diffed PR
preview strategy.

---

## Required secrets and variables

Set these in the GitHub repo settings before any deploy runs.

**Secrets** (`Settings > Secrets and variables > Actions > Secrets`):

| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | Token with Workers:Edit and R2:Edit permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 S3-compatible access key |
| `R2_SECRET_ACCESS_KEY` | R2 S3-compatible secret key |

**Variables** (`Settings > Secrets and variables > Actions > Variables`):

| Variable | Example | Description |
|----------|---------|-------------|
| `SITE_URL` | `https://boxdex.example.workers.dev` | Canonical production URL; used by Astro for canonical links and Open Graph |
| `R2_S3_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` | R2 S3 endpoint for rclone |

---

## Infrastructure

- **R2 bucket**: `boxdex-site`. Production files live under the `production/` prefix.
  PR previews live under `previews/pr-<n>/`.
- **Worker**: `worker/index.ts`. Receives all requests, resolves URL to an R2 key,
  applies Cache-Control, handles conditional GET (ETag/304), and serves the object body.
  The `ASSET_PREFIX` var (`production` or `previews/pr-<n>`) selects which prefix to
  read from. Preview versions fall back to `production/` for keys not present in the
  preview prefix.
- **Cache API**: enabled for the `production` prefix only. Previews bypass it because
  preview URLs are reused across pushes on the same PR and a cached response from push N
  would mask push N+1.

---

## Production deploy (`main` branch)

1. `astro build` with `SITE_URL` from the Actions variable.
2. `pagefind --site dist` to generate the search index fragments.
3. `rclone sync dist r2:boxdex-site/production` (checksum-based, deletes removed files,
   `--fast-list` to keep R2 LIST calls low).
4. `wrangler deploy` to push a new Worker version with `ASSET_PREFIX=production`.

The rclone sync only uploads files whose checksums differ from what is already in R2,
so unchanged files (hashed `_assets/` chunks, unchanged pages) cost no write operations.

---

## PR preview deploy

1. Build with `SITE_URL` set to the **production URL** (same as production). This ensures
   Astro's content hashes match production and the diff is minimal. If `SITE_URL` were set
   to a preview-specific URL, every HTML file would appear changed and the diff would
   degrade to a full upload.
2. `rclone check dist r2:boxdex-site/production` to compute which files are new or
   changed vs. production.
3. Upload only the changed/new files to `r2:boxdex-site/previews/pr-<n>`.
4. `wrangler versions upload --var ASSET_PREFIX:previews/pr-<n>` to create a new Worker
   version with a unique Cloudflare preview URL.
5. Post or update a sticky comment on the PR with the preview URL
   (via `actions/github-script`).

On PR close, a `retire-preview` job purges the `previews/pr-<n>` prefix from R2 and
updates the PR comment to mark the preview as retired.

### Limitation: PR previews cannot show deletions

Removed pages still exist in `production/` and the Worker falls back to them. This is
intentional: supporting deletion previews would require either tombstone objects or a
full sync, both of which defeat the purpose of the diffed strategy.

---

## Worker internals

The Worker source is in `worker/`. The entry point (`worker/index.ts`) handles:

- Mapping request paths to R2 keys (via `worker/resolve.ts`)
- Directory index resolution (`/foo/` → `/foo/index.html`)
- 404 fallback (`404.html` from the active prefix)
- Content-Type assignment
- Cache-Control headers
- Cache API reads/writes (production prefix only)

`worker/resolve.ts` contains pure path-to-key logic with no Cloudflare types, so it can
be unit-tested in Vitest (`test/worker-resolve.test.ts`).

The Worker is excluded from the app `tsconfig.json` and uses `@cloudflare/workers-types`
via a triple-slash reference (`/// <reference types="@cloudflare/workers-types" />`).

---

## Local preview

```sh
mise run build     # build + pagefind
mise run preview   # serve dist/ locally (wrangler dev not needed for static inspection)
```

To test the Worker locally:

```sh
wrangler dev worker/index.ts   # requires local R2 binding or --remote flag
```

---

## Adding a write endpoint

The Worker's `index.ts` handles requests before the R2 lookup. A future write endpoint
(e.g. the planned add-a-box POST) can branch there by method and path, without any
change to the serving or preview architecture. See the planned-add-a-box design note in
[memory](../.config/claude/projects/…/memory/planned-add-a-box-function.md) for context.

---

## Cost notes

At current scale:

- **Worker invocations**: 100k/day free; Cache API cuts R2 reads for production.
- **R2 storage and egress**: free at this scale (egress from R2 to Workers is always free).
- **R2 Class A operations** (writes): the checksum-based sync means only changed files
  are written per deploy; unchanged chunks cost nothing.
- **R2 Class B operations** (reads): each uncached Worker invocation reads one object.
  Cache API keeps this low for production traffic.
