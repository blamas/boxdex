import { describe, expect, it } from "vitest";
import en from "../src/i18n/locales/en.json";
import fr from "../src/i18n/locales/fr.json";

// tsc already catches fr.json missing a key vs en.json, but not the reverse.
function leafKeyPaths(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
    leafKeyPaths(v, prefix ? `${prefix}.${k}` : k)
  );
}

describe("i18n locale key parity", () => {
  it("en.json and fr.json declare the exact same set of keys", () => {
    const enKeys = leafKeyPaths(en).sort();
    const frKeys = leafKeyPaths(fr).sort();
    expect(frKeys).toEqual(enKeys);
  });
});
