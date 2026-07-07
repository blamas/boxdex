// Pure path -> R2-key helpers, kept free of Cloudflare types so they unit-test in vitest.

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  ico: "image/x-icon",
  avif: "image/avif",
  woff2: "font/woff2",
  woff: "font/woff",
  wasm: "application/wasm",
  pdf: "application/pdf",
  map: "application/json; charset=utf-8",
  webmanifest: "application/manifest+json",
};

const IMMUTABLE = "public, max-age=31536000, immutable";
const REVALIDATE = "public, max-age=0, must-revalidate";
const MODERATE = "public, max-age=3600";

function key(prefix: string, path: string): string {
  return `${prefix.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

// Request pathname -> R2 key. Follows Astro directory output: `/foo` and `/foo/` both
// resolve to `foo/index.html`.
export function resolveKey(pathname: string, prefix: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // Malformed percent-encoding (bot probes like /%). Use the raw path, it 404s.
    decoded = pathname;
  }
  let path = decoded.replace(/^\/+/, "");
  // drop . and .. segments
  path = path
    .split("/")
    .filter((seg) => seg !== "." && seg !== "..")
    .join("/");

  if (path === "") return key(prefix, "index.html");
  if (path.endsWith("/")) return key(prefix, `${path}index.html`);

  const last = path.slice(path.lastIndexOf("/") + 1);
  if (last.includes(".")) return key(prefix, path);
  return key(prefix, `${path}/index.html`);
}

// Known type for the extension, else undefined (pagefind chunks are read as bytes).
export function contentType(key: string): string | undefined {
  const ext = key.slice(key.lastIndexOf(".") + 1).toLowerCase();
  return TYPES[ext];
}

// Hashed _astro assets are immutable, HTML revalidates, everything else moderate.
export function cacheControl(key: string): string {
  if (key.includes("/_astro/")) return IMMUTABLE;
  if (key.endsWith(".html")) return REVALIDATE;
  return MODERATE;
}
