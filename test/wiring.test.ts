import { describe, expect, it } from "vitest";
import {
  ampChannelW,
  divisors,
  effectiveRating,
  loadRating,
  suggestedChannels,
  type WiringArrangement,
  type WiringOption,
  wiringOptions,
} from "../src/lib/wiring";

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

// s series × p parallel, matching WiringArrangement.
const arr = (kind: WiringArrangement["kind"], series: number, parallel: number) => ({
  kind,
  series,
  parallel,
});
const byArrangement = (opts: WiringOption[], kind: WiringArrangement["kind"], series: number) =>
  opts.find((o) => o.arrangement.kind === kind && o.arrangement.series === series);

describe("wiringOptions", () => {
  it("returns a single option for one cab", () => {
    expect(wiringOptions(8, 1)).toEqual([
      { arrangement: arr("single", 1, 1), loadOhm: 8, rating: "ok" },
    ]);
  });

  it("enumerates series/parallel arrangements sorted by load", () => {
    const opts = wiringOptions(8, 4);
    expect(opts).toEqual([
      { arrangement: arr("parallel", 1, 4), loadOhm: 2, rating: "caution" },
      { arrangement: arr("seriesParallel", 2, 2), loadOhm: 8, rating: "ok" },
      { arrangement: arr("series", 4, 1), loadOhm: 32, rating: "inefficient" },
    ]);
  });

  it("flags a sub-2Ω parallel load as danger", () => {
    const opts = wiringOptions(4, 4);
    expect(opts[0]).toEqual({ arrangement: arr("parallel", 1, 4), loadOhm: 1, rating: "danger" });
  });

  it("handles prime quantities (no series-parallel split)", () => {
    expect(wiringOptions(8, 3).map((o) => o.arrangement)).toEqual([
      arr("parallel", 1, 3),
      arr("series", 3, 1),
    ]);
  });

  it("rejects invalid inputs", () => {
    expect(wiringOptions(0, 4)).toEqual([]);
    expect(wiringOptions(8, 0)).toEqual([]);
    expect(wiringOptions(8, 2.5)).toEqual([]);
  });

  it("applies the same series/parallel ratio to a real minimum-impedance figure", () => {
    // 4× 8 Ω nominal dipping to 6.4 Ω (exactly the IEC 0.8× allowance): in a 2s×2p
    // split nominal stays 8 Ω, the dip 6.4 Ω, both "ok".
    const opts = wiringOptions(8, 4, 6.4);
    const twoByTwo = byArrangement(opts, "seriesParallel", 2);
    expect(twoByTwo?.minLoadOhm).toBeCloseTo(6.4, 5);
    expect(twoByTwo?.minRating).toBe("ok");
    // 4× parallel: nominal 2 Ω, and a compliant dip normalises right back to nominal,
    // so it adds nothing beyond the nominal "caution" (no double-counted conservatism).
    const parallel = byArrangement(opts, "parallel", 1);
    expect(parallel?.rating).toBe("caution");
    expect(parallel?.minLoadOhm).toBeCloseTo(1.6, 5);
    expect(parallel?.minRating).toBe("caution");
  });

  it("downgrades an anomalously deep dip, but never upgrades the nominal rating", () => {
    // 8 Ω nominal dipping to 2.4 Ω (0.3×, far past the 0.8× allowance): 2× parallel is
    // nominally 4 Ω (ok) but the normalised dip (1.2/0.8 = 1.5 Ω) rates danger.
    const deep = byArrangement(wiringOptions(8, 2, 2.4), "parallel", 1);
    expect(deep?.rating).toBe("ok");
    expect(deep?.minRating).toBe("danger");
    // A high (inefficient) nominal load stays inefficient even when its dip normalises
    // into the 4-16 Ω window.
    const high = wiringOptions(18, 1, 9)[0];
    expect(high.rating).toBe("inefficient");
    expect(high.minRating).toBe("inefficient");
  });

  it("omits minLoadOhm/minRating when no minimum impedance is given", () => {
    expect(wiringOptions(8, 1)[0].minLoadOhm).toBeUndefined();
    expect(wiringOptions(8, 1)[0].minRating).toBeUndefined();
  });
});

