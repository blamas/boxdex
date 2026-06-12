import { describe, expect, it } from "vitest";
import { humanize, withUnit } from "../src/lib/format";

describe("humanize", () => {
  it("replaces every underscore with a space", () => {
    expect(humanize("front_loaded_horn")).toBe("front loaded horn");
    expect(humanize("group_delay")).toBe("group delay");
  });

  it("passes through strings without underscores", () => {
    expect(humanize("sealed")).toBe("sealed");
    expect(humanize("")).toBe("");
  });
});

describe("withUnit", () => {
  it("appends the unit to a number", () => {
    expect(withUnit(40, "Hz")).toBe("40 Hz");
    expect(withUnit(12.5, "L")).toBe("12.5 L");
  });

  it("keeps zero: a valid value, not a missing one", () => {
    expect(withUnit(0, "dB")).toBe("0 dB");
  });

  it("returns undefined when the value is absent (so the row is skipped)", () => {
    expect(withUnit(undefined, "Hz")).toBeUndefined();
  });
});
