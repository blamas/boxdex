import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type EnclosureInput,
  isSafeUploadName,
  MAX_FILE_BYTES,
  MAX_IMAGES,
  MAX_TOTAL_BYTES,
  referencedFiles,
  requiredFieldErrors,
  sanitizeMdxBody,
  validateUploads,
} from "../src/lib/contribute";
import { enclosureFrontmatterSchema } from "../src/lib/schemas";
import {
  type BoxContributeEnv,
  bytesToBase64,
  dedupeSlug,
  emitFrontmatter,
  jwtClaims,
  jwtHeader,
  jwtSegment,
  pemToArrayBuffer,
  resolveSlug,
  slugify,
  TooManyOpenError,
} from "../worker/box-contribute";

// A minimal box that satisfies the real content schema, reused across emit/validate tests.
function validBox(): EnclosureInput {
  return {
    name: "FK BR 18",
    category: "sub",
    topology: "bass_reflex",
    driverProfiles: [{ id: "default", drivers: [{ driver: "faital-18hp1060-8", qty: 1 }] }],
    netVolumeL: 280,
    dims: { hMm: 730, wMm: 730, dMm: 650 },
    specs: { f3Hz: 38, fbHz: 44 },
    license: "CC0-1.0",
  };
}

describe("slugify", () => {
  it("kebab-cases a name", () => {
    expect(slugify("FK BR 18")).toBe("fk-br-18");
  });

  it("strips accents and punctuation", () => {
    expect(slugify("Café Sub! (v2)")).toBe("cafe-sub-v2");
  });

  it("trims leading and trailing separators", () => {
    expect(slugify("  --Hello--  ")).toBe("hello");
  });

  it('returns empty when nothing survives (handler falls back to "box")', () => {
    expect(slugify("日本語")).toBe("");
  });
});

describe("dedupeSlug", () => {
  it("returns the base slug when free", () => {
    expect(dedupeSlug("fk-br-18", () => false)).toBe("fk-br-18");
  });

  it("appends the first free numeric suffix", () => {
    const taken = new Set(["fk-br-18", "fk-br-18-2"]);
    expect(dedupeSlug("fk-br-18", (s) => taken.has(s))).toBe("fk-br-18-3");
  });
});

describe("referencedFiles", () => {
  it("collects every referenced filename with its role and field", () => {
    const fm: EnclosureInput = {
      images: ["a.png"],
      plans: ["p.pdf"],
      driverProfiles: [
        {
          id: "default",
          drivers: [{ driver: "faital-18hp1060-8", qty: 1 }],
          simulations: [{ id: "row", source: "hornresp_sim", curves: { spl: { file: "s.csv" } } }],
          measurements: [{ id: "row", source: "rew_measured", curves: { spl: { file: "m.csv" } } }],
        },
      ],
      sources: [{ tool: "hornresp", file: "proj.txt" }],
    };
    expect(referencedFiles(fm)).toEqual([
      { name: "a.png", role: "image", field: "images" },
      { name: "p.pdf", role: "pdf", field: "plans" },
      { name: "s.csv", role: "csv", field: "driverProfiles.0.simulations.0.curves.spl.file" },
      { name: "m.csv", role: "csv", field: "driverProfiles.0.measurements.0.curves.spl.file" },
      { name: "proj.txt", role: "source", field: "sources.0.file" },
    ]);
  });
});

