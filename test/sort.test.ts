import { describe, expect, it } from "vitest";
import { compareValues, sortByValueMissingLast } from "../src/lib/sort";

describe("compareValues", () => {
  it("orders numbers and strings", () => {
    expect(compareValues(1, 2)).toBe(-1);
    expect(compareValues(2, 1)).toBe(1);
    expect(compareValues("a", "b")).toBe(-1);
    expect(compareValues("a", "a")).toBe(0);
  });

  it("orders booleans, false before true", () => {
    expect(compareValues(false, true)).toBe(-1);
    expect(compareValues(true, false)).toBe(1);
  });

  it("treats either side undefined as equal", () => {
    expect(compareValues(undefined, 5)).toBe(0);
    expect(compareValues(5, undefined)).toBe(0);
  });
});

describe("sortByValueMissingLast", () => {
  const items = [
    { id: "b", v: 2 },
    { id: "a", v: 1 },
    { id: "none", v: undefined },
  ];

  it("sorts ascending and descending, ignoring missing values in the direction", () => {
    expect(sortByValueMissingLast(items, (i) => i.v, true).map((i) => i.id)).toEqual([
      "a",
      "b",
      "none",
    ]);
    expect(sortByValueMissingLast(items, (i) => i.v, false).map((i) => i.id)).toEqual([
      "b",
      "a",
      "none",
    ]);
  });

  it("does not mutate the input array", () => {
    const order = items.map((i) => i.id);
    sortByValueMissingLast(items, (i) => i.v, true);
    expect(items.map((i) => i.id)).toEqual(order);
  });
});
