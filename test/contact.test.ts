import { describe, expect, it } from "vitest";
import { contactHref, contactLabel } from "../src/lib/contact";

describe("contactHref", () => {
  it("builds a mailto for a bare email address", () => {
    expect(contactHref("email", "designer@example.com")).toBe("mailto:designer@example.com");
    expect(contactHref("email", "  designer@example.com  ")).toBe("mailto:designer@example.com");
    expect(contactHref("email", "mailto:designer@example.com")).toBe("mailto:designer@example.com");
  });

  it("rejects a non-address email value", () => {
    expect(contactHref("email", "not-an-email")).toBeNull();
    expect(contactHref("email", "javascript:alert(1)")).toBeNull();
  });

  it("prepends https for a bare website or profile domain", () => {
    expect(contactHref("website", "shop.example.com")).toBe("https://shop.example.com/");
    expect(contactHref("website", "https://shop.example.com/plans")).toBe(
      "https://shop.example.com/plans"
    );
    expect(contactHref("profile", "instagram.com/boxbuilder")).toBe(
      "https://instagram.com/boxbuilder"
    );
  });

  it("passes an explicit https URL through for website and profile", () => {
    expect(contactHref("profile", "https://mastodon.social/@boxbuilder")).toBe(
      "https://mastodon.social/@boxbuilder"
    );
  });

  it("neutralises dangerous and non-https schemes to null", () => {
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "http://insecure.example.com",
    ]) {
      expect(contactHref("website", bad)).toBeNull();
    }
  });

  it("returns null for empty values", () => {
    expect(contactHref("website", "   ")).toBeNull();
    expect(contactHref("email", "")).toBeNull();
  });
});

describe("contactLabel", () => {
  it("strips scheme noise for display", () => {
    expect(contactLabel("mailto:a@b.com")).toBe("a@b.com");
    expect(contactLabel("https://shop.example.com/")).toBe("shop.example.com");
    expect(contactLabel("@handle")).toBe("@handle");
  });
});