describe("validateUploads", () => {
  const fm: EnclosureInput = {
    images: ["a.png"],
    plans: ["p.pdf"],
    driverProfiles: [
      {
        id: "default",
        drivers: [{ driver: "faital-18hp1060-8", qty: 1 }],
        simulations: [{ id: "row", source: "hornresp_sim", curves: { spl: { file: "s.csv" } } }],
      },
    ],
  };
  const okUploads = [
    { name: "a.png", size: 1000 },
    { name: "p.pdf", size: 2000 },
    { name: "s.csv", size: 500 },
  ];

  it("passes a well-formed set", () => {
    expect(validateUploads(fm, okUploads)).toEqual([]);
  });

  it("flags a referenced file with no upload", () => {
    const errors = validateUploads(
      fm,
      okUploads.filter((u) => u.name !== "s.csv")
    );
    expect(errors).toContainEqual(
      expect.objectContaining({
        field: "driverProfiles.0.simulations.0.curves.spl.file",
        message: 'no uploaded file named "s.csv"',
      })
    );
  });

  it("flags an uploaded file that is not referenced", () => {
    const errors = validateUploads(fm, [...okUploads, { name: "orphan.png", size: 10 }]);
    expect(errors).toContainEqual(
      expect.objectContaining({
        field: "files",
        message: 'uploaded file "orphan.png" is not referenced',
      })
    );
  });

  it("flags duplicate upload filenames (they would collide on one repo path)", () => {
    const errors = validateUploads(fm, [...okUploads, { name: "a.png", size: 10 }]);
    expect(errors).toContainEqual(
      expect.objectContaining({ field: "files", message: 'duplicate filename "a.png"' })
    );
  });

  it("flags a wrong extension for the role", () => {
    const bad: EnclosureInput = { images: ["a.txt"] };
    const errors = validateUploads(bad, [{ name: "a.txt", size: 10 }]);
    expect(errors.some((e) => e.field === "images" && /must be one of/.test(e.message))).toBe(true);
  });

  it("flags an oversize file", () => {
    const errors = validateUploads(fm, [
      { name: "a.png", size: MAX_FILE_BYTES + 1 },
      { name: "p.pdf", size: 2000 },
      { name: "s.csv", size: 500 },
    ]);
    expect(errors.some((e) => e.field === "files" && /per-file limit/.test(e.message))).toBe(true);
  });

  it("flags when the total across uploads exceeds the aggregate cap", () => {
    const half = Math.ceil(MAX_TOTAL_BYTES / 2) + 1;
    const errors = validateUploads(fm, [
      { name: "a.png", size: half },
      { name: "p.pdf", size: half },
      { name: "s.csv", size: 500 },
    ]);
    expect(errors).toContainEqual(
      expect.objectContaining({ field: "files", key: "totalTooLarge" })
    );
  });

  it("rejects path-traversal and non-basename upload names", () => {
    for (const name of ["../evil.png", "a/b.png", "..\\evil.png", ".hidden.png"]) {
      const bad: EnclosureInput = { images: [name] };
      const errors = validateUploads(bad, [{ name, size: 10 }]);
      expect(errors).toContainEqual(
        expect.objectContaining({ field: "files", key: "fileBadName", params: { name } })
      );
    }
  });

  it("attaches a translation key and params to each error, for the client's i18n layer", () => {
    const errors = validateUploads(
      fm,
      okUploads.filter((u) => u.name !== "s.csv")
    );
    expect(errors).toContainEqual(
      expect.objectContaining({
        field: "driverProfiles.0.simulations.0.curves.spl.file",
        key: "fileMissing",
        params: { name: "s.csv" },
      })
    );
  });

  it("flags too many images", () => {
    const many = Array.from({ length: MAX_IMAGES + 1 }, (_, i) => `img${i}.png`);
    const errors = validateUploads(
      { images: many },
      many.map((name) => ({ name, size: 1 }))
    );
    expect(errors).toContainEqual(
      expect.objectContaining({ field: "images", message: `at most ${MAX_IMAGES} images` })
    );
  });

  it("degrades structurally malformed payloads to validation errors instead of throwing", () => {
    // The worker runs this on raw untrusted JSON before any schema validation: a list that
    // isn't an array (or a null element) must produce a 400-shaped error list, never a 500.
    const malformed = [
      { driverProfiles: "not-an-array" },
      { driverProfiles: [null] },
      { driverProfiles: [{ id: "p", simulations: 5 }] },
      { driverProfiles: [{ id: "p", simulations: [{ id: "cs", curves: "x", stacked: 7 }] }] },
      { images: "a.png", plans: 3, sources: [null] },
    ] as unknown as EnclosureInput[];
    for (const fm of malformed) {
      expect(() => validateUploads(fm, [{ name: "orphan.png", size: 1 }])).not.toThrow();
    }
  });
});

describe("requiredFieldErrors", () => {
  it("reports every missing required field on an empty box", () => {
    const fields = requiredFieldErrors({}).map((e) => e.field);
    expect(fields).toEqual(
      expect.arrayContaining([
        "name",
        "category",
        "license",
        "driverProfiles",
        "netVolumeL",
        "dims",
        "specs.f3Hz",
      ])
    );
  });

  it("passes a complete box", () => {
    expect(requiredFieldErrors(validBox())).toEqual([]);
  });
});

