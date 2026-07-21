// Structural reads of a zod object schema, so form controls follow the schema itself.
// Duck-typed on purpose: never imports zod, so it stays out of the client bundle.

interface Unwrappable {
  unwrap?: () => unknown;
  minValue?: number | null;
  maxValue?: number | null;
  shape?: Record<string, unknown>;
}

// Optionals/nullables/defaults wrap the real type.
function unwrapAll(schema: unknown): Unwrappable {
  let s = schema as Unwrappable;
  while (s && typeof s.unwrap === "function") s = s.unwrap() as Unwrappable;
  return s ?? {};
}

// Read off .min()/.max() so an input's native hint can't drift from the zod error text.
export function numBounds(schema: unknown): { min?: number; max?: number } {
  const s = unwrapAll(schema);
  return { min: s.minValue ?? undefined, max: s.maxValue ?? undefined };
}

// Walk a dotted path ("sheetSizeMm.wMm"). Undefined rather than throwing on a stale path.
export function schemaAt(root: unknown, path: string): unknown {
  let node: unknown = root;
  for (const seg of path.split(".")) {
    if (node === undefined) return undefined;
    node = unwrapAll(node).shape?.[seg];
  }
  return node;
}