describe("effectiveRating", () => {
  it("prefers the worst-case rating when a minimum impedance is known", () => {
    expect(
      effectiveRating({
        arrangement: arr("single", 1, 1),
        loadOhm: 8,
        rating: "ok",
        minLoadOhm: 1.6,
        minRating: "danger",
      })
    ).toBe("danger");
  });

  it("falls back to the nominal rating without a minimum impedance figure", () => {
    expect(
      effectiveRating({
        arrangement: arr("single", 1, 1),
        loadOhm: 8,
        rating: "ok",
        minLoadOhm: undefined,
        minRating: undefined,
      })
    ).toBe("ok");
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

describe("divisors", () => {
  it("returns [1] for n=1", () => {
    expect(divisors(1)).toEqual([1]);
  });

  it("returns ascending divisors for composite numbers", () => {
    expect(divisors(8)).toEqual([1, 2, 4, 8]);
    expect(divisors(6)).toEqual([1, 2, 3, 6]);
  });

  it("returns only 1 and n for primes", () => {
    expect(divisors(7)).toEqual([1, 7]);
  });
});

describe("suggestedChannels", () => {
  it("returns 1 for a single cab", () => {
    expect(suggestedChannels(8, 1)).toBe(1);
  });

  it("returns 1 when a single-channel wiring already achieves ok (impedance-only)", () => {
    // wiringOptions(8, 4) includes 2s×2p = 8 Ω (ok)
    expect(suggestedChannels(8, 4)).toBe(1);
  });

  it("splits to find an ok wiring when prime qty forces bad options on 1ch", () => {
    // wiringOptions(6, 3): 3×parallel=2Ω (caution), 3×series=18Ω (inefficient), no ok
    // wiringOptions(6, 1): single=6Ω (ok) → 3 channels
    expect(suggestedChannels(6, 3)).toBe(3);
  });

  it("falls back to caution if no split achieves ok", () => {
    // wiringOptions(1, 2): 2×parallel=0.5Ω (danger), 2×series=2Ω (caution)
    // d=1 gives caution → returns 1
    expect(suggestedChannels(1, 2)).toBe(1);
  });

  it("splits for power when 1ch impedance is ok but power exceeds target", () => {
    // 18× 4 Ω at 3400 W AES each: wiringOptions(4, 18) has ok (6s×3p=8Ω) so impedance
    // alone would return 1, but 3400×18=61200 W >> 4000 W target.
    // d=18: wiringOptions(4, 1) = single=4Ω (ok), 3400×1=3400 ≤ 4000 → 18ch
    expect(suggestedChannels(4, 18, { aesPerCabW: 3400 })).toBe(18);
  });

  it("returns 1 when power per channel is within target", () => {
    // 4× 8 Ω at 900 W: 900×4=3600 ≤ 4000, wiringOptions(8,4) has ok → 1ch
    expect(suggestedChannels(8, 4, { aesPerCabW: 900 })).toBe(1);
  });

  it("ignores power constraint when aesPerCabW is absent", () => {
    // No power data: falls back to impedance-only (same as before)
    expect(suggestedChannels(8, 4, {})).toBe(1);
  });

  it("prefers the lower-power split when no divisor satisfies the power target", () => {
    // 5000 W cab, target 4000 W: neither d=1 (2×4Ω, 10000 W/ch) nor d=2 (1×8Ω, 5000 W/ch)
    // meets the power budget, but both wirings are "ok" impedance-wise, so the fallback
    // should prefer the 2-channel split (5000 W/ch) over the 1-channel split (10000 W/ch).
    expect(suggestedChannels(8, 2, { aesPerCabW: 5000 })).toBe(2);
  });

  it("an anomalously deep dip can change the suggestion, a compliant one never does", () => {
    // 3× 12 Ω cabs: nominal-only, 3× parallel = 4 Ω (ok) on one channel.
    expect(suggestedChannels(12, 3)).toBe(1);
    // A compliant dip (0.8× nominal, 9.6 Ω) normalises back to nominal: no change.
    expect(suggestedChannels(12, 3, { minOhm: 9.6 })).toBe(1);
    // A dip to half nominal (6 Ω real) drags 3× parallel to 2 Ω, far past what a
    // 4 Ω-nominal load is allowed: downgraded to caution, so one cab per channel
    // (12 Ω ok, dip 6 Ω normalises to 7.5 Ω, still ok) wins instead.
    expect(suggestedChannels(12, 3, { minOhm: 6 })).toBe(3);
  });
});
