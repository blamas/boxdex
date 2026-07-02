// Mirror island state into the URL so share links reproduce the view. Browser-only:
// islands are client:only, so these are never called during the static build.

export function readParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

// Replace the query string (no history entry). Empty/undefined values are omitted;
// an empty query collapses back to the bare path.
export function writeParams(params: Record<string, string | undefined>): void {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) qs.set(key, value);
  }
  const s = qs.toString();
  history.replaceState(null, "", s ? `?${s}` : window.location.pathname);
}
