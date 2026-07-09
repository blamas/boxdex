// Base path for internal links, trailing slash stripped so `${BASE}/foo` is well-formed.
// Always use this rather than re-deriving BASE_URL.
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export const GIT_REPO_URL = import.meta.env.GIT_REPO_URL ?? "https://github.com/blamas/boxdex";
