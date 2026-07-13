// Structural guards only, no runtime zod: schema correctness is the PR's CI build gate.

import {
  type ContactEntryInput,
  type CurveEntryInput,
  type DesignSourceInput,
  type EnclosureFrontmatterInput,
  type EnclosureInput,
  MAX_TOTAL_BYTES,
  requiredFieldErrors,
  validateUploads,
} from "../src/lib/contribute";

export interface BoxContributeEnv {
  GITHUB_APP_ID: string;
  GITHUB_APP_INSTALLATION_ID: string;
  GITHUB_REPO_OWNER: string;
  GITHUB_REPO_NAME: string;
  GITHUB_APP_PRIVATE_KEY: string;
  TURNSTILE_SECRET: string;
  E2E_BYPASS_SECRET?: string;
}

// Cloudflare's always-pass test secret, only reachable via the x-e2e-bypass header + secret.
const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";

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
  "driverCount",
  "drivers",
  "netVolumeL",
  "grossVolumeL",
  "dims",
  "weightKg",
  "plywoodThicknessMm",
  "sheetCount",
  "sheetSizeMm",
  "specs",
  "simulations",
  "measurements",
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

function orderCurve(c: CurveEntryInput): Record<string, unknown> {
  return dropUndefined({
    driver: c.driver,
    kind: c.kind,
    source: c.source,
    file: c.file,
    count: c.count,
    note: c.note,
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
    } else if (k === "simulations" && Array.isArray(v)) {
      out.simulations = (v as CurveEntryInput[]).map(orderCurve);
    } else if (k === "measurements" && Array.isArray(v)) {
      out.measurements = (v as CurveEntryInput[]).map(orderCurve);
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
  const trimmed = (body ?? "").trim();
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

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
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
async function resolveSlug(name: string, token: string, env: BoxContributeEnv): Promise<string> {
  const base = slugify(name) || "box";
  const repo = `/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}`;
  const [dirRes, refsRes] = await Promise.all([
    ghFetch(token, "GET", `${repo}/contents/data/enclosures`),
    ghFetch(token, "GET", `${repo}/git/matching-refs/heads/contribute/`),
  ]);
  const entries = dirRes.ok ? ((await dirRes.json()) as { name: string }[]) : [];
  const refs = refsRes.ok ? ((await refsRes.json()) as { ref: string }[]) : [];
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

async function openPr(
  env: BoxContributeEnv,
  token: string,
  slug: string,
  name: string,
  files: RepoFile[]
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
    body: prBody(slug, files),
  });
  if (!prRes.ok) throw new Error(`pull: ${prRes.status}`);
  const pr = (await prRes.json()) as { html_url: string; number: number };

  // Label is best-effort: a missing "box-contribute" label must not fail the submission.
  await ghFetch(token, "POST", `${repo}/issues/${pr.number}/labels`, {
    labels: ["box-contribute"],
  });

  return pr.html_url;
}

function prBody(slug: string, files: RepoFile[]): string {
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
  ].join("\n");
}

export async function handleBoxContribute(
  request: Request,
  env: BoxContributeEnv
): Promise<Response> {
  // Reject oversized bodies before formData() buffers everything into Worker memory.
  const contentLength = Number(request.headers.get("content-length"));
  if (contentLength > MAX_TOTAL_BYTES + 2 * 1024 * 1024) {
    return json(413, { error: "request too large" });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json(400, { error: "expected multipart/form-data" });
  }

  const payloadRaw = form.get("payload");
  if (typeof payloadRaw !== "string") {
    return json(400, { error: "missing payload" });
  }
  let payload: BoxContributePayload;
  try {
    payload = JSON.parse(payloadRaw) as BoxContributePayload;
  } catch {
    return json(400, { error: "payload is not valid JSON" });
  }
  const fm = payload.frontmatter;
  if (!fm || typeof fm !== "object") {
    return json(400, { error: "payload.frontmatter missing" });
  }

  const turnstileToken = form.get("cf-turnstile-response");
  if (typeof turnstileToken !== "string" || turnstileToken.length === 0) {
    return json(400, { error: "missing Turnstile token" });
  }

  // Non-string form entries are uploads, keyed by the filename the frontmatter references.
  const uploads: { name: string; size: number; blob: File }[] = [];
  for (const [k, v] of form.entries()) {
    if (k === "payload" || k === "cf-turnstile-response") continue;
    if (typeof v === "string") continue;
    uploads.push({ name: k, size: v.size, blob: v });
  }

  // Local validation first: a fixable 422 must not consume the single-use Turnstile token.
  const errors = [...requiredFieldErrors(fm), ...validateUploads(fm, uploads)];
  if (errors.length > 0) return json(422, { errors });

  const bypassed =
    !!env.E2E_BYPASS_SECRET && request.headers.get("x-e2e-bypass") === env.E2E_BYPASS_SECRET;
  const ok = await verifyTurnstile(
    bypassed ? TURNSTILE_TEST_SECRET : env.TURNSTILE_SECRET,
    turnstileToken,
    request.headers.get("cf-connecting-ip")
  );
  if (!ok) return json(403, { error: "Turnstile verification failed" });

  try {
    const token = await installationToken(env);
    const slug = await resolveSlug(fm.name ?? "box", token, env);

    const files: RepoFile[] = [
      { path: `data/enclosures/${slug}/index.mdx`, content: emitFrontmatter(fm, payload.body) },
      ...uploads.map((u) => ({ path: `data/enclosures/${slug}/${u.name}`, content: u.blob })),
    ];

    const prUrl = await openPr(env, token, slug, fm.name ?? slug, files);
    return json(200, { prUrl });
  } catch (e) {
    console.log(JSON.stringify({ event: "add_box_error", message: String(e) }));
    if (e instanceof BranchExistsError) {
      return json(409, {
        error: "a submission with this name is already pending review, please retry",
      });
    }
    return json(502, { error: "failed to open pull request" });
  }
}
