// One-off: stamp `"type": "cone"` onto every existing driver JSON so they validate against
// the new discriminated-union schema. Inserts the field right after `$schema`. Idempotent.
import { readFileSync, writeFileSync } from "node:fs";
import { globSync } from "node:fs";

const files = globSync("data/drivers/**/*.json");
let changed = 0;

for (const file of files) {
  const raw = JSON.parse(readFileSync(file, "utf8"));
  if (raw.type) continue;
  const { $schema, ...rest } = raw;
  const next = $schema === undefined ? { type: "cone", ...rest } : { $schema, type: "cone", ...rest };
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  changed++;
}

console.log(`stamped type:cone on ${changed}/${files.length} driver files`);
