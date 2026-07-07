import { describe, expect, it } from "vitest";
import { cacheControl, contentType, notFoundKey, resolveKey } from "../worker/resolve";

describe("resolveKey", () => {
  it("maps the root to the prefix index", () => {
    expect(resolveKey("/", "production")).toBe("production/index.html");
  });

  it("serves index.html for a trailing-slash directory path", () => {
    expect(resolveKey("/en/drivers/foo/", "production")).toBe(
      "production/en/drivers/foo/index.html"
    );
  });

  it("serves index.html for an extensionless path (Astro directory format)", () => {
    expect(resolveKey("/en/drivers/foo", "production")).toBe(
      "production/en/drivers/foo/index.html"
    );
  });

  it("passes through a path that already names a file", () => {
    expect(resolveKey("/_astro/app.a1b2c3.css", "production")).toBe(
      "production/_astro/app.a1b2c3.css"
    );
    expect(resolveKey("/api/curves/slug.json", "production")).toBe(
      "production/api/curves/slug.json"
    );
  });

  it("honours a preview prefix", () => {
    expect(resolveKey("/en/", "previews/pr-12")).toBe("previews/pr-12/en/index.html");
  });

  it("survives malformed percent-encoding instead of throwing", () => {
    expect(resolveKey("/%", "production")).toBe("production/%/index.html");
    expect(resolveKey("/en/%zz", "production")).toBe("production/en/%zz/index.html");
  });

  it("decodes percent-encoding and drops dot segments", () => {
    expect(resolveKey("/en/drivers/a%20b/", "production")).toBe(
      "production/en/drivers/a b/index.html"
    );
    expect(resolveKey("/en/../secret", "production")).toBe("production/en/secret/index.html");
  });
});

describe("notFoundKey", () => {
  it("serves the locale's own 404 under a known locale prefix", () => {
    expect(notFoundKey("/fr/findd/", "production")).toBe("production/fr/404/index.html");
    expect(notFoundKey("/en/nope", "production")).toBe("production/en/404/index.html");
    expect(notFoundKey("/fr", "previews/pr-12")).toBe("previews/pr-12/fr/404/index.html");
  });

  it("falls back to the root 404 outside a locale prefix", () => {
    expect(notFoundKey("/whatever/x", "production")).toBe("production/404.html");
    expect(notFoundKey("/", "production")).toBe("production/404.html");
  });

  it("does not match a locale code that merely prefixes a segment", () => {
    expect(notFoundKey("/friend/x", "production")).toBe("production/404.html");
    expect(notFoundKey("/entry", "production")).toBe("production/404.html");
  });
});

describe("contentType", () => {
  it("returns known web types", () => {
    expect(contentType("production/en/index.html")).toBe("text/html; charset=utf-8");
    expect(contentType("production/api/x.json")).toBe("application/json; charset=utf-8");
    expect(contentType("production/pagefind/wasm.en.wasm")).toBe("application/wasm");
  });

  it("returns undefined for pagefind chunk extensions (read as bytes)", () => {
    expect(contentType("production/pagefind/fragment/en_abc.pf_fragment")).toBeUndefined();
    expect(contentType("production/pagefind/pagefind.en_abc.pf_meta")).toBeUndefined();
  });
});

describe("cacheControl", () => {
  it("marks hashed _astro assets immutable", () => {
    expect(cacheControl("production/_astro/app.a1b2c3.css")).toBe(
      "public, max-age=31536000, immutable"
    );
  });

  it("makes HTML revalidate", () => {
    expect(cacheControl("production/en/index.html")).toBe("public, max-age=0, must-revalidate");
  });

  it("gives everything else a moderate TTL", () => {
    expect(cacheControl("production/api/x.json")).toBe("public, max-age=3600");
  });
});
