#!/usr/bin/env node
// Scrape petoindominique.fr/php/mysql_listehp3.php for a brand
// Usage: node scripts/scrape-petoin.mjs <"BRAND NAME"> <filePrefix> <"Brand Name">
// e.g.: node scripts/scrape-petoin.mjs "FAITAL PRO" faital "FaitalPRO"

import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const BASE = "https://www.petoindominique.fr/php/mysql_listehp3.php";
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../data/drivers");

const [, , brandQuery, filePrefix, ...nameParts] = process.argv;
const brandName = nameParts.join(" ");
if (!brandQuery || !filePrefix || !brandName) {
  console.error('Usage: scrape-petoin.mjs <"BRAND QUERY"> <filePrefix> <"Brand Name">');
  process.exit(1);
}

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0",
  "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
  "Referer": "https://www.petoindominique.fr/",
};

async function fetchHtml(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// Extract all <td> text values from a <tr> block
function parseTds(trHtml) {
  const vals = [];
  const re = /<td[^>]*>(.*?)<\/td>/gs;
  let m;
  while ((m = re.exec(trHtml)) !== null) {
    // Strip HTML tags, decode &plusmn; → ±, normalise whitespace
    const text = m[1]
      .replace(/<[^>]+>/g, "")
      .replace(/&plusmn;/g, "±")
      .replace(/&Omega;/g, "Ω")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    vals.push(text);
  }
  return vals;
}

function num(s) {
  if (!s || s === "" || s === "0" || s === "0.0" || s === "-") return null;
  const n = parseFloat(s.replace(",", ".").replace("±", ""));
  return isNaN(n) ? null : n;
}

// Column positions (23 cols per row):
// 0: N°(id), 1: brand, 2: brand_rating, 3: model, 4: hp_rating,
// 5: diam_cm, 6: type, 7: type_calc, 8: imp, 9: fs, 10: vas,
// 11: re, 12: qms, 13: qes, 14: qts, 15: mms_g, 16: bl,
// 17: sd_cm2, 18: le_mh, 19: sens, 20: xmax, 21: power, 22: spl
function mapRow(cols) {
  const brand   = cols[1];
  const model   = cols[3];
  const diamCm  = num(cols[5]);
  const imp     = num(cols[8]);
  const fs      = num(cols[9]);
  const vas     = num(cols[10]);
  const re      = num(cols[11]);
  const qms     = num(cols[12]);
  const qes     = num(cols[13]);
  const qts     = num(cols[14]);
  const mms     = num(cols[15]);
  const bl      = num(cols[16]);
  const sd      = num(cols[17]);
  const sens    = num(cols[19]);
  const xmax    = num(cols[20]);
  const power   = num(cols[21]);

  if (!brand || !model) return null;

  // Convert cm to inches and round to nearest standard size
  const sizeInch = diamCm ? Math.round((diamCm / 2.54) * 2) / 2 : null;

  const missing = [];
  if (!sizeInch) missing.push("sizeInch");
  if (!imp)    missing.push("impedanceOhm");
  if (!fs)     missing.push("fsHz");
  if (!qts)    missing.push("qts");
  if (!vas)    missing.push("vasL");
  if (!sd)     missing.push("sdCm2");
  if (!xmax)   missing.push("xmaxMm");
  if (!power)  missing.push("peW");
  if (!sens)   missing.push("sensitivityDb");

  if (missing.length > 0) return { skip: true, reason: missing.join(", "), model };

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
    ...(re   != null && { reOhm: re }),
    ...(bl   != null && { bl }),
    ...(mms  != null && { mmsG: mms }),
    peW: power,
    sensitivityDb: sens,
    datasheetUrl: `${BASE}?marque=${encodeURIComponent(brandQuery)}`,
  };

  return { skip: false, obj, model };
}

function toFilename(model, imp) {
  const m = model
    .toLowerCase()
    .replace(/[Ωω]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const i = String(imp).replace(/[^0-9]/g, "");
  return `${filePrefix}-${m}-${i}.json`;
}

async function main() {
  const url = `${BASE}?marque=${encodeURIComponent(brandQuery)}`;
  console.log(`Fetching: ${url}`);
  const html = await fetchHtml(url);

  // The table uses bare <td> elements without <tr> wrappers.
  // Extract all td text values and group into 23-column rows.
  const COLS = 23;
  const allTds = [...html.matchAll(/<td[^>]*>(.*?)<\/td>/gs)].map((m) => {
    return m[1]
      .replace(/<[^>]+>/g, "")
      .replace(/&plusmn;/g, "±")
      .replace(/&Omega;/g, "Ω")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  });

  // First N TDs are page navigation. Find where data rows start by locating
  // the first TD that is a bare integer (N° column) followed by the brand name.
  let offset = 0;
  for (let i = 0; i < allTds.length - 2; i++) {
    if (/^\d+$/.test(allTds[i]) && allTds[i + 1].toUpperCase() === brandQuery.toUpperCase()) {
      offset = i;
      break;
    }
  }

  const rows = [];
  for (let i = offset; i + COLS <= allTds.length; i += COLS) {
    rows.push(allTds.slice(i, i + COLS));
  }
  console.log(`Found ${rows.length} rows (offset=${offset})\n`);

  const brandDir = join(OUT_DIR, filePrefix);
  mkdirSync(brandDir, { recursive: true });

  let written = 0, skipped = 0, duped = 0;

  for (const cols of rows) {
    if (cols.length < COLS) continue;

    const result = mapRow(cols);
    if (!result) continue;

    if (result.skip) {
      console.log(`  SKIP ${result.model}: ${result.reason}`);
      skipped++;
      continue;
    }

    const { obj, model } = result;

    if (obj.sizeInch < 10) { skipped++; continue; } // ignore small drivers

    const filename = toFilename(model, obj.impedanceOhm);
    const outPath = join(brandDir, filename);
    if (existsSync(outPath)) { duped++; continue; }

    writeFileSync(outPath, JSON.stringify(obj, null, 2) + "\n");
    console.log(`  OK   ${filename}  (${obj.sizeInch}" ${obj.impedanceOhm}Ω, ${obj.peW}W, ${obj.sensitivityDb}dB)`);
    written++;
  }

  console.log(`\nDone: ${written} written, ${skipped} skipped, ${duped} dupes`);
}

main().catch((e) => { console.error(e); process.exit(1); });
