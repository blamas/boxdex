# ADR-013: Privacy-preserving visitor metrics in the Worker

## Status
Accepted

## Date
2026-07-23

## Context
There was no way to answer "how many visitors, using what client, excluding bots"
for boxdex. Cloudflare Workers Observability's persisted, queryable logs only retain
`url`/`method`/`path`/`status`/timing, never `request.headers` or `request.cf`. The
richer payload (user-agent, `botManagement.score`, geo) is only visible in
Cloudflare's live tail (the dashboard's real-time log stream, same data `wrangler
tail` shows), which is ephemeral and never written to the queryable store. There is
no analytics vendor, no cookies, and no client-side script on the site, everything
here is derived server-side in the Worker from data Cloudflare already attaches to
every request.

## Decision
`worker/index.ts` logs a minimal visitor summary on `GET` requests that resolve to an
HTML document (`servedKey.endsWith(".html")`, covering the normal 200/404/304 serve
paths but not JS/CSS/image/API requests), folded into the existing `served`/
`not_modified` `console.log` line rather than a new one, so log volume per page load
is unchanged. Fields:

- `client`: a coarse `Browser/OS/device` bucket (e.g. `"Safari/iOS/mobile"`) from a
  small regex classifier in `worker/visitor.ts` (`classifyClient`). Thousands of real
  visitors share each bucket, so it carries no fingerprinting value.
- `bot`: boolean, `true` when `verifiedBot` is set or `botManagement.score` is at or
  below a threshold (`isBot`, threshold named `BOT_SCORE_THRESHOLD` in
  `worker/visitor.ts`). The raw score and `verifiedBot` flag themselves are not
  logged, only this derived boolean.
- `botCategory`: only present when `bot` is true and the bot is Cloudflare-verified,
  the raw `verifiedBotCategory` (e.g. `"search_engine"`). This identifies a known
  institutional crawler, not a person, so it's free from a privacy standpoint.
- `country`: `request.cf.country` as-is, the same granularity most public analytics
  already show.
- `visitorHash`: a truncated SHA-256 (`hashVisitor`, first 16 hex chars) of
  `${VISITOR_HASH_SALT}:${period}:${cf-connecting-ip}:${client}`, computed with
  `crypto.subtle.digest`. `period` is the UTC `YYYY-MM` month. The same visitor
  therefore hashes the same all month (enabling real monthly-unique counts and
  recognizing a returning visitor within the month) but differently next month.
  `VISITOR_HASH_SALT` is a `wrangler secret put` value (never committed, hand-declared
  on `WorkerEnv` since `wrangler-types` can't see secrets). When unset (local dev, a
  preview without the secret) `visitorHash` is simply omitted.

Raw `cf-connecting-ip` and the raw `user-agent` string are read in memory only to
derive these fields and are never logged, anywhere.

**By design, not incidental**: the monthly rotation is the property that keeps
`visitorHash` out of "personal data" territory long-term, an intentional
anonymization choice (this repo already flags France/EU caveats elsewhere, in the
licensing docs), not just an implementation detail. It trades a one-month
linkability window (recognizing a returning visitor within the same month) for
genuinely useful monthly-active-visitor counts, while remaining bounded and
non-permanent, nobody is ever linkable across months even with full log access.

**Retention ceiling**: Cloudflare Workers Logs are not retained indefinitely, so this
only answers queries within whatever window Cloudflare currently retains. A "since
launch" style query will still come back empty once data ages out. If long-term
trend data is ever wanted, it needs a separate rollup (e.g. a Cron Trigger
periodically summarizing counts into KV/R2), not built here.

## Alternatives Considered

### Third-party analytics (Cloudflare Web Analytics, Plausible, etc.)
- Pros: no code, free dashboards.
- Cons: a script or beacon on every page, another vendor's data practices, and
  zone-level analytics don't apply to a `workers.dev` deployment anyway.
- Rejected: everything needed is already available inside the Worker for free.

### Hashing the raw IP with no salt and no rotation
- Pros: simplest possible visitor key.
- Cons: a stable identifier forever, trivially reversible by brute-forcing the small
  IP space.
- Rejected: fails the actual goal of non-linkable, non-reversible counting.

### Daily rotation instead of monthly
- Pros: tighter privacy bound.
- Cons: can't recognize a returning visitor within the month, so no meaningful
  "active visitors" figure.
- Rejected: monthly-active counts are the useful signal here, and a month is still
  far from permanent tracking.

### Logging visitor fields on every request, not just HTML documents
- Pros: one code path.
- Cons: 15-20x the log volume per page load, and bot scores are unreliable on static
  assets anyway (`botManagement.staticResource`).
- Rejected: HTML-document-only matches "page view" semantics and where the score is
  trustworthy.

## Consequences
- `worker/index.ts` reads `cf-connecting-ip`/`user-agent`/`request.cf` for HTML GETs
  only, never for asset/API requests.
- One new Worker secret, `VISITOR_HASH_SALT` (setup in `docs/deployment.md`).
- `worker/visitor.ts` and `test/worker-visitor.test.ts` follow the existing
  `worker/resolve.ts` pattern: pure, Cloudflare-type-free functions, unit-tested and
  included in the coverage gate.
- Daily unique-visitor counts are still obtainable (querying distinct `visitorHash`
  within a single day is always correct, a repeat same-day visit already dedups to
  the same hash), monthly figures are the only ones for which returning-within-window
  visitors are recognized as the same visitor.
