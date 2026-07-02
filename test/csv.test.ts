import { describe, expect, it } from "vitest";
import { normalisePeak, parseCurveCsv, toPairs } from "../src/lib/csv";

describe("parseCurveCsv", () => {
  it("parses comma-separated values", () => {
    const result = parseCurveCsv("100,5.2\n200,6.4\n400,7.1");
    expect(result.freq).toEqual([100, 200, 400]);
    expect(result.value).toEqual([5.2, 6.4, 7.1]);
  });

  it("ignores comment lines starting with #", () => {
    const result = parseCurveCsv("# header\n100,5.2\n# another comment\n200,6.4");
    expect(result.freq).toEqual([100, 200]);
    expect(result.value).toEqual([5.2, 6.4]);
  });

  it("ignores blank lines", () => {
    const result = parseCurveCsv("100,5.2\n\n\n200,6.4");
    expect(result.freq).toEqual([100, 200]);
    expect(result.value).toEqual([5.2, 6.4]);
  });

  it("drops rows with non-finite values", () => {
    const result = parseCurveCsv("100,5.2\n200,NaN\n300,Inf\n400,7.1");
    expect(result.freq).toEqual([100, 400]);
    expect(result.value).toEqual([5.2, 7.1]);
  });

  it("handles tab-separated values", () => {
    const result = parseCurveCsv("100\t5.2\n200\t6.4");
    expect(result.freq).toEqual([100, 200]);
    expect(result.value).toEqual([5.2, 6.4]);
  });

  it("handles semicolon-separated values", () => {
    const result = parseCurveCsv("100;5.2\n200;6.4");
    expect(result.freq).toEqual([100, 200]);
    expect(result.value).toEqual([5.2, 6.4]);
  });

  it("returns empty arrays for empty input", () => {
    const result = parseCurveCsv("");
    expect(result.freq).toEqual([]);
    expect(result.value).toEqual([]);
  });

  it("drops lines with fewer than 2 columns", () => {
    const result = parseCurveCsv("100\n200,6.4");
    expect(result.freq).toEqual([200]);
    expect(result.value).toEqual([6.4]);
  });
});

describe("toPairs", () => {
  it("zips freq and value arrays into pairs", () => {
    const result = toPairs({ freq: [100, 200, 400], value: [5, 6, 7] });
    expect(result).toEqual([
      [100, 5],
      [200, 6],
      [400, 7],
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(toPairs({ freq: [], value: [] })).toEqual([]);
  });
});

describe("normalisePeak", () => {
  it("shifts so the peak becomes 0", () => {
    const result = normalisePeak([100, 110, 105]);
    expect(result).toEqual([-10, 0, -5]);
  });

  it("returns empty array for empty input", () => {
    expect(normalisePeak([])).toEqual([]);
  });

  it("peak of a single-element array is 0", () => {
    expect(normalisePeak([42])).toEqual([0]);
  });
});
