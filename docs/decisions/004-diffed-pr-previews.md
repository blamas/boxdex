# ADR-004: Diffed PR preview deployments

## Status
Accepted

## Date
2026-07-09

## Context
PR preview deployments let contributors see their changes on a live URL before merge.
A naive approach uploads the full build (~25k files) on every PR push. At this file
count that is slow (several minutes of rclone transfer) and wastes R2 Class A operation
costs.

The Worker already supports a prefix chain: `previews/pr-<n>` falls back to
`production/` for keys that do not exist in the preview prefix. This means a preview
only needs the files that differ from production.

## Decision
On every PR push:
1. Build the site with `SITE_URL` set to the production URL so HTML page hashes match
   production, minimising the diff.
2. Run `rclone check dist r2:boxdex-site/production --missing-on-dst .preview-new
   --differ .preview-changed` to compute the diff vs. the live production prefix.
3. Upload only the files listed in `.preview-new` + `.preview-changed` to
   `previews/pr-<n>` using `rclone copy --files-from-raw`.
4. Deploy a new Worker version with `--var ASSET_PREFIX:previews/pr-<n>` to get a
   unique preview URL.
5. Post or update a sticky PR comment with the preview URL.
6. On PR close: purge the `previews/pr-<n>` prefix and update the comment.

## Alternatives Considered

### Full sync on every push
- Pros: simpler workflow, no diff logic.
- Cons: uploading 25k files on every push takes 3-5 min of rclone transfer and
  generates thousands of R2 Class A (write) operations per PR push.
- Rejected: too slow and too expensive at this file count.

### Cloudflare Pages automatic previews
- Rejected upstream in ADR-003 (file cap). Also: Pages uploads the full build on
  every push, which hits the same cost problem at scale.

### Skip previews entirely
- Pros: no CI complexity.
- Cons: contributors cannot visually verify content changes (new enclosure pages,
  chart rendering, locale strings) before merge. Build errors that pass type-check
  but produce broken HTML would reach production.
- Rejected: preview is a meaningful quality gate for a content-heavy site.

## Consequences
- `SITE_URL` must be set to the production URL during PR builds so that Astro's
  canonical URL hashing matches production, keeping the diff small. If `SITE_URL`
  diffed, every HTML file would appear changed and the diffed strategy would degrade
  to a full upload.
- PR previews cannot preview deletions: removed pages still exist in `production/` and
  the Worker falls back to them. This is an acceptable limitation, deletion previews
  would require either uploading a tombstone object or a full sync.
- The `rclone check` step exits non-zero whenever differences exist (normal for any
  PR), so it runs with `continue-on-error: true`. A missing `.preview-new` file (no
  new files at all) causes the collect step to fail fast, which is the correct
  behaviour: a PR that only deletes files has nothing to upload.
