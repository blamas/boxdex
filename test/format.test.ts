import { describe, expect, it } from "vitest";
import { fmtHz, fmtOhm, fmtW, humanize, withUnit } from "../src/lib/format";

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

describe("fmtW", () => {
  it("formats watts below 1000 as whole W", () => {
    expect(fmtW(400)).toBe("400 W");
    expect(fmtW(999)).toBe("999 W");
  });

  it("formats 1000 W and above as kW with one decimal", () => {
    expect(fmtW(1000)).toBe("1.0 kW");
    expect(fmtW(2500)).toBe("2.5 kW");
    expect(fmtW(10000)).toBe("10.0 kW");
  });
});

describe("fmtOhm", () => {
  it("formats integer ohm values without a decimal", () => {
    expect(fmtOhm(8)).toBe("8");
    expect(fmtOhm(4)).toBe("4");
    expect(fmtOhm(2)).toBe("2");
  });

  it("formats fractional ohm values with one decimal", () => {
    expect(fmtOhm(2.67)).toBe("2.7");
    expect(fmtOhm(1.33)).toBe("1.3");
  });
});

describe("fmtHz", () => {
  it("formats frequencies below 1 kHz as integers", () => {
    expect(fmtHz(80)).toBe("80");
    expect(fmtHz(500)).toBe("500");
    expect(fmtHz(999)).toBe("999");
  });

  it("formats exact kilohertz without a decimal", () => {
    expect(fmtHz(1000)).toBe("1k");
    expect(fmtHz(2000)).toBe("2k");
    expect(fmtHz(20000)).toBe("20k");
  });

  it("formats non-round kilohertz with one decimal", () => {
    expect(fmtHz(1500)).toBe("1.5k");
    expect(fmtHz(2800)).toBe("2.8k");
  });
});
