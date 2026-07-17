// Structural guards only, no runtime zod: schema correctness is the PR's CI build gate.

import {
  type BoxContributeError,
  type BoxContributeSuccess,
  type ContactEntryInput,
  type CurveEntryInput,
  type DesignSourceInput,
  type DriverProfileInput,
  type EnclosureFrontmatterInput,
  type EnclosureInput,
  MAX_TOTAL_BYTES,
  requiredFieldErrors,
  sanitizeMdxBody,
  validateUploads,
} from "../src/lib/contribute";

// GITHUB_APP_ID / INSTALLATION_ID / REPO_OWNER / REPO_NAME / ASSET_PREFIX are wrangler.toml
// [vars], typed from the generated global `Env` (worker/worker-configuration.d.ts, regenerate
// with `npm run wrangler:types`) so a rename there is a tsc error here instead of silent
// runtime drift. Only the true `wrangler secret put` values are hand-declared, wrangler.toml
// doesn't know about those.
interface BoxContributeSecrets {
  GITHUB_APP_PRIVATE_KEY: string;
  TURNSTILE_SECRET: string;
  E2E_BYPASS_SECRET?: string;
}

export type BoxContributeEnv = BoxContributeSecrets &
  Pick<
    Env,
    "GITHUB_APP_ID" | "GITHUB_APP_INSTALLATION_ID" | "GITHUB_REPO_OWNER" | "GITHUB_REPO_NAME"
  > & {
    // Optional here (unlike the runtime Env, where wrangler.toml always sets a default):
    // BoxContributeEnv is also the type test fixtures build by hand, and most contribute tests
    // never touch ASSET_PREFIX-gated behavior (the Turnstile e2e bypass).
    ASSET_PREFIX?: Env["ASSET_PREFIX"];
  };

// Cloudflare's always-pass test secret, only reachable via the x-e2e-bypass header + secret.
const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";

// Caps the standing unreviewed backlog (and its preview-build CI cost) from farmed submissions.
const MAX_OPEN_CONTRIB_PRS = 50;

interface BoxContributePayload {
  frontmatter: EnclosureInput;
  body?: string;
}

export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function dedupeSlug(slug: string, taken: (candidate: string) => boolean): string {
  if (!taken(slug)) return slug;
  for (let n = 2; ; n++) {
    const candidate = `${slug}-${n}`;
    if (!taken(candidate)) return candidate;
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function yamlScalar(v: unknown): string {
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  // JSON string form is a valid YAML double-quoted scalar and dodges quoting edge cases.
  return JSON.stringify(String(v));
}

// Keys come from the untrusted payload: quote anything that could change YAML structure.
function yamlKey(k: string): string {
  return /^[A-Za-z0-9_-]+$/.test(k) ? k : JSON.stringify(k);
}

function dropUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as Partial<T>;
}

function emitMapping(obj: Record<string, unknown>, indent: number): string[] {
  const pad = "  ".repeat(indent);
  const lines: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      lines.push(`${pad}${yamlKey(k)}:`);
      const itemPad = "  ".repeat(indent + 1);
      for (const item of v) {
        if (isPlainObject(item)) {
          const itemLines = emitMapping(item, indent + 2);
          const first = itemLines[0].slice((indent + 2) * 2);
          lines.push(`${itemPad}- ${first}`);
          for (let i = 1; i < itemLines.length; i++) lines.push(itemLines[i]);
        } else {
          lines.push(`${itemPad}- ${yamlScalar(item)}`);
        }
      }
    } else if (isPlainObject(v)) {
      lines.push(`${pad}${yamlKey(k)}:`);
      lines.push(...emitMapping(v, indent + 1));
    } else {
      lines.push(`${pad}${yamlKey(k)}: ${yamlScalar(v)}`);
    }
  }
  return lines;
}

