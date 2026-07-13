// Safe href construction for contact channels. A channel `value` is a free-form handle or
// URL from an untrusted contribution: interpolating it into an href without a scheme check
// would let a "javascript:" value run on the enclosure detail page. So every result is
// validated down to https: (or mailto: for email), and anything else returns null so the
// caller renders plain text instead of a link.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hasScheme(v: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(v);
}

// Only https survives: http, javascript:, data:, vbscript:, ... all collapse to null.
function safeUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export function contactHref(channel: string, value: string): string | null {
  const v = value.trim();
  if (!v) return null;

  if (channel === "email") {
    const addr = v.replace(/^mailto:/i, "");
    return EMAIL_RE.test(addr) ? `mailto:${addr}` : null;
  }

  // website and profile are both free URLs: an explicit scheme is honored after the check,
  // a bare domain gets https:// prepended. Anything that is not https collapses to null.
  return hasScheme(v) ? safeUrl(v) : safeUrl(`https://${v}`);
}

// Display text: drop the scheme/mailto noise so the visible label stays a handle or domain.
export function contactLabel(value: string): string {
  return value
    .trim()
    .replace(/^mailto:/i, "")
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "");
}
