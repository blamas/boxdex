// Pure visitor-classification helpers, kept free of Cloudflare types so they unit-test in
// vitest. Never touch raw IP/UA beyond deriving the values below, see ADR-013.

// Cloudflare docs: low botManagement.score means high confidence the request is automated.
// 30 is a conservative cut, tune here if false-positive/negative rates warrant it.
const BOT_SCORE_THRESHOLD = 30;

const BROWSERS: [RegExp, string][] = [
  [/Edg\//, "Edge"],
  [/OPR\//, "Opera"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/Firefox\//, "Firefox"],
  [/CriOS\//, "Chrome"],
  [/Chrome\//, "Chrome"],
  [/FxiOS\//, "Firefox"],
  [/Version\/.*Safari\//, "Safari"],
  [/Safari\//, "Safari"],
];

const OSES: [RegExp, string][] = [
  [/iPhone|iPad|iPod/, "iOS"],
  [/Android/, "Android"],
  [/Windows/, "Windows"],
  [/Mac OS X/, "macOS"],
  [/Linux/, "Linux"],
];

function deviceType(ua: string): string {
  if (/iPad|Tablet/.test(ua)) return "tablet";
  if (/Mobile|iPhone|Android/.test(ua)) return "mobile";
  return "desktop";
}

// Coarse "Browser/OS/device" bucket, never the raw UA string: thousands of real visitors
// share each bucket, so it carries no fingerprinting value on its own.
export function classifyClient(userAgent: string | null): string {
  if (!userAgent) return "unknown";
  const browser = BROWSERS.find(([re]) => re.test(userAgent))?.[1] ?? "Other";
  const os = OSES.find(([re]) => re.test(userAgent))?.[1] ?? "Other";
  return `${browser}/${os}/${deviceType(userAgent)}`;
}

export function isBot(bm: { score?: number; verifiedBot?: boolean } | undefined): boolean {
  if (!bm) return false;
  if (bm.verifiedBot) return true;
  return typeof bm.score === "number" && bm.score <= BOT_SCORE_THRESHOLD;
}

// Truncated SHA-256 of salt+period+ip+client. Callers pass a "YYYY-MM" period, so the same
// visitor hashes the same all month (enables monthly-unique counts) but differently next
// month: no cross-month correlation is possible even with full log access. Never log the
// inputs, only this output.
export async function hashVisitor(
  salt: string,
  period: string,
  ip: string,
  client: string
): Promise<string> {
  const input = `${salt}:${period}:${ip}:${client}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 16);
}
