import { describe, expect, it } from "vitest";
import { classifyClient, hashVisitor, isBot } from "../worker/visitor";

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.1 Mobile/15E148 Safari/604.1",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36",
  windowsFirefox:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
  macChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
  linuxCurl: "curl/8.4.0",
};

describe("classifyClient", () => {
  it("returns unknown for a missing user-agent", () => {
    expect(classifyClient(null)).toBe("unknown");
  });

  it("buckets an iPhone Safari UA", () => {
    expect(classifyClient(UA.iphoneSafari)).toBe("Safari/iOS/mobile");
  });

  it("buckets an Android Chrome UA", () => {
    expect(classifyClient(UA.androidChrome)).toBe("Chrome/Android/mobile");
  });

  it("buckets a desktop Firefox UA", () => {
    expect(classifyClient(UA.windowsFirefox)).toBe("Firefox/Windows/desktop");
  });

  it("buckets a desktop Chrome UA", () => {
    expect(classifyClient(UA.macChrome)).toBe("Chrome/macOS/desktop");
  });

  it("falls back to Other/Other for an unrecognised UA, still bucketed as desktop", () => {
    expect(classifyClient(UA.linuxCurl)).toBe("Other/Other/desktop");
  });
});

describe("isBot", () => {
  it("is false when botManagement is absent", () => {
    expect(isBot(undefined)).toBe(false);
  });

  it("is true for a verified bot regardless of score", () => {
    expect(isBot({ score: 99, verifiedBot: true })).toBe(true);
  });

  it("is true at or below the threshold", () => {
    expect(isBot({ score: 30, verifiedBot: false })).toBe(true);
    expect(isBot({ score: 1, verifiedBot: false })).toBe(true);
  });

  it("is false above the threshold", () => {
    expect(isBot({ score: 31, verifiedBot: false })).toBe(false);
    expect(isBot({ score: 99, verifiedBot: false })).toBe(false);
  });
});

describe("hashVisitor", () => {
  it("is deterministic for the same inputs", async () => {
    const a = await hashVisitor("salt", "2026-07", "203.0.113.1", "Chrome/Windows/desktop");
    const b = await hashVisitor("salt", "2026-07", "203.0.113.1", "Chrome/Windows/desktop");
    expect(a).toBe(b);
  });

  it("changes across periods (no cross-month correlation)", async () => {
    const july = await hashVisitor("salt", "2026-07", "203.0.113.1", "Chrome/Windows/desktop");
    const august = await hashVisitor("salt", "2026-08", "203.0.113.1", "Chrome/Windows/desktop");
    expect(july).not.toBe(august);
  });

  it("changes with the salt", async () => {
    const a = await hashVisitor("salt-a", "2026-07", "203.0.113.1", "Chrome/Windows/desktop");
    const b = await hashVisitor("salt-b", "2026-07", "203.0.113.1", "Chrome/Windows/desktop");
    expect(a).not.toBe(b);
  });

  it("never contains the raw IP as a substring", async () => {
    const hash = await hashVisitor("salt", "2026-07", "203.0.113.1", "Chrome/Windows/desktop");
    expect(hash).not.toContain("203.0.113.1");
  });

  it("is a fixed-length hex string", async () => {
    const hash = await hashVisitor("salt", "2026-07", "203.0.113.1", "Chrome/Windows/desktop");
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });
});
