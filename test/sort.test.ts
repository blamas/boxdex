import { describe, expect, it } from "vitest";
import {
  ariaSortFor,
  compareValues,
  nextSortState,
  sortByValueMissingLast,
  sortIndicator,
} from "../src/lib/sort";

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

describe("nextSortState", () => {
  it("flips direction when the active column is clicked again", () => {
    expect(nextSortState("name", true, "name")).toEqual({ key: "name", asc: false });
    expect(nextSortState("name", false, "name")).toEqual({ key: "name", asc: true });
  });

  it("switches column and resets to ascending", () => {
    expect(nextSortState("name", false, "size")).toEqual({ key: "size", asc: true });
  });

  it("treats no active column as a fresh ascending sort", () => {
    expect(nextSortState(undefined, false, "name")).toEqual({ key: "name", asc: true });
  });
});

describe("sortIndicator / ariaSortFor", () => {
  it("marks only the active column", () => {
    expect(sortIndicator("name", true, "name")).toBe(" ↑");
    expect(sortIndicator("name", false, "name")).toBe(" ↓");
    expect(sortIndicator("name", true, "size")).toBe("");
    expect(sortIndicator(undefined, true, "name")).toBe("");
  });

  it("reports aria-sort for the active column only", () => {
    expect(ariaSortFor("name", true, "name")).toBe("ascending");
    expect(ariaSortFor("name", false, "name")).toBe("descending");
    expect(ariaSortFor("name", true, "size")).toBe("none");
    expect(ariaSortFor(undefined, true, "name")).toBe("none");
  });
});