describe("emitFrontmatter", () => {
  it("emits schema-valid frontmatter whose source object passes the real schema", () => {
    const fm: EnclosureInput = {
      ...validBox(),
      driverProfiles: [
        {
          id: "default",
          drivers: [{ driver: "faital-18hp1060-8", qty: 1 }],
          simulations: [{ id: "row", source: "hornresp_sim", curves: { spl: { file: "s.csv" } } }],
        },
      ],
      recommendedFor: ["techno"],
      connectors: ["speakON NL4"],
    };
    // The object the emitter serializes must satisfy the content schema.
    expect(enclosureFrontmatterSchema.safeParse(fm).success).toBe(true);

    const out = emitFrontmatter(fm, "18 inch bass reflex sub.");
    expect(out.startsWith("---\n")).toBe(true);
    expect(out).toContain('name: "FK BR 18"');
    expect(out).toContain("f3Hz: 38");
    expect(out).toContain(
      'simulations:\n      - id: "row"\n        source: "hornresp_sim"\n        curves:\n          spl:\n            file: "s.csv"'
    );
    expect(out.trimEnd().endsWith("18 inch bass reflex sub.")).toBe(true);
  });

  it("omits empty arrays and undefined fields", () => {
    const out = emitFrontmatter(validBox());
    expect(out).not.toContain("simulations:");
    expect(out).not.toContain("images:");
    expect(out).not.toContain("weightKg:");
  });

  it("skips array items that carry no fields instead of throwing", () => {
    // Regression: an empty profile object reached the emitter and surfaced as a 502.
    const fm = {
      ...validBox(),
      driverProfiles: [{}],
    } as unknown as EnclosureInput;
    expect(() => emitFrontmatter(fm)).not.toThrow();
  });

  it("skips empty objects in a contact array without corrupting the yaml", () => {
    const fm = {
      ...validBox(),
      availability: "contact",
      contact: [{}, { channel: "email", value: "a@b.co" }],
    } as unknown as EnclosureInput;
    const out = emitFrontmatter(fm);
    expect(out).toContain('- channel: "email"');
    expect(out).not.toContain("- \n");
  });

  it("never emits keys outside the allowlist (no self-verified submissions)", () => {
    const fm = { ...validBox(), verified: true, evil: "x" } as EnclosureInput;
    const out = emitFrontmatter(fm);
    expect(out).not.toContain("verified");
    expect(out).not.toContain("evil");
  });

  it("strips unknown keys from nested driver entries (top-level allowlist doesn't reach them)", () => {
    const fm = {
      ...validBox(),
      driverProfiles: [
        {
          id: "default",
          drivers: [{ driver: "faital-18hp1060-8", qty: 1, evil: "x" }],
          junk: true,
        },
      ],
    } as unknown as EnclosureInput;
    const out = emitFrontmatter(fm);
    expect(out).toContain('driver: "faital-18hp1060-8"');
    expect(out).not.toContain("evil");
    expect(out).not.toContain("junk");
  });

  it("quotes structurally unsafe keys inside untrusted nested objects", () => {
    const fm = { ...validBox(), specs: { f3Hz: 38, "x:\ny": 1 } } as unknown as EnclosureInput;
    const out = emitFrontmatter(fm);
    expect(out).toContain('"x:\\ny": 1');
  });

  it("neutralizes executable MDX in the submitted body", () => {
    const out = emitFrontmatter(
      validBox(),
      "export const x = 1\nHi {globalThis} <img onerror='x'>"
    );
    expect(out).not.toContain("export const");
    expect(out).not.toContain("{globalThis}");
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });

  it("requires count on a stacked entry (schema rule the client mirrors)", () => {
    const fm: EnclosureInput = {
      ...validBox(),
      driverProfiles: [
        {
          id: "default",
          drivers: [{ driver: "faital-18hp1060-8", qty: 1 }],
          simulations: [
            {
              id: "row",
              source: "hornresp_sim",
              curves: { spl: { file: "s1.csv" } },
              stacked: [{ file: "s4.csv" } as unknown as { count: number; file: string }],
            },
          ],
        },
      ],
    };
    expect(enclosureFrontmatterSchema.safeParse(fm).success).toBe(false);
  });

  it("rejects a stacked entry with no plain spl sibling in the same curve set", () => {
    const fm: EnclosureInput = {
      ...validBox(),
      driverProfiles: [
        {
          id: "default",
          drivers: [{ driver: "faital-18hp1060-8", qty: 1 }],
          simulations: [
            {
              id: "row",
              source: "hornresp_sim",
              stacked: [{ count: 4, file: "s4.csv" }],
            },
          ],
        },
      ],
    };
    expect(enclosureFrontmatterSchema.safeParse(fm).success).toBe(false);
  });

  it("emits availability and the contact sequence-of-objects", () => {
    const fm: EnclosureInput = {
      ...validBox(),
      availability: "contact",
      contact: [
        { channel: "profile", value: "instagram.com/boxbuilder" },
        { channel: "email", value: "plans@example.com", note: "ask for the 21 inch" },
      ],
    };
    expect(enclosureFrontmatterSchema.safeParse(fm).success).toBe(true);
    const out = emitFrontmatter(fm);
    expect(out).toContain('availability: "contact"');
    expect(out).toContain(
      'contact:\n  - channel: "profile"\n    value: "instagram.com/boxbuilder"'
    );
    expect(out).toContain('note: "ask for the 21 inch"');
  });
});

describe("isSafeUploadName", () => {
  it("accepts plain basenames", () => {
    for (const name of ["a.png", "my-plan.pdf", "sim_4x.csv", "photo.2.jpg"]) {
      expect(isSafeUploadName(name)).toBe(true);
    }
  });

  it("rejects separators, traversal, leading dots, and control chars", () => {
    for (const name of ["../x.png", "a/b.png", "a\\b.png", "..", ".env", "a\nb.png", ""]) {
      expect(isSafeUploadName(name)).toBe(false);
    }
  });
});

