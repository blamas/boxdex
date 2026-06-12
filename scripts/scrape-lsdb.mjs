#!/usr/bin/env node
// Scrape loudspeakerdatabase.com for a given brand and write driver JSON files.
// Usage: node scripts/scrape-lsdb.mjs <BrandSlug> <filePrefix> <"Brand Name">
//   e.g. node scripts/scrape-lsdb.mjs 18Sound 18s "Eighteen Sound"
//        node scripts/scrape-lsdb.mjs RCF rcf RCF
//        node scripts/scrape-lsdb.mjs PrecisionDevices pd "Precision Devices"

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const BASE = "https://loudspeakerdatabase.com";
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../data/drivers");

const [, , brandSlug, filePrefix, ...brandNameParts] = process.argv;
const brandName = brandNameParts.join(" ");
if (!brandSlug || !filePrefix || !brandName) {
  console.error("Usage: scrape-lsdb.mjs <BrandSlug> <filePrefix> <Brand Name>");
  process.exit(1);
}

const DELAY = 2500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  "Accept-Encoding": "identity",
};

async function fetchText(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, { headers: HEADERS });
    if (res.status === 429) {
      const wait = (i + 1) * 8000;
      console.warn(`  429 rate limit, waiting ${wait}ms...`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }
  throw new Error("Max retries exceeded (429)");
}

// Find first <strong>value</strong> in a <li> that contains labelFragment anywhere in it
function liValue(html, labelFragment) {
  // Find any occurrence of the label
  let pos = 0;
  while (pos < html.length) {
    const idx = html.indexOf(labelFragment, pos);
    if (idx === -1) return null;
    // Walk back to find the enclosing <li
    const liStart = html.lastIndexOf("<li", idx);
    if (liStart === -1) { pos = idx + 1; continue; }
    const liEnd = html.indexOf("</li>", idx);
    if (liEnd === -1) { pos = idx + 1; continue; }
    const liHtml = html.slice(liStart, liEnd);
    const sIdx = liHtml.indexOf("<strong>");
    if (sIdx === -1) { pos = idx + 1; continue; }
    const eIdx = liHtml.indexOf("</strong>", sIdx);
    const raw = liHtml.slice(sIdx + 8, eIdx).replace(",", ".");
    const val = parseFloat(raw);
    if (!isNaN(val)) return val;
    pos = idx + 1;
  }
  return null;
}

function parseDriver(html, slug) {
  // Model from <h1>
  const h1 = html.match(/<h1[^>]*>(.*?)<\/h1>/s);
  const title = h1 ? h1[1].replace(/<[^>]+>/g, "").trim() : slug;
  const model = title.replace(new RegExp(`^${brandName}\\s*`, "i"), "").trim() || slug;

  // Impedance: from <p>8Ω</p> pattern near top of page
  const impMatch = html.match(/<p>\s*([\d.]+)\s*Ω\s*<\/p>/);
  const imp = impMatch ? parseFloat(impMatch[1]) : null;

  // Size: "Nominal diameter <strong>21</strong>"
  const sizeMatch = html.match(/[Nn]ominal diameter[^<]*<strong>([\d.]+)<\/strong>/);
  const sizeInch = sizeMatch ? parseFloat(sizeMatch[1]) : null;

  // TS params
  const fs   = liValue(html, "Resonance frequency");
  const qts  = liValue(html, "Total quality factor");
  const qes  = liValue(html, "Electrical quality factor");
  const qms  = liValue(html, "Mechanical quality factor");
  const vas  = liValue(html, "Equivalent volume");
  const sd   = liValue(html, "Effective area") ?? liValue(html, "Effective piston area");
  const xmax = liValue(html, "Maximum linear excursion") ?? liValue(html, "Maximum excursion");
  const re   = liValue(html, "DC resistance");
  const bl   = liValue(html, "Force factor");
  const mms  = liValue(html, "Moving mass");
  const sens = liValue(html, "Sensitivity");

  // Power: prefer "Power handling P" (AES nominal) over program power
  const pe = liValue(html, "Power handling") ?? liValue(html, "Program power");

  const missing = [];
  if (!fs)       missing.push("fsHz");
  if (!qts)      missing.push("qts");
  if (!vas)      missing.push("vasL");
  if (!sd)       missing.push("sdCm2");
  if (!xmax)     missing.push("xmaxMm");
  if (!pe)       missing.push("peW");
  if (!sens)     missing.push("sensitivityDb");
  if (!imp)      missing.push("impedanceOhm");
  if (!sizeInch) missing.push("sizeInch");

  if (missing.length > 0) return { skip: true, reason: `missing: ${missing.join(", ")}`, model };

  const obj = {
    brand: brandName,
    model,
    sizeInch,
    impedanceOhm: imp,
    fsHz: fs,
    qts,
    ...(qes  != null && { qes }),
    ...(qms  != null && { qms }),
    vasL: vas,
    sdCm2: sd,
    xmaxMm: xmax,
    ...(re  != null && { reOhm: re }),
    ...(bl  != null && { bl }),
    ...(mms != null && { mmsG: mms }),
    peW: pe,
    sensitivityDb: sens,
    datasheetUrl: `${BASE}/${brandSlug}/${slug}`,
  };

  return { skip: false, obj, model };
}

function toFilename(model, imp) {
  const m = model.toLowerCase()
    .replace(/[Ωω]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const i = String(imp).replace(/[^0-9]/g, "");
  return `${filePrefix}-${m}-${i}.json`;
}

async function main() {
  console.log(`Fetching brand page: ${BASE}/${brandSlug}`);
  const brandHtml = await fetchText(`${BASE}/${brandSlug}`);

  const re = new RegExp(`href="/${brandSlug}/([^"?#]+)"`, "g");
  const slugs = [...new Set([...brandHtml.matchAll(re)].map((m) => m[1]))];
  console.log(`Found ${slugs.length} model slugs\n`);

  let written = 0, skipped = 0;

  for (const slug of slugs) {
    await sleep(DELAY);
    const url = `${BASE}/${brandSlug}/${slug}`;
    let html;
    try {
      html = await fetchText(url);
    } catch (e) {
      console.log(`  SKIP ${slug}: ${e.message}`);
      skipped++;
      continue;
    }

    const result = parseDriver(html, slug);
    if (result.skip) {
      console.log(`  SKIP ${result.model || slug}: ${result.reason}`);
      skipped++;
      continue;
    }

    const { obj, model } = result;

    if (obj.sizeInch < 10) {
      console.log(`  SKIP ${model}: ${obj.sizeInch}" < 10"`);
      skipped++;
      continue;
    }

    const filename = toFilename(model, obj.impedanceOhm);
    writeFileSync(join(OUT_DIR, filename), JSON.stringify(obj, null, 2) + "\n");
    console.log(`  OK   ${filename}  (${obj.sizeInch}" ${obj.impedanceOhm}Ω, ${obj.peW}W, ${obj.sensitivityDb}dB)`);
    written++;
  }

  console.log(`\nDone: ${written} written, ${skipped} skipped`);
}

main().catch((e) => { console.error(e); process.exit(1); });
