#!/usr/bin/env node
// Rewrite datasheetUrl to official manufacturer pages where possible;
// drop the field for brands where we have no reliable URL pattern.
//
// Confirmed working patterns:
//   B&C      https://www.bcspeakers.com/en/products/lf-transducer/{size}/{imp}/{model-lc}
//   Celestion https://celestion.com/product/{slug}/
//   Lavoce   https://lavocespeakers.com/product/{slug}/
//   tbox     thomann.fr URLs already correct: keep
//
// Everything else: drop datasheetUrl.

import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

const DRIVERS_DIR = join(
  fileURLToPath(import.meta.url),
  "../../data/drivers"
);

function slug(model) {
  return model
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildUrl(brand, obj) {
  const brandDir = brand; // directory name

  if (brandDir === "tbox") {
    // Already have real thomann.fr URLs, preserve as-is
    return obj.datasheetUrl ?? null;
  }

  if (brandDir === "bc") {
    // B&C: /en/products/lf-transducer/{size}/{imp}/{model-lc}
    // Model names sometimes already include impedance suffix (e.g. "12NDL76-4")
    const model = obj.model.toLowerCase();
    return `https://www.bcspeakers.com/en/products/lf-transducer/${obj.sizeInch}/${obj.impedanceOhm}/${model}`;
  }

  if (brandDir === "celestion") {
    return `https://celestion.com/product/${slug(obj.model)}/`;
  }

  if (brandDir === "lavoce") {
    return `https://lavocespeakers.com/product/${slug(obj.model)}/`;
  }

  // All other brands: no reliable official URL
  return null;
}

let updated = 0;
let dropped = 0;
let kept = 0;
let unchanged = 0;

for (const brandDir of readdirSync(DRIVERS_DIR)) {
  const brandPath = join(DRIVERS_DIR, brandDir);
  let files;
  try {
    files = readdirSync(brandPath).filter((f) => f.endsWith(".json"));
  } catch {
    continue;
  }

  for (const file of files) {
    const filePath = join(brandPath, file);
    const obj = JSON.parse(readFileSync(filePath, "utf8"));

    const newUrl = buildUrl(brandDir, obj);
    const oldUrl = obj.datasheetUrl ?? null;

    if (newUrl === oldUrl) {
      unchanged++;
      continue;
    }

    if (newUrl === null) {
      if (oldUrl !== null) {
        delete obj.datasheetUrl;
        dropped++;
      } else {
        unchanged++;
        continue;
      }
    } else {
      obj.datasheetUrl = newUrl;
      if (oldUrl === null) kept++;
      else updated++;
    }

    writeFileSync(filePath, JSON.stringify(obj, null, 2) + "\n");
  }
}

console.log(`Updated: ${updated}, Dropped: ${dropped}, Unchanged: ${unchanged}`);
