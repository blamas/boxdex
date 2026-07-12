import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type BoxContributeEnv,
  bytesToBase64,
  handleBoxContribute,
} from "../worker/box-contribute";

// End to end against a mocked network: siteverify and every GitHub API call are stubbed.

interface RecordedCall {
  method: string;
  url: string;
  body?: Record<string, unknown>;
}

let calls: RecordedCall[] = [];
let turnstileOk = true;
let failPulls = false;

function jsonRes(obj: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(obj), { status }));
}

function fetchMock(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  const method = init?.method ?? "GET";
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
  calls.push({ method, url, body });
  if (url.includes("siteverify")) return jsonRes({ success: turnstileOk });
  if (url.includes("/access_tokens")) return jsonRes({ token: "install-token" });
  if (url.endsWith("/contents/data/enclosures")) return jsonRes([{ name: "fk-br-18" }]);
  if (url.includes("/git/ref/heads/main")) return jsonRes({ object: { sha: "base-sha" } });
  if (url.includes("/git/commits/base-sha")) return jsonRes({ tree: { sha: "base-tree" } });
  if (url.endsWith("/git/blobs")) return jsonRes({ sha: `blob-${calls.length}` });
  if (url.endsWith("/git/trees")) return jsonRes({ sha: "new-tree" });
  if (url.endsWith("/git/commits")) return jsonRes({ sha: "new-commit" });
  if (url.endsWith("/git/refs")) return jsonRes({});
  if (url.endsWith("/pulls")) {
    return failPulls
      ? jsonRes({}, 500)
      : jsonRes({ html_url: "https://github.com/blamas/boxdex/pull/7", number: 7 });
  }
  if (url.includes("/labels")) return jsonRes({});
  return jsonRes({ error: `unmocked ${url}` }, 500);
}

let env: BoxContributeEnv;

beforeAll(async () => {
  const kp = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"]
  )) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
  env = {
    GITHUB_APP_ID: "123",
    GITHUB_APP_INSTALLATION_ID: "456",
    GITHUB_REPO_OWNER: "blamas",
    GITHUB_REPO_NAME: "boxdex",
    GITHUB_APP_PRIVATE_KEY: `-----BEGIN PRIVATE KEY-----\n${bytesToBase64(pkcs8)}\n-----END PRIVATE KEY-----`,
    TURNSTILE_SECRET: "ts-secret",
  };
});

beforeEach(() => {
  calls = [];
  turnstileOk = true;
  failPulls = false;
  vi.stubGlobal("fetch", fetchMock);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

function validFm(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "FK BR 18",
    category: "sub",
    topology: "bass_reflex",
    drivers: ["faital-18hp1060-8"],
    netVolumeL: 280,
    dims: { hMm: 730, wMm: 730, dMm: 650 },
    specs: { f3Hz: 38 },
    license: "CC0-1.0",
    ...overrides,
  };
}

function makeRequest(
  fm: unknown,
  files: Record<string, string> = {},
  token: string | null = "tok"
): Request {
  const fd = new FormData();
  fd.append("payload", JSON.stringify({ frontmatter: fm, body: "Build notes." }));
  if (token !== null) fd.append("cf-turnstile-response", token);
  for (const [name, content] of Object.entries(files)) fd.append(name, new File([content], name));
  return new Request("http://localhost/api/box-contribute", { method: "POST", body: fd });
}

const siteverifyCalls = () => calls.filter((c) => c.url.includes("siteverify"));

describe("handleBoxContribute", () => {
  it("rejects oversized bodies with 413 before reading the form", async () => {
    const request = {
      headers: new Headers({ "content-length": String(200 * 1024 * 1024) }),
    } as unknown as Request;
    const res = await handleBoxContribute(request, env);
    expect(res.status).toBe(413);
  });

  it("400s on a missing payload part", async () => {
    const fd = new FormData();
    fd.append("cf-turnstile-response", "tok");
    const res = await handleBoxContribute(
      new Request("http://localhost/api/box-contribute", { method: "POST", body: fd }),
      env
    );
    expect(res.status).toBe(400);
  });

  it("400s on a payload that is not JSON", async () => {
    const fd = new FormData();
    fd.append("payload", "{nope");
    fd.append("cf-turnstile-response", "tok");
    const res = await handleBoxContribute(
      new Request("http://localhost/api/box-contribute", { method: "POST", body: fd }),
      env
    );
    expect(res.status).toBe(400);
  });

  it("400s on a missing Turnstile token", async () => {
    const res = await handleBoxContribute(makeRequest(validFm(), {}, null), env);
    expect(res.status).toBe(400);
  });

  it("422s on validation errors WITHOUT consuming the Turnstile token", async () => {
    const res = await handleBoxContribute(makeRequest({}, {}), env);
    expect(res.status).toBe(422);
    const data = (await res.json()) as { errors: { field: string }[] };
    expect(data.errors.map((e) => e.field)).toContain("name");
    // The single-use token must survive a fixable rejection: no siteverify call.
    expect(siteverifyCalls()).toHaveLength(0);
  });

  it("403s when Turnstile verification fails", async () => {
    turnstileOk = false;
    const res = await handleBoxContribute(makeRequest(validFm(), {}), env);
    expect(res.status).toBe(403);
    expect(siteverifyCalls()).toHaveLength(1);
  });

  it("opens a PR on a deduped slug with index.mdx plus uploads, and labels it", async () => {
    const res = await handleBoxContribute(
      makeRequest(validFm({ images: ["a.png"] }), { "a.png": "img-bytes" }),
      env
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ prUrl: "https://github.com/blamas/boxdex/pull/7" });

    // fk-br-18 is taken in the mocked listing, so the slug dedupes to fk-br-18-2.
    const ref = calls.find((c) => c.url.endsWith("/git/refs"));
    expect(ref?.body?.ref).toBe("refs/heads/contribute/fk-br-18-2");

    const tree = calls.find((c) => c.url.endsWith("/git/trees"));
    const treeEntries = (tree?.body?.tree ?? []) as { path: string }[];
    const paths = treeEntries.map((t) => t.path);
    expect(paths).toEqual([
      "data/enclosures/fk-br-18-2/index.mdx",
      "data/enclosures/fk-br-18-2/a.png",
    ]);

    const blobs = calls.filter((c) => c.url.endsWith("/git/blobs"));
    const contents = blobs.map((c) => atob(c.body?.content as string));
    const mdx = contents.find((c) => c.startsWith("---\n"));
    expect(mdx).toContain('name: "FK BR 18"');
    expect(mdx).toContain("Build notes.");
    expect(contents).toContain("img-bytes");

    const label = calls.find((c) => c.url.includes("/labels"));
    expect(label?.body?.labels).toEqual(["box-contribute"]);
  });

  it('falls back to the slug "box" when the name has no latin alphanumerics', async () => {
    const res = await handleBoxContribute(makeRequest(validFm({ name: "!!!" }), {}), env);
    expect(res.status).toBe(200);
    const ref = calls.find((c) => c.url.endsWith("/git/refs"));
    expect(ref?.body?.ref).toBe("refs/heads/contribute/box");
  });

  it("502s when a GitHub call fails", async () => {
    failPulls = true;
    const res = await handleBoxContribute(makeRequest(validFm(), {}), env);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "failed to open pull request" });
  });
});
