import { describe, expect, it } from "vitest";
import { ampChannelW, loadRating, wiringOptions } from "../src/lib/wiring";

describe("loadRating", () => {
  it("classifies loads", () => {
    expect(loadRating(1.9)).toBe("danger");
    expect(loadRating(2)).toBe("caution");
    expect(loadRating(3.9)).toBe("caution");
    expect(loadRating(4)).toBe("ok");
    expect(loadRating(16)).toBe("ok");
    expect(loadRating(32)).toBe("inefficient");
  });
});

describe("wiringOptions", () => {
  it("returns a single option for one cab", () => {
    expect(wiringOptions(8, 1)).toEqual([{ label: "single", loadOhm: 8, rating: "ok" }]);
  });

  it("enumerates series/parallel arrangements sorted by load", () => {
    const opts = wiringOptions(8, 4);
    expect(opts).toEqual([
      { label: "4× parallel", loadOhm: 2, rating: "caution" },
      { label: "2 series × 2 parallel", loadOhm: 8, rating: "ok" },
      { label: "4× series", loadOhm: 32, rating: "inefficient" },
    ]);
  });

  it("flags a sub-2Ω parallel load as danger", () => {
    const opts = wiringOptions(4, 4);
    expect(opts[0]).toEqual({ label: "4× parallel", loadOhm: 1, rating: "danger" });
  });

  it("handles prime quantities (no series-parallel split)", () => {
    expect(wiringOptions(8, 3).map((o) => o.label)).toEqual(["3× parallel", "3× series"]);
  });

  it("rejects invalid inputs", () => {
    expect(wiringOptions(0, 4)).toEqual([]);
    expect(wiringOptions(8, 0)).toEqual([]);
    expect(wiringOptions(8, 2.5)).toEqual([]);
  });
});

describe("ampChannelW", () => {
  it("recommends 1× AES min and 2× AES ideal", () => {
    expect(ampChannelW(700, 2)).toEqual({ minW: 1400, idealW: 2800 });
  });

  it("returns undefined without power data", () => {
    expect(ampChannelW(0, 2)).toBeUndefined();
    expect(ampChannelW(700, 0)).toBeUndefined();
  });
});
