import { describe, expect, it } from "vitest";
import {
  type EnclosureInput,
  MAX_FILE_BYTES,
  MAX_IMAGES,
  referencedFiles,
  requiredFieldErrors,
  validateUploads,
} from "../src/lib/contribute";
import { enclosureFrontmatterSchema } from "../src/lib/schemas";
import {
  bytesToBase64,
  dedupeSlug,
  emitFrontmatter,
  jwtClaims,
  jwtHeader,
  jwtSegment,
  pemToArrayBuffer,
  slugify,
} from "../worker/box-contribute";

// A minimal box that satisfies the real content schema, reused across emit/validate tests.
function validBox(): EnclosureInput {
  return {
    name: "FK BR 18",
    category: "sub",
    topology: "bass_reflex",
    drivers: ["faital-18hp1060-8"],
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
      simulations: [{ driver: ["d"], kind: "spl", source: "hornresp_sim", file: "s.csv" }],
      measurements: [{ driver: ["d"], kind: "spl", source: "rew_measured", file: "m.csv" }],
      sources: [{ tool: "hornresp", file: "proj.txt" }],
    };
    expect(referencedFiles(fm)).toEqual([
      { name: "a.png", role: "image", field: "images" },
      { name: "p.pdf", role: "pdf", field: "plans" },
      { name: "s.csv", role: "csv", field: "simulations.0.file" },
      { name: "m.csv", role: "csv", field: "measurements.0.file" },
      { name: "proj.txt", role: "source", field: "sources.0.file" },
    ]);
  });
});

describe("validateUploads", () => {
  const fm: EnclosureInput = {
    images: ["a.png"],
    plans: ["p.pdf"],
    simulations: [{ driver: ["d"], kind: "spl", source: "hornresp_sim", file: "s.csv" }],
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
    expect(errors).toContainEqual({
      field: "simulations.0.file",
      message: 'no uploaded file named "s.csv"',
    });
  });

  it("flags an uploaded file that is not referenced", () => {
    const errors = validateUploads(fm, [...okUploads, { name: "orphan.png", size: 10 }]);
    expect(errors).toContainEqual({
      field: "files",
      message: 'uploaded file "orphan.png" is not referenced',
    });
  });

  it("flags duplicate upload filenames (they would collide on one repo path)", () => {
    const errors = validateUploads(fm, [...okUploads, { name: "a.png", size: 10 }]);
    expect(errors).toContainEqual({ field: "files", message: 'duplicate filename "a.png"' });
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

  it("flags too many images", () => {
    const many = Array.from({ length: MAX_IMAGES + 1 }, (_, i) => `img${i}.png`);
    const errors = validateUploads(
      { images: many },
      many.map((name) => ({ name, size: 1 }))
    );
    expect(errors).toContainEqual({ field: "images", message: `at most ${MAX_IMAGES} images` });
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
        "drivers",
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
      simulations: [
        { driver: ["faital-18hp1060-8"], kind: "spl", source: "hornresp_sim", file: "s.csv" },
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
    // Nested sequence-of-objects indentation (driver array under the sim entry).
    expect(out).toContain(
      'simulations:\n  - driver:\n      - "faital-18hp1060-8"\n    kind: "spl"'
    );
    expect(out.trimEnd().endsWith("18 inch bass reflex sub.")).toBe(true);
  });

  it("omits empty arrays and undefined fields", () => {
    const out = emitFrontmatter(validBox());
    expect(out).not.toContain("simulations:");
    expect(out).not.toContain("images:");
    expect(out).not.toContain("weightKg:");
  });

  it("never emits keys outside the allowlist (no self-verified submissions)", () => {
    const fm = { ...validBox(), verified: true, evil: "x" } as EnclosureInput;
    const out = emitFrontmatter(fm);
    expect(out).not.toContain("verified");
    expect(out).not.toContain("evil");
  });

  it("quotes structurally unsafe keys inside untrusted nested objects", () => {
    const fm = { ...validBox(), specs: { f3Hz: 38, "x:\ny": 1 } } as unknown as EnclosureInput;
    const out = emitFrontmatter(fm);
    expect(out).toContain('"x:\\ny": 1');
  });

  it("requires count for spl_stacked (schema rule the client mirrors)", () => {
    const fm: EnclosureInput = {
      ...validBox(),
      simulations: [{ driver: ["d"], kind: "spl_stacked", source: "hornresp_sim", file: "s.csv" }],
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
