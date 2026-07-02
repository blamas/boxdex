#!/usr/bin/env node
// Fast single-file schema check for a driver/horn JSON, for contributors adding data,
// so a typo surfaces immediately instead of after a full `astro sync`/CI round-trip.
// Enclosures aren't handled here: their schema does cross-file referential checks
// (dangling driver refs, license rules) that need the whole collection loaded,
// use `mise run validate-data` (astro sync) for those instead.
import { readFileSync } from "node:fs";
import { driverSchema, hornSchema } from "../src/lib/schemas.ts";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/validate-driver.mjs <path/to/driver-or-horn.json>");
  process.exit(1);
}

const schema = file.includes("/drivers/horns/") ? hornSchema : driverSchema;
const raw = JSON.parse(readFileSync(file, "utf8"));
const result = schema.safeParse(raw);

if (result.success) {
  console.log(`ok: ${file}`);
  process.exit(0);
}

console.error(`invalid: ${file}`);
for (const issue of result.error.issues) {
  console.error(`  ${issue.path.join(".") || "(root)"}: ${issue.message}`);
}
process.exit(1);
