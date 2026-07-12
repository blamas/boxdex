// Serves the prerendered site from R2. CI syncs dist under env.ASSET_PREFIX, this Worker
// maps requests to objects. The box-contribute POST will branch here before the lookup.

import { type BoxContributeEnv, handleBoxContribute } from "./box-contribute";
import { cacheControl, contentType, notFoundKeys, prefixChain, resolveKey } from "./resolve";

interface Env extends BoxContributeEnv {
  SITE_BUCKET: R2Bucket;
  ASSET_PREFIX: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const start = Date.now();

    // Branches before the method gate below (which only permits GET/HEAD for the R2 read path).
    if (url.pathname === "/api/box-contribute" && request.method === "POST") {
      return handleBoxContribute(request, env);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      console.log(
        JSON.stringify({ event: "method_not_allowed", method: request.method, path: url.pathname })
      );
      return new Response("Method Not Allowed", { status: 405, headers: { allow: "GET, HEAD" } });
    }

    // Cache production only: previews reuse a URL across pushes.
    const isProd = env.ASSET_PREFIX === "production";
    const cache = caches.default;
    if (isProd) {
      const hit = await cache.match(request);
      if (hit) {
        console.log(
          JSON.stringify({ event: "cache_hit", path: url.pathname, ms: Date.now() - start })
        );
        return hit;
      }
    }

    const chain = prefixChain(env.ASSET_PREFIX);

    let status = 200;
    let servedKey = "";
    let object: R2ObjectBody | null = null;

    for (const prefix of chain) {
      servedKey = resolveKey(url.pathname, prefix);
      object = await env.SITE_BUCKET.get(servedKey);
      if (object) break;
    }

    if (!object) {
      status = 404;
      for (const candidate of notFoundKeys(url.pathname, chain)) {
        servedKey = candidate;
        object = await env.SITE_BUCKET.get(candidate);
        if (object) break;
      }
      if (!object) {
        console.log(
          JSON.stringify({
            event: "r2_miss_hard",
            path: url.pathname,
            prefix: env.ASSET_PREFIX,
            ms: Date.now() - start,
          })
        );
        return new Response("Not found", { status: 404 });
      }
      console.log(
        JSON.stringify({
          event: "r2_404",
          path: url.pathname,
          key: servedKey,
          ms: Date.now() - start,
        })
      );
    }

    const headers = new Headers();
    headers.set(
      "content-type",
      contentType(servedKey) ?? object.httpMetadata?.contentType ?? "application/octet-stream"
    );
    headers.set("cache-control", status === 404 ? "no-store" : cacheControl(servedKey));
    if (object.httpEtag) headers.set("etag", object.httpEtag);

    // Security headers: applied to all responses. CSP scoped to HTML only.
    headers.set("x-content-type-options", "nosniff");
    headers.set("x-frame-options", "SAMEORIGIN");
    headers.set("referrer-policy", "strict-origin-when-cross-origin");
    if (servedKey.endsWith(".html")) {
      headers.set(
        "content-security-policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://cloudflareinsights.com; font-src 'self'; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; form-action 'self'"
      );
    }

    // HTML is must-revalidate, so browsers revalidate every navigation: answer with a
    // 304 instead of the full body when their etag still matches.
    const ifNoneMatch = request.headers.get("if-none-match");
    if (status === 200 && object.httpEtag && ifNoneMatch?.includes(object.httpEtag)) {
      console.log(
        JSON.stringify({
          event: "not_modified",
          path: url.pathname,
          key: servedKey,
          ms: Date.now() - start,
        })
      );
      return new Response(null, { status: 304, headers });
    }

    const body = request.method === "HEAD" ? null : object.body;
    const response = new Response(body, { status, headers });

    if (isProd && status === 200 && request.method === "GET") {
      ctx.waitUntil(cache.put(request, response.clone()));
    }

    console.log(
      JSON.stringify({
        event: "served",
        path: url.pathname,
        key: servedKey,
        status,
        ms: Date.now() - start,
      })
    );
    return response;
  },
};
