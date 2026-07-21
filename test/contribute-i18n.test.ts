import { describe, expect, it } from "vitest";
import en from "../src/i18n/locales/en.json";
import { translateFieldIssue, translateZodIssue } from "../src/lib/contribute-i18n";
import { enclosureFrontmatterObject } from "../src/lib/schemas";

const t = en.contributeBox.validation;

describe("translateZodIssue", () => {
  it("maps a missing required field to the required message", () => {
    expect(translateZodIssue({ code: "invalid_type", message: "raw" }, t)).toBe(t.required);
  });

  it("maps too_small on a number to mustBePositive", () => {
    expect(translateZodIssue({ code: "too_small", origin: "number", message: "raw" }, t)).toBe(
      t.mustBePositive
    );
  });

  it("maps too_small on a string/array to required", () => {
    expect(translateZodIssue({ code: "too_small", origin: "string", message: "raw" }, t)).toBe(
      t.required
    );
  });

  it("maps invalid_value (enum) and invalid_format (url)", () => {
    expect(translateZodIssue({ code: "invalid_value", message: "raw" }, t)).toBe(
      t.invalidSelection
    );
    expect(translateZodIssue({ code: "invalid_format", message: "raw" }, t)).toBe(t.invalidUrl);
  });

  it("translates a recognized custom issue and interpolates params", () => {
    expect(
      translateZodIssue(
        { code: "custom", message: "raw", params: { key: "duplicateProfileId", id: "default" } },
        t
      )
    ).toBe(t.duplicateProfileId.replace("{id}", "default"));
    expect(
      translateZodIssue(
        { code: "custom", message: "raw", params: { key: "duplicateCurveId", id: "spl-1" } },
        t
      )
    ).toBe(t.duplicateCurveId.replace("{id}", "spl-1"));
    expect(
      translateZodIssue(
        { code: "custom", message: "raw", params: { key: "duplicateStackedCount", count: 4 } },
        t
      )
    ).toBe(t.duplicateStackedCount.replace("{count}", "4"));
  });

  it("falls back to the raw message for an unrecognized custom key", () => {
    expect(
      translateZodIssue({ code: "custom", message: "raw fallback", params: { key: "nope" } }, t)
    ).toBe("raw fallback");
  });

  it("interpolates a real length floor on a string as tooShort, not required", () => {
    expect(
      translateZodIssue(
        { code: "too_small", origin: "string", minimum: 3, inclusive: true, message: "raw" },
        t
      )
    ).toBe(t.tooShort.replace("{min}", "3"));
  });

  it("interpolates a real floor on a number as mustBeAtLeast, not mustBePositive", () => {
    expect(
      translateZodIssue(
        { code: "too_small", origin: "number", minimum: 10, inclusive: true, message: "raw" },
        t
      )
    ).toBe(t.mustBeAtLeast.replace("{min}", "10"));
  });

  it("maps too_big to mustBeAtMost / tooLong depending on origin", () => {
    expect(
      translateZodIssue({ code: "too_big", origin: "number", maximum: 2000, message: "raw" }, t)
    ).toBe(t.mustBeAtMost.replace("{max}", "2000"));
    expect(
      translateZodIssue({ code: "too_big", origin: "string", maximum: 120, message: "raw" }, t)
    ).toBe(t.tooLong.replace("{max}", "120"));
  });

  it("localizes the real schema's name and netVolumeL bound issues", () => {
    const r = enclosureFrontmatterObject.safeParse({
      name: "ab",
      category: "sub",
      topology: "sealed",
      driverProfiles: [{ id: "default", drivers: [{ driver: "d", qty: 1 }] }],
      netVolumeL: 100000,
      dims: { hMm: 500, wMm: 500, dMm: 500 },
      specs: { f3Hz: 40 },
      license: "CC0-1.0",
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    const byPath = Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i]));
    expect(translateZodIssue(byPath.name, t)).toBe(t.tooShort.replace("{min}", "3"));
    expect(translateZodIssue(byPath.netVolumeL, t)).toBe(t.mustBeAtMost.replace("{max}", "50000"));
  });
});

describe("translateFieldIssue", () => {
  it("translates a keyed FieldError and interpolates params", () => {
    const e = {
      field: "images",
      message: "raw",
      key: "fileTooLarge",
      params: { name: "a.png", mb: 15 },
    };
    expect(translateFieldIssue(e, t)).toBe(
      t.fileTooLarge.replace("{name}", "a.png").replace("{mb}", "15")
    );
  });

  it("falls back to message when there is no key", () => {
    expect(translateFieldIssue({ field: "files", message: "plain english" }, t)).toBe(
      "plain english"
    );
  });

  it("translates a required-field key from requiredFieldErrors", () => {
    const e = { field: "name", message: "name is required", key: "nameRequired" };
    expect(translateFieldIssue(e, t)).toBe(t.nameRequired);
  });
});
