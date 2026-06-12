#!/usr/bin/env node
// Scrape speakerboxlite.com for given brand slugs and write driver JSON files.
// Usage: node scripts/scrape-sbl.mjs <slug:prefix:Brand Name> [<slug:prefix:Brand Name> ...]
//
// Examples:
//   node scripts/scrape-sbl.mjs "18-sound:18s:Eighteen Sound" "rcf:rcf:RCF" \
//     "precision-devices:pd:Precision Devices" "b-c-speakers:bc:B&C" \
//     "beyma:beyma:Beyma" "eminence:eminence:Eminence"

import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const BASE = "https://speakerboxlite.com";
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../data/drivers");

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0",
  "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchNuxt(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const html = await res.text();
  const m = html.match(/window\.__NUXT__=(\(function.*?\))\s*;/s);
  if (!m) throw new Error("No __NUXT__ data found");
  // eslint-disable-next-line no-eval
  return eval(m[1]);
}

// Manufacturer pages on speakerboxlite are not paginated. All speakers are SSR'd at once.
async function fetchAllSpeakers(slug) {
  const data = await fetchNuxt(`${BASE}/manufacturers/${slug}/subwoofers`);
  return data?.data?.[0]?.speakers ?? [];
}

function toFilename(prefix, model, imp) {
  const m = model
    .toLowerCase()
    .replace(/[Ωω\/\\]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${prefix}-${m}-${imp}.json`;
}

function mapSpeaker(sp, brandName) {
  // sd is in mm², convert to cm²
  const sdCm2 = sp.sd > 0 ? Math.round(sp.sd / 100) : null;

  const obj = {
    brand: brandName,
    model: sp.name,
    sizeInch: sp.diam || null,
    impedanceOhm: sp.coilRe || null,
    fsHz: sp.fs || null,
    qts: sp.qts || null,
    ...(sp.qes > 0 && { qes: sp.qes }),
    ...(sp.qms > 0 && { qms: sp.qms }),
    vasL: sp.vas || null,
    sdCm2,
    xmaxMm: sp.xMax || null,
    ...(sp.re > 0 && { reOhm: sp.re }),
    ...(sp.bl > 0 && { bl: sp.bl }),
    ...(sp.mms > 0 && { mmsG: sp.mms }),
    peW: sp.powerRMS || null,
    sensitivityDb: sp.spl || null,
    datasheetUrl: `${BASE}/subwoofers/${sp.textId}/specifications`,
  };

  // Validate required fields
  const required = ["sizeInch", "impedanceOhm", "fsHz", "qts", "vasL", "sdCm2", "xmaxMm", "peW", "sensitivityDb"];
  const missing = required.filter((k) => !obj[k]);
  return missing.length > 0 ? { skip: true, reason: missing.join(", ") } : { skip: false, obj };
}

async function processBrand(slug, prefix, brandName) {
  console.log(`\n── ${brandName} (${slug})`);
  const speakers = await fetchAllSpeakers(slug);
  console.log(`   ${speakers.length} drivers fetched`);

  let written = 0, skipped = 0, duped = 0;

  for (const sp of speakers) {
    // Skip DVC (dual voice coil): impedance depends on wiring
    if (sp.coilsNum > 1) {
      console.log(`  SKIP ${sp.name}: DVC (${sp.coilsNum} coils)`);
      skipped++;
      continue;
    }
    // Only LF drivers ≥ 10"
    if (sp.diam < 10) {
      skipped++;
      continue;
    }

    const result = mapSpeaker(sp, brandName);
    if (result.skip) {
      console.log(`  SKIP ${sp.name}: missing ${result.reason}`);
      skipped++;
      continue;
    }

    const filename = toFilename(prefix, sp.name, sp.coilRe);
    const brandDir = join(OUT_DIR, prefix);
    mkdirSync(brandDir, { recursive: true });
    const outPath = join(brandDir, filename);
    if (existsSync(outPath)) {
      console.log(`  DUP  ${filename}`);
      duped++;
      continue;
    }
    writeFileSync(outPath, JSON.stringify(result.obj, null, 2) + "\n");
    console.log(`  OK   ${filename}  (${sp.diam}" ${sp.coilRe}Ω, ${sp.powerRMS}W, ${sp.spl}dB)`);
    written++;
  }
  console.log(`   → ${written} written, ${skipped} skipped, ${duped} dupes`);
}

const specs = process.argv.slice(2);
if (specs.length === 0) {
  console.error('Usage: scrape-sbl.mjs "slug:prefix:Brand Name" [...]');
  process.exit(1);
}

for (const spec of specs) {
  const [slug, prefix, ...nameParts] = spec.split(":");
  const brandName = nameParts.join(":");
  if (!slug || !prefix || !brandName) {
    console.error(`Bad spec: ${spec}`);
    continue;
  }
  await processBrand(slug, prefix, brandName);
  await sleep(2000);
}
console.log("\nAll done.");
