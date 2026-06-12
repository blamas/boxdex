import { describe, expect, it } from "vitest";
import { alignmentFromEbp, ebp, sealedVbL } from "../src/lib/driver";

describe("ebp", () => {
  it("computes fs/qes rounded", () => {
    expect(ebp(40, 0.4)).toBe(100);
    expect(ebp(35, 0.33)).toBe(106);
  });

  it("returns undefined without a valid qes", () => {
    expect(ebp(40, undefined)).toBeUndefined();
    expect(ebp(40, 0)).toBeUndefined();
  });
});

describe("alignmentFromEbp", () => {
  it("classifies by thresholds", () => {
    expect(alignmentFromEbp(40)).toBe("sealed");
    expect(alignmentFromEbp(75)).toBe("flexible");
    expect(alignmentFromEbp(120)).toBe("ported");
  });

  it("passes undefined through", () => {
    expect(alignmentFromEbp(undefined)).toBeUndefined();
  });
});

describe("sealedVbL", () => {
  it("computes Vb for a target Qtc (default Butterworth ≈ 0.7071)", () => {
    // Vas 100 L, Qts 0.4 → 100 / ((SQRT1_2/0.4)^2 - 1) ≈ 47.1 L
    expect(sealedVbL(100, 0.4)).toBe(47.1);
  });

  it("returns undefined when Qts >= Qtc", () => {
    expect(sealedVbL(100, Math.SQRT1_2)).toBeUndefined();
    expect(sealedVbL(100, 0.9)).toBeUndefined();
  });
});
