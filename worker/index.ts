// Serves the prerendered site from R2. CI syncs dist under env.ASSET_PREFIX, this Worker
// maps requests to objects. The add-a-box POST will branch here before the lookup.

import { cacheControl, contentType, notFoundKey, resolveKey } from "./resolve";

interface Env {
  SITE_BUCKET: R2Bucket;
  ASSET_PREFIX: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405, headers: { allow: "GET, HEAD" } });
    }

    // Cache production only: previews reuse a URL across pushes.
    const isProd = env.ASSET_PREFIX === "production";
    const cache = caches.default;
    if (isProd) {
      const hit = await cache.match(request);
      if (hit) return hit;
    }

    const url = new URL(request.url);
    const key = resolveKey(url.pathname, env.ASSET_PREFIX);

    let status = 200;
    let servedKey = key;
    let object = await env.SITE_BUCKET.get(key);
    if (!object) {
      status = 404;
      servedKey = notFoundKey(url.pathname, env.ASSET_PREFIX);
      object = await env.SITE_BUCKET.get(servedKey);
      const rootKey = `${env.ASSET_PREFIX}/404.html`;
      if (!object && servedKey !== rootKey) {
        servedKey = rootKey;
        object = await env.SITE_BUCKET.get(rootKey);
      }
      if (!object) return new Response("Not found", { status: 404 });
    }

    const headers = new Headers();
    headers.set(
      "content-type",
      contentType(servedKey) ?? object.httpMetadata?.contentType ?? "application/octet-stream"
    );
    headers.set("cache-control", status === 404 ? "no-store" : cacheControl(key));
    if (object.httpEtag) headers.set("etag", object.httpEtag);

    // HTML is must-revalidate, so browsers revalidate every navigation: answer with a
    // 304 instead of the full body when their etag still matches.
    const ifNoneMatch = request.headers.get("if-none-match");
    if (status === 200 && object.httpEtag && ifNoneMatch?.includes(object.httpEtag)) {
      return new Response(null, { status: 304, headers });
    }

    const body = request.method === "HEAD" ? null : object.body;
    const response = new Response(body, { status, headers });

    if (isProd && status === 200 && request.method === "GET") {
      ctx.waitUntil(cache.put(request, response.clone()));
    }
    return response;
  },
};
