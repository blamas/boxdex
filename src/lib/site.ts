// Base path for internal links, trailing slash stripped so `${BASE}/foo` is well-formed.
// Always use this rather than re-deriving BASE_URL.
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export const GIT_REPO_URL = import.meta.env.GIT_REPO_URL ?? "https://github.com/blamas/boxdex";

// Throws on non-2xx so callers catch a failed request, not a parse error on the error body.
export async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}
