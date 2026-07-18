import { describe, expect, it } from "vitest";
import { matchesName } from "../src/lib/text";

describe("matchesName", () => {
  it("matches case-insensitively as a substring", () => {
    expect(matchesName("BC Speakers ME7", "me7")).toBe(true);
    expect(matchesName("BC Speakers ME7", "speakers")).toBe(true);
  });

  it("does not match when the query is absent from the haystack", () => {
    expect(matchesName("BC Speakers ME7", "faital")).toBe(false);
  });

  it("treats an empty or whitespace-only query as always matching", () => {
    expect(matchesName("BC Speakers ME7", "")).toBe(true);
    expect(matchesName("BC Speakers ME7", "   ")).toBe(true);
  });

  it("trims surrounding whitespace from the query", () => {
    expect(matchesName("BC Speakers ME7", "  me7  ")).toBe(true);
  });
});
