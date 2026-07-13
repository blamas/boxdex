import { describe, expect, it } from "vitest";
import {
  cacheControl,
  contentType,
  notFoundKey,
  notFoundKeys,
  prefixChain,
  resolveKey,
} from "../worker/resolve";

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
    expect(resolveKey("/_assets/app.a1b2c3.css", "production")).toBe(
      "production/_assets/app.a1b2c3.css"
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
  it("marks hashed _assets immutable", () => {
    expect(cacheControl("production/_assets/app.a1b2c3.css")).toBe(
      "public, max-age=31536000, immutable"
    );
    expect(cacheControl("production/_assets/CatalogGrid.b4c5d6.js")).toBe(
      "public, max-age=31536000, immutable"
    );
  });

  it("marks pagefind bundles immutable", () => {
    expect(cacheControl("production/pagefind/pagefind.js")).toBe(
      "public, max-age=31536000, immutable"
    );
    expect(cacheControl("production/pagefind/wasm.en.wasm")).toBe(
      "public, max-age=31536000, immutable"
    );
  });

  it("gives HTML a short TTL with background revalidation", () => {
    expect(cacheControl("production/en/index.html")).toBe(
      "public, max-age=60, stale-while-revalidate=86400"
    );
  });

  it("gives everything else a moderate TTL", () => {
    expect(cacheControl("production/api/x.json")).toBe(
      "public, max-age=3600, stale-while-revalidate=86400"
    );
  });
});

describe("notFoundKeys", () => {
  it("dedupes to the single root 404 on production for a non-locale path", () => {
    expect(notFoundKeys("/nope", ["production"])).toEqual(["production/404.html"]);
  });

  it("orders locale 404s across the chain before root 404s", () => {
    expect(notFoundKeys("/en/nope", ["previews/pr-9", "production"])).toEqual([
      "previews/pr-9/en/404/index.html",
      "production/en/404/index.html",
      "previews/pr-9/404.html",
      "production/404.html",
    ]);
  });

  it("dedupes locale-less candidates across the chain", () => {
    expect(notFoundKeys("/nope", ["previews/pr-9", "production"])).toEqual([
      "previews/pr-9/404.html",
      "production/404.html",
    ]);
  });
});

describe("prefixChain", () => {
  it("returns only itself for the production prefix", () => {
    expect(prefixChain("production")).toEqual(["production"]);
  });

  it("returns preview prefix followed by production for a PR prefix", () => {
    expect(prefixChain("previews/pr-12")).toEqual(["previews/pr-12", "production"]);
  });
});
