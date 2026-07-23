import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../worker/index";

// Minimal R2/cache/ctx stubs: the handler only touches get()/match()/put()/waitUntil().
interface StubObject {
  body: string | null;
  httpEtag?: string;
  httpMetadata?: { contentType?: string };
}

function bucket(objects: Record<string, StubObject>) {
  return {
    get: vi.fn(async (key: string) => objects[key] ?? null),
  };
}

let cacheStore: Map<string, Response>;
let waited: Promise<unknown>[];

function ctx() {
  return { waitUntil: (p: Promise<unknown>) => waited.push(p), passThroughOnException: () => {} };
}

function run(
  path: string,
  env: Record<string, unknown>,
  init?: RequestInit,
  cf?: Record<string, unknown>
): Promise<Response> {
  const req = new Request(`https://boxdex.example${path}`, init);
  // biome-ignore lint/suspicious/noExplicitAny: test stubs stand in for Cloudflare runtime types.
  if (cf) (req as any).cf = cf;
  // biome-ignore lint/suspicious/noExplicitAny: test stubs stand in for Cloudflare runtime types.
  return worker.fetch(req as any, env as any, ctx() as any);
}

beforeEach(() => {
  cacheStore = new Map();
  waited = [];
  const cache = {
    match: async (req: Request) => cacheStore.get(new URL(req.url).toString()),
    put: async (req: Request, res: Response) => {
      cacheStore.set(new URL(req.url).toString(), res);
    },
  };
  // biome-ignore lint/suspicious/noExplicitAny: stubbing the Cloudflare cache global.
  (globalThis as any).caches = { default: cache };
});

afterEach(() => {
  // biome-ignore lint/suspicious/noExplicitAny: cleanup of the stubbed global.
  (globalThis as any).caches = undefined;
});

const prod = (objects: Record<string, StubObject>) => ({
  ASSET_PREFIX: "production",
  SITE_BUCKET: bucket(objects),
});

