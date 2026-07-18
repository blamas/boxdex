import { describe, expect, it } from "vitest";
import { formatCounter, wrapIndex } from "../src/lib/lightbox";

describe("wrapIndex", () => {
  it("passes through indices already in range", () => {
    expect(wrapIndex(0, 3)).toBe(0);
    expect(wrapIndex(2, 3)).toBe(2);
  });

  it("wraps forward past the end", () => {
    expect(wrapIndex(3, 3)).toBe(0);
    expect(wrapIndex(4, 3)).toBe(1);
  });

  it("wraps backward past the start", () => {
    expect(wrapIndex(-1, 3)).toBe(2);
    expect(wrapIndex(-4, 3)).toBe(2);
  });

  it("is a no-op for a single-image gallery", () => {
    expect(wrapIndex(0, 1)).toBe(0);
    expect(wrapIndex(-1, 1)).toBe(0);
    expect(wrapIndex(5, 1)).toBe(0);
  });
});

describe("formatCounter", () => {
  it("fills n and total into the format string", () => {
    expect(formatCounter("{n} / {total}", 2, 5)).toBe("2 / 5");
  });

  it("works with a format that reorders or omits placeholders", () => {
    expect(formatCounter("photo {n} of {total}", 1, 1)).toBe("photo 1 of 1");
    expect(formatCounter("no placeholders", 3, 4)).toBe("no placeholders");
  });
});
