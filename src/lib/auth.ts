// Set to false to disable the password gate (e.g. when the site goes public).
export const AUTH_ENABLED = true;

// SHA-256 hex digests injected at build time from the SITE_AUTH_HASHES env var.
// That variable is computed in CI from the SITE_AUTH_PASSWORDS secret — plaintext
// passwords never appear in the codebase.
// For local dev: set SITE_AUTH_HASHES in a .env file, or leave empty (no gate shown).
const raw = import.meta.env.SITE_AUTH_HASHES ?? "";
export const AUTH_HASHES: string[] = raw
  .split(",")
  .map((h: string) => h.trim())
  .filter(Boolean);