describe("sanitizeMdxBody", () => {
  it("drops ESM import/export statement lines", () => {
    const out = sanitizeMdxBody("import x from 'y'\nexport const z = 1\nreal prose");
    expect(out).toBe("real prose");
  });

  it("escapes expression braces and tag openers", () => {
    expect(sanitizeMdxBody("a {code} b")).toBe("a \\{code\\} b");
    expect(sanitizeMdxBody("<Component/>")).toBe("&lt;Component/>");
  });

  it("leaves ordinary prose untouched", () => {
    expect(sanitizeMdxBody("18 inch bass reflex sub, 280 L net.")).toBe(
      "18 inch bass reflex sub, 280 L net."
    );
  });
});

describe("availability dead-end guard", () => {
  it("rejects contact/commission with no contact channel and no sourceUrl", () => {
    const fm: EnclosureInput = { ...validBox(), availability: "contact" };
    expect(enclosureFrontmatterSchema.safeParse(fm).success).toBe(false);
  });

  it("accepts contact when a sourceUrl points somewhere", () => {
    const fm: EnclosureInput = {
      ...validBox(),
      availability: "contact",
      sourceUrl: "https://shop.example.com",
    };
    expect(enclosureFrontmatterSchema.safeParse(fm).success).toBe(true);
  });

  it("accepts contact when a contact channel is present", () => {
    const fm: EnclosureInput = {
      ...validBox(),
      availability: "contact",
      contact: [{ channel: "email", value: "a@b.com" }],
    };
    expect(enclosureFrontmatterSchema.safeParse(fm).success).toBe(true);
  });

  it("does not require a channel for a free box", () => {
    const fm: EnclosureInput = { ...validBox(), availability: "free" };
    expect(enclosureFrontmatterSchema.safeParse(fm).success).toBe(true);
  });
});

describe("bytesToBase64", () => {
  it("matches standard base64", () => {
    expect(bytesToBase64(new TextEncoder().encode("hi"))).toBe("aGk=");
  });
});

describe("pemToArrayBuffer", () => {
  it("round-trips the DER bytes out of a PEM envelope", () => {
    const der = new Uint8Array([1, 2, 3, 4, 250, 128, 0]);
    const pem = `-----BEGIN PRIVATE KEY-----\n${bytesToBase64(der)}\n-----END PRIVATE KEY-----\n`;
    expect(new Uint8Array(pemToArrayBuffer(pem))).toEqual(der);
  });
});

describe("jwt shaping", () => {
  it("uses RS256 in the header", () => {
    expect(jwtHeader()).toEqual({ alg: "RS256", typ: "JWT" });
  });

  it("backdates iat and sets a 10-minute expiry with the app id as issuer", () => {
    expect(jwtClaims("12345", 1_000_000)).toEqual({ iat: 999_940, exp: 1_000_600, iss: "12345" });
  });

  it("produces url-safe base64 segments that decode back to the object", () => {
    const seg = jwtSegment({ a: 1, b: "x" });
    expect(seg).not.toMatch(/[+/=]/);
    const b64 = seg.replace(/-/g, "+").replace(/_/g, "/");
    expect(JSON.parse(atob(b64))).toEqual({ a: 1, b: "x" });
  });
});

describe("resolveSlug open-PR cap", () => {
  const env = { GITHUB_REPO_OWNER: "blamas", GITHUB_REPO_NAME: "boxdex" } as BoxContributeEnv;

  // Stub GitHub: matching-refs returns `openCount` contribute branches, the dir listing is empty.
  function stubGh(openCount: number): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("matching-refs")) {
        const refs = Array.from({ length: openCount }, (_, i) => ({
          ref: `refs/heads/contribute/box-${i}`,
        }));
        return new Response(JSON.stringify(refs), { status: 200 });
      }
      return new Response("[]", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  afterEach(() => vi.unstubAllGlobals());

  it("rejects once the open contribute backlog hits the cap", async () => {
    stubGh(50);
    await expect(resolveSlug("New Box", "tok", env)).rejects.toBeInstanceOf(TooManyOpenError);
  });

  it("allows a submission below the cap", async () => {
    stubGh(49);
    expect(await resolveSlug("New Box", "tok", env)).toBe("new-box");
  });

  it("requests up to 100 refs so a cap above one page is observable", async () => {
    const fetchMock = stubGh(0);
    await resolveSlug("New Box", "tok", env);
    const refsCall = fetchMock.mock.calls.find(([url]) => String(url).includes("matching-refs"));
    expect(String(refsCall?.[0])).toContain("per_page=100");
  });
});