// Also the allowlist: keys outside it never reach the YAML (verified excluded, contributions can't self-verify).
const KEY_ORDER = [
  "name",
  "category",
  "topology",
  "topologyVariant",
  "buildComplexity",
  "ways",
  "revision",
  "driverProfiles",
  "netVolumeL",
  "grossVolumeL",
  "dims",
  "weightKg",
  "plywoodThicknessMm",
  "sheetCount",
  "sheetSizeMm",
  "specs",
  "sources",
  "images",
  "plans",
  "author",
  "sourceUrl",
  "availability",
  "contact",
  "license",
  "licenseNote",
  "recommendedFor",
  "connectors",
] as const;

// A schema field missing from KEY_ORDER would be silently dropped, so make it a type error.
type MissingFromKeyOrder = Exclude<
  keyof EnclosureFrontmatterInput,
  (typeof KEY_ORDER)[number] | "verified"
>;
const _keyOrderComplete: MissingFromKeyOrder extends never ? true : MissingFromKeyOrder = true;

function orderCurveSet(cs: CurveEntryInput): Record<string, unknown> {
  const curvesIn = (cs.curves ?? {}) as Record<string, { file: string; note?: string } | undefined>;
  const curves: Record<string, unknown> = {};
  for (const [kind, entry] of Object.entries(curvesIn)) {
    if (!entry) continue;
    curves[kind] = dropUndefined({ file: entry.file, note: entry.note });
  }
  return dropUndefined({
    id: cs.id,
    source: cs.source,
    curves: Object.keys(curves).length ? curves : undefined,
    stacked: cs.stacked?.length
      ? cs.stacked.map((s) => dropUndefined({ count: s.count, file: s.file, note: s.note }))
      : undefined,
  });
}

// Readable key order for one profile: id, drivers, then its own curve sets (reordered the same
// way top-level simulations/measurements used to be, before they moved under driverProfiles).
// Every nested object is projected through an explicit field list, same as orderCurveSet and
// orderSource: KEY_ORDER only allowlists top-level keys, so a passthrough here would let
// arbitrary payload keys reach the committed YAML.
function orderDriverProfile(p: DriverProfileInput): Record<string, unknown> {
  return dropUndefined({
    id: p.id,
    drivers: Array.isArray(p.drivers)
      ? p.drivers.map((d) => dropUndefined({ driver: d.driver, qty: d.qty, horn: d.horn }))
      : undefined,
    simulations: p.simulations?.length ? p.simulations.map(orderCurveSet) : undefined,
    measurements: p.measurements?.length ? p.measurements.map(orderCurveSet) : undefined,
  });
}

function orderSource(s: DesignSourceInput): Record<string, unknown> {
  return dropUndefined({ tool: s.tool, file: s.file, note: s.note });
}

function orderContact(c: ContactEntryInput): Record<string, unknown> {
  return dropUndefined({ channel: c.channel, value: c.value, note: c.note });
}

