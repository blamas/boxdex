// Base path for internal links, trailing slash stripped so `${BASE}/foo` is well-formed.
// Always use this rather than re-deriving BASE_URL (see memory: boxdex-base-path-links).
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
