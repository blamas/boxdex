import { describe, expect, it } from "vitest";
import { numBounds, schemaAt } from "../src/lib/schema-introspect";

// Stand-ins for zod nodes.
const num = (min?: number, max?: number) => ({ minValue: min ?? null, maxValue: max ?? null });
const obj = (shape: Record<string, unknown>) => ({ shape });
const optional = (inner: unknown) => ({ unwrap: () => inner });

describe("numBounds", () => {
  it("reads min and max off a plain number schema", () => {
    expect(numBounds(num(1, 10))).toEqual({ min: 1, max: 10 });
  });

  it("normalises absent bounds from null to undefined", () => {
    expect(numBounds(num())).toEqual({ min: undefined, max: undefined });
  });

  it("unwraps through nested optionals to the number underneath", () => {
    expect(numBounds(optional(optional(num(0, 5))))).toEqual({ min: 0, max: 5 });
  });

  it("returns empty bounds for a non-schema value instead of throwing", () => {
    expect(numBounds(undefined)).toEqual({ min: undefined, max: undefined });
  });
});

describe("schemaAt", () => {
  const root = obj({
    f3Hz: num(20, 200),
    sheetSizeMm: optional(obj({ wMm: num(100, 3000) })),
  });

  it("resolves a top-level field", () => {
    expect(numBounds(schemaAt(root, "f3Hz"))).toEqual({ min: 20, max: 200 });
  });

  it("walks a dotted path through a wrapped nested object", () => {
    expect(numBounds(schemaAt(root, "sheetSizeMm.wMm"))).toEqual({ min: 100, max: 3000 });
  });

  it("returns undefined for a missing path rather than throwing", () => {
    expect(schemaAt(root, "nope")).toBeUndefined();
    expect(schemaAt(root, "nope.deeper")).toBeUndefined();
    expect(schemaAt(root, "f3Hz.deeper")).toBeUndefined();
  });
});