function orderFields(fm: EnclosureInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of KEY_ORDER) {
    const v = fm[k];
    if (v === undefined || v === null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (k === "specs" && isPlainObject(v)) {
      out.specs = dropUndefined(v);
    } else if (k === "driverProfiles" && Array.isArray(v)) {
      out.driverProfiles = (v as DriverProfileInput[]).map(orderDriverProfile);
    } else if (k === "sources" && Array.isArray(v)) {
      out.sources = (v as DesignSourceInput[]).map(orderSource);
    } else if (k === "contact" && Array.isArray(v)) {
      out.contact = (v as ContactEntryInput[]).map(orderContact);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function emitFrontmatter(fm: EnclosureInput, body?: string): string {
  const yaml = emitMapping(orderFields(fm), 0).join("\n");
  const trimmed = sanitizeMdxBody((body ?? "").trim());
  const bodyBlock = trimmed ? `${trimmed}\n` : "";
  return `---\n${yaml}\n---\n\n${bodyBlock}`;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function jwtSegment(obj: unknown): string {
  return base64url(new TextEncoder().encode(JSON.stringify(obj)));
}

export function jwtHeader(): { alg: string; typ: string } {
  return { alg: "RS256", typ: "JWT" };
}

// GitHub App JWT claims: backdate iat 60s for clock skew, 10-minute lifetime (GitHub max).
export function jwtClaims(
  appId: string,
  nowSec: number
): { iat: number; exp: number; iss: string } {
  return { iat: nowSec - 60, exp: nowSec + 600, iss: appId };
}

export function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function json(status: number, body: BoxContributeSuccess | BoxContributeError): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// Every non-2xx response uses this single shape ({ errors }), never the ad hoc { error } some
// endpoints used to return: one contract for the client to parse regardless of failure cause.
function errorJson(status: number, message: string): Response {
  return json(status, { errors: [{ field: "", message }] });
}

const GH_API = "https://api.github.com";

function ghHeaders(token: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "user-agent": "boxdex-box-contribute",
    "x-github-api-version": "2022-11-28",
  };
  if (hasBody) headers["content-type"] = "application/json";
  return headers;
}

async function ghFetch(
  token: string,
  method: string,
  path: string,
  body?: unknown
): Promise<Response> {
  return fetch(`${GH_API}${path}`, {
    method,
    headers: ghHeaders(token, body !== undefined),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function verifyTurnstile(secret: string, token: string, ip: string | null): Promise<boolean> {
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });
  const data = (await res.json()) as { success?: boolean };
  return data.success === true;
}

async function installationToken(env: BoxContributeEnv): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${jwtSegment(jwtHeader())}.${jwtSegment(jwtClaims(env.GITHUB_APP_ID, now))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(env.GITHUB_APP_PRIVATE_KEY),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    new TextEncoder().encode(unsigned)
  );
  const jwt = `${unsigned}.${base64url(new Uint8Array(sig))}`;
  const res = await ghFetch(
    jwt,
    "POST",
    `/app/installations/${env.GITHUB_APP_INSTALLATION_ID}/access_tokens`
  );
  if (!res.ok) throw new Error(`installation token: ${res.status}`);
  const data = (await res.json()) as { token: string };
  return data.token;
}

// Empty slugs (a name with no latin alphanumerics) fall back to "box" so the branch ref stays valid.
// Dedupes against both merged content (data/enclosures/<slug> on main) and any branch already
// named contribute/<slug>, the latter is what a still-open prior PR for the same name leaves
// behind, and colliding with it fails ref creation in openPr with a 422.
export async function resolveSlug(
  name: string,
  token: string,
  env: BoxContributeEnv
): Promise<string> {
  const base = slugify(name) || "box";
  const repo = `/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}`;
  const [dirRes, refsRes] = await Promise.all([
    ghFetch(token, "GET", `${repo}/contents/data/enclosures`),
    // per_page=100: matching-refs defaults to 30, too low for the cap.
    ghFetch(token, "GET", `${repo}/git/matching-refs/heads/contribute/?per_page=100`),
  ]);
  const entries = dirRes.ok ? ((await dirRes.json()) as { name: string }[]) : [];
  const refs = refsRes.ok ? ((await refsRes.json()) as { ref: string }[]) : [];
  if (refs.length >= MAX_OPEN_CONTRIB_PRS) throw new TooManyOpenError(refs.length);
  const taken = new Set([
    ...entries.map((e) => e.name),
    ...refs.map((r) => r.ref.replace(/^refs\/heads\/contribute\//, "")),
  ]);
  return dedupeSlug(base, (s) => taken.has(s));
}

class BranchExistsError extends Error {
  constructor(branch: string) {
    super(`branch already exists: ${branch}`);
  }
}

export class TooManyOpenError extends Error {
  constructor(open: number) {
    super(`too many open contribute PRs: ${open}`);
  }
}

interface RepoFile {
  path: string;
  content: Blob | string;
}

async function fileBase64(content: Blob | string): Promise<string> {
  const bytes =
    typeof content === "string"
      ? new TextEncoder().encode(content)
      : new Uint8Array(await content.arrayBuffer());
  return bytesToBase64(bytes);
}

// Invisible in GitHub's rendered PR body, present in the raw text findExistingSubmission reads
// back: lets a client retry (after a dropped response, a false 502, ...) get the same PR back
// instead of opening a duplicate.
function submissionMarker(submissionId: string): string {
  return `<!-- submission-id: ${submissionId} -->`;
}

// Best-effort dedup against a retried submission: search open PRs for this attempt's marker
// before creating a new branch/commit/PR. A failed lookup (network blip) just falls through to
// a normal create, same residual-risk shape as resolveSlug's own concurrent-slug race.
async function findExistingSubmission(
  token: string,
  env: BoxContributeEnv,
  submissionId: string
): Promise<string | undefined> {
  const repo = `/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}`;
  const res = await ghFetch(token, "GET", `${repo}/pulls?state=open&per_page=100`);
  if (!res.ok) return undefined;
  const prs = (await res.json()) as { html_url: string; body: string | null }[];
  return prs.find((pr) => pr.body?.includes(submissionMarker(submissionId)))?.html_url;
}

async function openPr(
  env: BoxContributeEnv,
  token: string,
  slug: string,
  name: string,
  files: RepoFile[],
  submissionId?: string
): Promise<string> {
  const repo = `/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}`;

  const refRes = await ghFetch(token, "GET", `${repo}/git/ref/heads/main`);
  if (!refRes.ok) throw new Error(`base ref: ${refRes.status}`);
  const baseSha = ((await refRes.json()) as { object: { sha: string } }).object.sha;

  const commitRes = await ghFetch(token, "GET", `${repo}/git/commits/${baseSha}`);
  if (!commitRes.ok) throw new Error(`base commit: ${commitRes.status}`);
  const baseTree = ((await commitRes.json()) as { tree: { sha: string } }).tree.sha;

  // Blob creations are independent: upload concurrently, never all base64 bodies at once.
  const tree = await Promise.all(
    files.map(async (file) => {
      const blobRes = await ghFetch(token, "POST", `${repo}/git/blobs`, {
        content: await fileBase64(file.content),
        encoding: "base64",
      });
      if (!blobRes.ok) throw new Error(`blob ${file.path}: ${blobRes.status}`);
      const sha = ((await blobRes.json()) as { sha: string }).sha;
      return { path: file.path, mode: "100644", type: "blob", sha };
    })
  );

  const treeRes = await ghFetch(token, "POST", `${repo}/git/trees`, { base_tree: baseTree, tree });
  if (!treeRes.ok) throw new Error(`tree: ${treeRes.status}`);
  const treeSha = ((await treeRes.json()) as { sha: string }).sha;

  const newCommitRes = await ghFetch(token, "POST", `${repo}/git/commits`, {
    message: `feat: add box ${name}`,
    tree: treeSha,
    parents: [baseSha],
  });
  if (!newCommitRes.ok) throw new Error(`commit: ${newCommitRes.status}`);
  const newCommitSha = ((await newCommitRes.json()) as { sha: string }).sha;

  const branch = `contribute/${slug}`;
  const refCreateRes = await ghFetch(token, "POST", `${repo}/git/refs`, {
    ref: `refs/heads/${branch}`,
    sha: newCommitSha,
  });
  // 422 here almost always means the branch already exists, resolveSlug already dedupes against
  // it, so this is the residual case of two submissions racing to the same slug concurrently.
  if (refCreateRes.status === 422) throw new BranchExistsError(branch);
  if (!refCreateRes.ok) throw new Error(`ref: ${refCreateRes.status}`);

  const prRes = await ghFetch(token, "POST", `${repo}/pulls`, {
    title: `Add box: ${name}`,
    head: branch,
    base: "main",
    body: prBody(slug, files, submissionId),
  });
  if (!prRes.ok) throw new Error(`pull: ${prRes.status}`);
  const pr = (await prRes.json()) as { html_url: string; number: number };

  // Label is best-effort: a missing "box-contribute" label must not fail (or 502-retry) a
  // submission whose branch, commit, and PR already exist.
  try {
    await ghFetch(token, "POST", `${repo}/issues/${pr.number}/labels`, {
      labels: ["box-contribute"],
    });
  } catch {
    // ignored, see comment above
  }

  return pr.html_url;
}

function prBody(slug: string, files: RepoFile[], submissionId?: string): string {
  const assets = files
    .map((f) => f.path.replace(`data/enclosures/${slug}/`, ""))
    .map((p) => `- ${p}`)
    .join("\n");
  return [
    "Submitted via the box-contribute form.",
    "",
    `Slug: \`${slug}\``,
    "",
    "Files:",
    assets,
    "",
    "The CI build validates the frontmatter against the content schema.",
    ...(submissionId ? ["", submissionMarker(submissionId)] : []),
  ].join("\n");
}

export async function handleBoxContribute(
  request: Request,
  env: BoxContributeEnv
): Promise<Response> {
  // Fast-reject when a declared length already exceeds the cap. A missing/garbage header
  // just skips this: validateUploads re-sums the parsed sizes as the real authority.
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_TOTAL_BYTES + 2 * 1024 * 1024) {
    return errorJson(413, "request too large");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorJson(400, "expected multipart/form-data");
  }

  const payloadRaw = form.get("payload");
  if (typeof payloadRaw !== "string") {
    return errorJson(400, "missing payload");
  }
  let payload: BoxContributePayload;
  try {
    payload = JSON.parse(payloadRaw) as BoxContributePayload;
  } catch {
    return errorJson(400, "payload is not valid JSON");
  }
  const fm = payload.frontmatter;
  if (!fm || typeof fm !== "object") {
    return errorJson(400, "payload.frontmatter missing");
  }

  const turnstileToken = form.get("cf-turnstile-response");
  if (typeof turnstileToken !== "string" || turnstileToken.length === 0) {
    return errorJson(400, "missing Turnstile token");
  }

  // Set by the client once per submit-attempt sequence, reused across retries of the same
  // attempt so a dropped response or a false 502 doesn't open a duplicate PR.
  const submissionIdRaw = form.get("submissionId");
  const submissionId =
    typeof submissionIdRaw === "string" && submissionIdRaw.length > 0 ? submissionIdRaw : undefined;

  // Non-string form entries are uploads, keyed by the filename the frontmatter references.
  const uploads: { name: string; size: number; blob: File }[] = [];
  for (const [k, v] of form.entries()) {
    if (k === "payload" || k === "cf-turnstile-response" || k === "submissionId") continue;
    if (typeof v === "string") continue;
    uploads.push({ name: k, size: v.size, blob: v });
  }

  // Local validation first: a fixable 422 must not consume the single-use Turnstile token.
  const errors = [...requiredFieldErrors(fm), ...validateUploads(fm, uploads)];
  if (errors.length > 0) return json(422, { errors });

  // Never honor the CAPTCHA bypass on production, even if the secret is somehow set there.
  const bypassed =
    env.ASSET_PREFIX !== "production" &&
    !!env.E2E_BYPASS_SECRET &&
    request.headers.get("x-e2e-bypass") === env.E2E_BYPASS_SECRET;
  const ok = await verifyTurnstile(
    bypassed ? TURNSTILE_TEST_SECRET : env.TURNSTILE_SECRET,
    turnstileToken,
    request.headers.get("cf-connecting-ip")
  );
  if (!ok) return errorJson(403, "Turnstile verification failed");

  try {
    const token = await installationToken(env);

    if (submissionId) {
      const existing = await findExistingSubmission(token, env, submissionId);
      if (existing) return json(200, { prUrl: existing });
    }

    const slug = await resolveSlug(fm.name ?? "box", token, env);

    const files: RepoFile[] = [
      { path: `data/enclosures/${slug}/index.mdx`, content: emitFrontmatter(fm, payload.body) },
      ...uploads.map((u) => ({ path: `data/enclosures/${slug}/${u.name}`, content: u.blob })),
    ];

    const prUrl = await openPr(env, token, slug, fm.name ?? slug, files, submissionId);
    return json(200, { prUrl });
  } catch (e) {
    console.log(JSON.stringify({ event: "add_box_error", message: String(e) }));
    if (e instanceof BranchExistsError) {
      return errorJson(409, "a submission with this name is already pending review, please retry");
    }
    if (e instanceof TooManyOpenError) {
      return errorJson(429, "too many submissions are pending review, please try again later");
    }
    return errorJson(502, "failed to open pull request");
  }
}
