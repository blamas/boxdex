import { describe, expect, it } from "vitest";
import { withAll } from "../src/lib/combobox-items";

describe("withAll", () => {
  it("prepends an all-option before the mapped items", () => {
    const items = withAll([2, 4, 6], (n) => ({ id: String(n), label: `${n}"` }), "All");
    expect(items).toEqual([
      { id: "all", label: "All" },
      { id: "2", label: '2"' },
      { id: "4", label: '4"' },
      { id: "6", label: '6"' },
    ]);
  });

  it("returns just the all-option for an empty list", () => {
    expect(withAll([], (n) => ({ id: String(n), label: String(n) }), "All")).toEqual([
      { id: "all", label: "All" },
    ]);
  });
});