describe("worker fetch handler", () => {
  it("405s a non-GET/HEAD method with an Allow header", async () => {
    const res = await run("/anything", prod({}), { method: "POST" });
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET, HEAD");
  });

  it("resolves a directory path to index.html and serves it", async () => {
    const res = await run(
      "/en/",
      prod({ "production/en/index.html": { body: "<h1>hi</h1>", httpEtag: '"e1"' } })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toBe("<h1>hi</h1>");
  });

  it("sets a CSP header on HTML but not on other asset types", async () => {
    const html = await run("/en/", prod({ "production/en/index.html": { body: "x" } }));
    expect(html.headers.get("content-security-policy")).toContain("default-src 'self'");

    const png = await run("/logo.png", prod({ "production/logo.png": { body: "bytes" } }));
    expect(png.headers.get("content-security-policy")).toBeNull();
    expect(png.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("returns 304 with a null body when if-none-match matches the etag", async () => {
    const env = prod({ "production/en/index.html": { body: "x", httpEtag: '"e1"' } });
    const res = await run("/en/", env, { headers: { "if-none-match": '"e1"' } });
    expect(res.status).toBe(304);
    expect(await res.text()).toBe("");
  });

  it("serves a HEAD request with headers but no body and does not cache it", async () => {
    const env = prod({ "production/en/index.html": { body: "x", httpEtag: '"e1"' } });
    const res = await run("/en/", env, { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
    expect(cacheStore.size).toBe(0);
  });

  it("caches a GET 200 on the production prefix and serves the cache on repeat", async () => {
    const env = prod({ "production/en/index.html": { body: "x", httpEtag: '"e1"' } });
    await run("/en/", env);
    await Promise.all(waited);
    expect(cacheStore.size).toBe(1);

    const second = await run("/en/", env);
    expect(second.status).toBe(200);
    // Second hit is served from cache: the bucket is not consulted again.
    expect(env.SITE_BUCKET.get).toHaveBeenCalledTimes(1);
  });

  it("falls back to the production prefix for a preview miss", async () => {
    const env = {
      ASSET_PREFIX: "previews/pr-9",
      SITE_BUCKET: bucket({ "production/en/index.html": { body: "prod" } }),
    };
    const res = await run("/en/", env);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("prod");
    // Preview reads bypass the cache entirely.
    expect(cacheStore.size).toBe(0);
  });

  it("serves the locale 404 page with no-store on a miss", async () => {
    const env = prod({ "production/en/404/index.html": { body: "not here" } });
    const res = await run("/en/does-not-exist", env);
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toBe("not here");
  });

  it("returns a bare 404 when even the 404 pages are missing", async () => {
    const res = await run("/en/nope", prod({}));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not found");
  });
});

// biome-ignore lint/suspicious/noExplicitAny: console.log args are untyped in the vitest spy.
function loggedEvent(spy: ReturnType<typeof vi.spyOn>, event: string): any {
  return (
    spy.mock.calls
      .map((c: unknown[]) => JSON.parse(c[0] as string))
      // biome-ignore lint/suspicious/noExplicitAny: parsed log JSON is untyped.
      .find((l: any) => l.event === event)
  );
}

describe("visitor logging", () => {
  const CHROME_WINDOWS =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36";

  it("attaches client/bot/country/visitorHash to an HTML GET when a salt is set", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const env = { ...prod({ "production/en/index.html": { body: "hi" } }), VISITOR_HASH_SALT: "s" };
    await run(
      "/en/",
      env,
      { headers: { "user-agent": CHROME_WINDOWS, "cf-connecting-ip": "203.0.113.5" } },
      { country: "FR", botManagement: { score: 90, verifiedBot: false } }
    );
    const served = loggedEvent(spy, "served");
    expect(served.client).toBe("Chrome/Windows/desktop");
    expect(served.bot).toBe(false);
    expect(served.country).toBe("FR");
    expect(served.visitorHash).toMatch(/^[0-9a-f]{16}$/);
    spy.mockRestore();
  });

  it("flags a verified bot and its category, omits visitorHash without a salt", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const env = prod({ "production/en/index.html": { body: "hi" } });
    await run(
      "/en/",
      env,
      { headers: { "user-agent": "Googlebot/2.1" } },
      {
        country: "US",
        botManagement: { score: 1, verifiedBot: true },
        verifiedBotCategory: "search_engine",
      }
    );
    const served = loggedEvent(spy, "served");
    expect(served.bot).toBe(true);
    expect(served.botCategory).toBe("search_engine");
    expect(served.visitorHash).toBeUndefined();
    spy.mockRestore();
  });

  it("does not attach visitor fields to a non-HTML asset request", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const env = { ...prod({ "production/logo.png": { body: "bytes" } }), VISITOR_HASH_SALT: "s" };
    await run(
      "/logo.png",
      env,
      { headers: { "user-agent": CHROME_WINDOWS, "cf-connecting-ip": "203.0.113.5" } },
      { country: "FR", botManagement: { score: 90, verifiedBot: false } }
    );
    const served = loggedEvent(spy, "served");
    expect(served.client).toBeUndefined();
    expect(served.bot).toBeUndefined();
    expect(served.country).toBeUndefined();
    expect(served.visitorHash).toBeUndefined();
    spy.mockRestore();
  });

  it("attaches visitor fields on a 304 not-modified HTML hit too", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const env = {
      ...prod({ "production/en/index.html": { body: "hi", httpEtag: '"e1"' } }),
      VISITOR_HASH_SALT: "s",
    };
    await run(
      "/en/",
      env,
      { headers: { "if-none-match": '"e1"', "user-agent": CHROME_WINDOWS } },
      { country: "FR", botManagement: { score: 90, verifiedBot: false } }
    );
    const notModified = loggedEvent(spy, "not_modified");
    expect(notModified.client).toBe("Chrome/Windows/desktop");
    expect(notModified.visitorHash).toMatch(/^[0-9a-f]{16}$/);
    spy.mockRestore();
  });
});
