# ADR-003: Cloudflare R2 + Worker for hosting

## Status
Accepted

## Date
2026-07-09

## Context
The site is a static build served from Cloudflare's network. The obvious choices are
Cloudflare Pages, Workers static assets, or a manual R2 + Worker setup.

The build produces roughly 24,800 files: ~5,875 drivers x 2 locales yields ~11,700
locale pages, plus ~12,000 pagefind index fragments, plus enclosure pages, API JSON
files, and hashed `_assets/` chunks.

**Hard constraint**: Cloudflare Workers static assets cap at 20,000 files per version.
Cloudflare Pages has a similar 20,000-file cap per deployment. Both are hard limits,
not soft limits that can be raised.

R2 has no object count cap and egress to Cloudflare Workers is free.

## Decision
Sync `dist/` to an R2 bucket (`boxdex-site`) via rclone (checksum-based, `--fast-list`
to keep LIST calls low). A Worker (`worker/index.ts`) receives all requests, resolves
the URL to an R2 key, applies Cache-Control, handles conditional GET (ETag/304), and
serves the object body. Cache API is used for production prefix only.

PR previews use a separate `previews/pr-<n>` prefix; the Worker falls back to
`production/` for keys the PR did not change.

## Alternatives Considered

### Cloudflare Pages
- Pros: zero-config Git integration, automatic preview deployments.
- Cons: 20,000-file cap per deployment; cannot be raised. The pagefind index alone
  pushes the build past this limit. Pages' Git integration would also bypass the
  rclone checksum sync, uploading all files on every deploy.
- Rejected: hard file cap makes it non-viable for this build size.

### Workers static assets
- Pros: native Cloudflare integration, no Worker boilerplate for file serving.
- Cons: same 20,000-file cap as Pages. No fallback mechanism for preview/production
  layering.
- Rejected: same file cap constraint.

### Netlify / Vercel
- Pros: polished DX, generous free tiers.
- Cons: no free-tier object storage for ~25k files; egress from their CDN to a user
  who isn't on their network adds latency and cost at scale.
- Rejected: cost and vendor lock-in without a meaningful technical advantage.

### GitHub Pages
- Pros: free, trivial CI integration.
- Cons: no Cache-Control customisation, no programmatic preview strategy, no
  Worker layer for future write endpoints (box-contribute). 100 MB repo size cap is
  relevant as the data directory grows.
- Rejected: insufficient control over caching and no extensibility path.

## Consequences
- The Worker is the only serving layer; it must handle `HEAD`, conditional GET, correct
  Content-Type, and cache seeding. `worker/resolve.ts` keeps the pure path-to-key
  logic free of Cloudflare types so it can be unit-tested in Vitest.
- Production deploys run rclone `sync` (checksum, deletes removed files). PR deploys
  run rclone `check` to diff against `production/` and upload only changed/new files,
  keeping PR deploy times short.
- The Worker's `ASSET_PREFIX` var is overridden per preview version; Cloudflare
  versions expose a unique preview URL per upload.
- Cache API is skipped for previews: preview URLs are reused across pushes on the same
  PR, so a cached response from push N would mask push N+1.
- Future write endpoints (box-contribute form) can branch in `worker/index.ts` before the
  R2 lookup, without changing the serving architecture.
