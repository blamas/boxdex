#!/usr/bin/env node
// Queries Cloudflare Web Analytics GraphQL API and writes three files:
//   analytics.json        raw metrics for the last 30 days
//   shields.json          shields.io endpoint badge (page views)
//   shields-top-box.json  shields.io endpoint badge (most viewed enclosure)
//
// Required env vars:
//   CF_API_TOKEN      Cloudflare API token with Account Analytics:Read
//   CF_ACCOUNT_ID     Cloudflare account ID
//   CF_ANALYTICS_TOKEN  Web Analytics site tag (same value as the beacon token)
//   SITE_URL          Production site URL, used to fetch the manifest for enclosure names
//
// Output written to process.cwd(): the workflow sets this to the analytics branch checkout.

import { writeFileSync } from "node:fs";

const { CF_API_TOKEN, CF_ACCOUNT_ID, CF_ANALYTICS_TOKEN, SITE_URL } = process.env;
if (!CF_API_TOKEN || !CF_ACCOUNT_ID || !CF_ANALYTICS_TOKEN) {
  console.error("Missing required env vars: CF_API_TOKEN, CF_ACCOUNT_ID, CF_ANALYTICS_TOKEN");
  process.exit(1);
}

const end = new Date();
const start = new Date(end);
start.setDate(start.getDate() - 30);
const fmt = (d) => d.toISOString().slice(0, 10);

const query = `{
  viewer {
    accounts(filter: {accountTag: "${CF_ACCOUNT_ID}"}) {
      totals: rumPageloadEventsAdaptiveGroups(
        filter: {
          AND: [
            {siteTag: "${CF_ANALYTICS_TOKEN}"},
            {date_geq: "${fmt(start)}"},
            {date_leq: "${fmt(end)}"}
          ]
        }
        limit: 1
        orderBy: []
      ) {
        sum { visits pageViews }
        uniq { uniques }
      }
      topPages: rumPageloadEventsAdaptiveGroups(
        filter: {
          AND: [
            {siteTag: "${CF_ANALYTICS_TOKEN}"},
            {date_geq: "${fmt(start)}"},
            {date_leq: "${fmt(end)}"}
          ]
        }
        limit: 10
        orderBy: [{sum_pageViews: DESC}]
        dimensions: [requestPath]
      ) {
        sum { pageViews }
        dimensions { requestPath }
      }
    }
  }
}`;

const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${CF_API_TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query }),
});

if (!res.ok) {
  console.error(`GraphQL request failed: HTTP ${res.status}`);
  process.exit(1);
}

const body = await res.json();
if (body.errors?.length) {
  console.error("GraphQL errors:", JSON.stringify(body.errors, null, 2));
  process.exit(1);
}

const account = body.data?.viewer?.accounts?.[0];
const totals = account?.totals?.[0];
const topPages = account?.topPages ?? [];

const visits = totals?.sum?.visits ?? 0;
const pageViews = totals?.sum?.pageViews ?? 0;
const uniques = totals?.uniq?.uniques ?? 0;

function fmtNum(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

// Extract most-viewed enclosure from top pages.
// Paths look like /en/enclosures/<slug> or /fr/enclosures/<slug>.
const ENCLOSURE_RE = /^\/[a-z]{2}\/enclosures\/([^/]+)\/?$/;
const topEnclosurePage = topPages.find((g) => ENCLOSURE_RE.test(g.dimensions.requestPath));
const topSlug = topEnclosurePage
  ? topEnclosurePage.dimensions.requestPath.match(ENCLOSURE_RE)[1]
  : null;
const topSlugViews = topEnclosurePage?.sum?.pageViews ?? 0;

// Resolve the enclosure's display name from the manifest if SITE_URL is available.
let topBoxName = topSlug;
if (topSlug && SITE_URL) {
  try {
    const manifestRes = await fetch(`${SITE_URL.replace(/\/$/, "")}/api/manifest.json`);
    if (manifestRes.ok) {
      const manifest = await manifestRes.json();
      const entry = manifest.find((r) => r.slug === topSlug);
      if (entry?.name) topBoxName = entry.name;
    }
  } catch {
    // Non-fatal: fall back to slug
  }
}

const mapped = topPages.map((g) => ({
  path: g.dimensions.requestPath,
  pageViews: g.sum.pageViews,
}));

const analytics = {
  period: { start: fmt(start), end: fmt(end) },
  updated_at: new Date().toISOString(),
  visits,
  pageViews,
  uniques,
  topPages: mapped,
  topBox: topSlug ? { slug: topSlug, name: topBoxName, pageViews: topSlugViews } : null,
};

const shields = {
  schemaVersion: 1,
  label: "page views",
  message: `${fmtNum(pageViews)} / 30d`,
  color: "f38020",
};

const shieldsTopBox = topBoxName
  ? {
      schemaVersion: 1,
      label: "top box of the month",
      message: `${topBoxName} · ${fmtNum(topSlugViews)} views`,
      color: "f38020",
    }
  : {
      schemaVersion: 1,
      label: "top box of the month",
      message: "no data yet",
      color: "lightgrey",
    };

writeFileSync("analytics.json", JSON.stringify(analytics, null, 2) + "\n");
writeFileSync("shields.json", JSON.stringify(shields, null, 2) + "\n");
writeFileSync("shields-top-box.json", JSON.stringify(shieldsTopBox, null, 2) + "\n");

console.log(`visits=${visits} pageViews=${pageViews} uniques=${uniques} topBox=${topSlug ?? "none"}`);
