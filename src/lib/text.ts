// Free-text matching shared by every catalog/table name-filter. Pure, no DOM.

// Case-insensitive substring match. An empty (or whitespace-only) query always matches,
// so callers can wire it straight to a filter's "" = inactive convention.
export function matchesName(haystack: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  return q === "" || haystack.toLowerCase().includes(q);
}
