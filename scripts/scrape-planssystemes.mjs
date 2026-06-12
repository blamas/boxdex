#!/usr/bin/env node
// Mirror planssystemes.notion.site (public Notion site) to a local staging dump:
// a normalized catalog.json + downloaded plan assets (pdf/image). Importing into
// data/enclosures/ is a separate, human-reviewed step. This never fabricates
// enclosure fields.
//
// Usage: node scripts/scrape-planssystemes.mjs [--limit N]

import { writeFileSync, existsSync, mkdirSync, createWriteStream } from "fs";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const SITE = "https://planssystemes.notion.site";
const ROOT_PAGE = "df87cfc8-eb7f-46d9-9479-5bdbbb369942";
const SPACE_ID = "f698a6e4-5e74-4e8d-ba68-845642efd915";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../scrape-out/planssystemes");
const ASSET_DIR = join(OUT_DIR, "assets");

const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg !== -1 ? Number(process.argv[limitArg + 1]) : Infinity;

const HEADERS = {
  "Content-Type": "application/json",
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0",
  "Accept": "application/json",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// POST to the unofficial Notion v3 API with retry/backoff. The site intermittently
// returns 502 MemcachedCrossCellError under load.
async function api(path, body, attempt = 1) {
  try {
    const res = await fetch(`${SITE}/api/v3/${path}`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.isNotionError) throw new Error(json.name || "NotionError");
    return json;
  } catch (e) {
    if (attempt >= 5) throw e;
    await sleep(300 * 2 ** (attempt - 1));
    return api(path, body, attempt + 1);
  }
}

const loadPage = (pageId) =>
  api("loadPageChunk", {
    pageId,
    limit: 200,
    cursor: { stack: [] },
    chunkNumber: 0,
    verticalColumns: false,
  });

const blockVal = (entry) => entry?.value?.value;

function kebab(s) {
  return (s || "untitled")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "untitled";
}

// --- Stage 1: discover the plan collections from the root page ---
async function discoverCollections() {
  const { recordMap } = await loadPage(ROOT_PAGE);
  const collections = [];
  const seen = new Set();
  for (const entry of Object.values(recordMap.block)) {
    const v = blockVal(entry);
    if (v?.type !== "collection_view_page") continue;
    const collectionId = v.collection_id || v.format?.collection_pointer?.id;
    const viewId = v.view_ids?.[0];
    if (!collectionId || !viewId || seen.has(collectionId)) continue;
    seen.add(collectionId);
    collections.push({ collectionId, viewId });
  }
  return collections;
}

// --- Stage 2: enumerate every row (plan) page + the column schema ---
async function queryCollection(collectionId, viewId) {
  const res = await api("queryCollection?src=initial_load", {
    collection: { id: collectionId, spaceId: SPACE_ID },
    collectionView: { id: viewId, spaceId: SPACE_ID },
    loader: {
      type: "reducer",
      reducers: { collection_group_results: { type: "results", limit: 5000 } },
      searchQuery: "",
      userTimeZone: "Europe/Paris",
    },
  });
  const schemaRec = res.recordMap.collection?.[collectionId];
  const schema = blockVal(schemaRec)?.schema || {};
  const blockIds =
    res.allBlockIds || res.result?.reducerResults?.collection_group_results?.blockIds || [];
  return { schema, blockIds };
}

// Map a row's raw `properties` (keyed by schema id) into named fields.
function readProps(props, schema) {
  const out = {};
  for (const [id, def] of Object.entries(schema)) {
    const raw = props?.[id];
    if (raw === undefined) continue;
    const name = def.name || id;
    if (def.type === "multi_select") {
      out[name] = (raw[0]?.[0] || "").split(",").filter(Boolean);
    } else if (def.type === "number") {
      out[name] = raw[0]?.[0] != null ? Number(raw[0][0]) : null;
    } else if (def.type === "checkbox") {
      out[name] = raw[0]?.[0] === "Yes";
    } else if (def.type === "relation") {
      out[name] = (raw || []).filter((t) => t[0] === "‣").map((t) => t[1]?.[0]?.[1]).filter(Boolean);
    } else {
      out[name] = raw.map((t) => t[0]).join("");
    }
  }
  return out;
}

// Flatten a block's title rich-text to plain string.
const richText = (rt) => (rt || []).map((t) => t[0]).join("");

// --- Stage 3/4: walk a plan page into markdown + collect asset blocks ---
function walkPage(recordMap, pageId) {
  const blocks = recordMap.block;
  const md = [];
  const assets = [];
  const seen = new Set();

  const visit = (id) => {
    if (seen.has(id)) return;
    seen.add(id);
    const v = blockVal(blocks[id]);
    if (!v) return;
    const title = richText(v.properties?.title);
    switch (v.type) {
      case "header":
      case "sub_header":
        if (title) md.push(`## ${title}`);
        break;
      case "sub_sub_header":
        if (title) md.push(`### ${title}`);
        break;
      case "bulleted_list":
      case "numbered_list":
        if (title) md.push(`- ${title}`);
        break;
      case "callout":
      case "quote":
      case "text":
        if (title) md.push(title);
        break;
      case "divider":
        md.push("---");
        break;
      case "image":
      case "pdf":
      case "file": {
        const src = v.properties?.source?.[0]?.[0];
        if (src) assets.push({ type: v.type, blockId: id, source: src });
        break;
      }
    }
    for (const child of v.content || []) visit(child);
  };

  for (const child of blockVal(blocks[pageId])?.content || []) visit(child);
  return { bodyMarkdown: md.join("\n\n"), assets };
}

async function resolveSignedUrl(source, blockId) {
  const res = await api("getSignedFileUrls", {
    urls: [{ url: source, permissionRecord: { table: "block", id: blockId } }],
  });
  return res.signedUrls?.[0];
}

async function download(url, destPath, attempt = 1) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": HEADERS["User-Agent"] } });
    if (!res.ok) throw new Error(`download HTTP ${res.status}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(destPath));
  } catch (e) {
    if (attempt >= 4) throw e;
    await sleep(300 * 2 ** (attempt - 1));
    return download(url, destPath, attempt + 1);
  }
}

// Derive a flat basename from a source, which is either a Notion
// `attachment:<id>:<name>` ref or a full S3 URL.
function assetName(source, type, index) {
  const noQuery = source.split("?")[0];
  // last "/"-segment for URLs, else last ":"-segment for attachment refs
  const tail = (noQuery.includes("/") ? noQuery.split("/") : noQuery.split(":")).pop();
  const clean = decodeURIComponent(tail || "").replace(/[^\w.\-]+/g, "_");
  if (clean && /\.[a-z0-9]{2,4}$/i.test(clean)) return clean;
  const ext = type === "pdf" ? "pdf" : "bin";
  return `${type}-${index}.${ext}`;
}

async function main() {
  mkdirSync(ASSET_DIR, { recursive: true });

  const collections = await discoverCollections();
  console.log(`Discovered ${collections.length} collection(s)`);

  const catalog = [];
  const usedSlugs = new Map();
  let plansFound = 0;
  let assetsDl = 0;
  let assetsSkip = 0;
  let errors = 0;

  for (const { collectionId, viewId } of collections) {
    const { schema, blockIds } = await queryCollection(collectionId, viewId);
    console.log(`\nCollection ${collectionId}: ${blockIds.length} rows`);

    for (const rowId of blockIds) {
      if (plansFound >= LIMIT) break;
      plansFound++;

      // The row page itself carries both its collection properties and its body,
      // so a single loadPage covers metadata + notes + asset blocks.
      let row;
      let bodyMarkdown = "";
      let pageAssets = [];
      try {
        const { recordMap } = await loadPage(rowId);
        row = blockVal(recordMap.block[rowId]);
        ({ bodyMarkdown, assets: pageAssets } = walkPage(recordMap, rowId));
      } catch (e) {
        console.error(`  ! fetch ${rowId}: ${e.message}`);
        errors++;
        continue;
      }
      await sleep(200);
      if (!row) continue;

      const named = readProps(row.properties, schema);
      const title = richText(row.properties?.title) || "untitled";

      // unique slug
      let slug = kebab(title);
      const n = usedSlugs.get(slug) || 0;
      usedSlugs.set(slug, n + 1);
      if (n > 0) slug = `${slug}-${n + 1}`;

      const assetRecords = [];
      const usedNames = new Set();
      for (let i = 0; i < pageAssets.length; i++) {
        const a = pageAssets[i];
        let fname = assetName(a.source, a.type, i);
        // dedupe colliding names within this plan (e.g. two image.png)
        if (usedNames.has(fname)) {
          const dot = fname.lastIndexOf(".");
          const base = dot === -1 ? fname : fname.slice(0, dot);
          const ext = dot === -1 ? "" : fname.slice(dot);
          let k = 2;
          while (usedNames.has(`${base}-${k}${ext}`)) k++;
          fname = `${base}-${k}${ext}`;
        }
        usedNames.add(fname);
        const relPath = join("assets", slug, fname);
        const absPath = join(OUT_DIR, relPath);
        if (existsSync(absPath)) {
          assetsSkip++;
          assetRecords.push({ type: a.type, blockId: a.blockId, file: relPath });
          continue;
        }
        try {
          const signed = await resolveSignedUrl(a.source, a.blockId);
          if (!signed) throw new Error("no signed url");
          mkdirSync(dirname(absPath), { recursive: true });
          await download(signed, absPath);
          assetsDl++;
          assetRecords.push({ type: a.type, blockId: a.blockId, file: relPath });
        } catch (e) {
          console.error(`  ! asset ${slug}/${fname}: ${e.message}`);
          errors++;
        }
        await sleep(200);
      }

      catalog.push({
        id: rowId,
        slug,
        title,
        collection: collectionId,
        volumeL: named["Volume (L)"] ?? null,
        enclosureTypes: named["Enclosure type"] || [],
        driverSizes: named["Driver(s) size(s)"] || [],
        freqRanges: named["Frequency range"] || [],
        completed: named["Completed"] ?? null,
        parentId: named["Parent item"]?.[0] || null,
        subItemIds: named["Sub-item"] || [],
        props: named,
        url: `${SITE}/${rowId.replace(/-/g, "")}`,
        bodyMarkdown,
        assets: assetRecords,
      });
      console.log(`  OK  ${slug} (${assetRecords.length} assets)`);
    }
    if (plansFound >= LIMIT) break;
  }

  writeFileSync(join(OUT_DIR, "catalog.json"), JSON.stringify(catalog, null, 2) + "\n");
  console.log(
    `\nDone: ${catalog.length} plans, ${assetsDl} assets downloaded, ` +
      `${assetsSkip} assets skipped, ${errors} errors`,
  );
  console.log(`Output: ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
