// Localizes the error sources ContributeBox surfaces: zod issues from the schema
// (src/lib/schemas.ts) and FieldErrors from contribute.ts (file + required-field checks).
// Both attach a stable machine key so translation doesn't depend on matching English text.

import { tt } from "../i18n";
import type { FieldError } from "./contribute";

export type ValidationMessages = Record<string, string>;

// Svelte context key LabeledInput reads to localize its own "not a number" native-validity
// message, set once by ContributeBox so every field doesn't need the string threaded in as a prop.
export const CONTRIBUTE_VALIDATION_CONTEXT = "contribute-validation";

interface ZodIssueLike {
  code: string;
  message: string;
  params?: Record<string, unknown>;
  origin?: string;
  minimum?: unknown;
  maximum?: unknown;
  inclusive?: boolean;
}

const CUSTOM_KEYS = new Set([
  "duplicateProfileId",
  "duplicateCurveId",
  "curveSetEmpty",
  "stackedMissingBase",
  "duplicateStackedCount",
  "proprietaryPlans",
  "licenseNoteRequired",
  "contactRequired",
]);

// Falls back to the raw (English) zod message when a custom issue carries no recognized key,
// or when the code isn't one of the shapes this schema actually produces.
export function translateZodIssue(issue: ZodIssueLike, t: ValidationMessages): string {
  if (issue.code === "custom") {
    const key = issue.params?.key;
    if (typeof key === "string" && CUSTOM_KEYS.has(key) && t[key]) {
      return tt(t[key], (issue.params ?? {}) as Record<string, string | number>);
    }
    return issue.message;
  }
  if (issue.code === "invalid_value") return t.invalidSelection ?? issue.message;
  if (issue.code === "invalid_format") return t.invalidUrl ?? issue.message;
  if (issue.code === "invalid_type") return t.required ?? issue.message;
  if (issue.code === "too_small") {
    // A .min(1) string/array reads as "empty", not "too short": only a real length floor
    // (min > 1) gets the more specific message. A .positive() number (exclusive, minimum 0)
    // reads as "must be positive", a real .min(n > 0) gets the interpolated floor.
    if (issue.origin === "string") {
      const min = Number(issue.minimum ?? 0);
      return min > 1 ? tt(t.tooShort ?? "", { min }) : (t.required ?? issue.message);
    }
    if (issue.origin === "array") return t.required ?? issue.message;
    if (issue.origin === "number") {
      const min = Number(issue.minimum ?? 0);
      return min === 0 && !issue.inclusive
        ? (t.mustBePositive ?? issue.message)
        : tt(t.mustBeAtLeast ?? "", { min });
    }
    return t.required ?? issue.message;
  }
  if (issue.code === "too_big") {
    const max = Number(issue.maximum ?? 0);
    return issue.origin === "string"
      ? tt(t.tooLong ?? "", { max })
      : tt(t.mustBeAtMost ?? "", { max });
  }
  return t.invalid ?? issue.message;
}

const FILE_KEYS = new Set([
  "fileMissing",
  "fileWrongType",
  "fileNotReferenced",
  "fileDuplicateName",
  "fileBadName",
  "fileTooLarge",
  "totalTooLarge",
  "tooManyImages",
]);

// Keys from requiredFieldErrors() (src/lib/contribute.ts), returned as serverErrors.
const REQUIRED_FIELD_KEYS = new Set([
  "nameRequired",
  "categoryRequired",
  "licenseRequired",
  "driverProfilesRequired",
  "netVolumeRequired",
  "dimsRequired",
  "f3Required",
]);

const FIELD_ERROR_KEYS = new Set([...FILE_KEYS, ...REQUIRED_FIELD_KEYS]);

export function translateFieldIssue(error: FieldError, t: ValidationMessages): string {
  if (error.key && FIELD_ERROR_KEYS.has(error.key) && t[error.key]) {
    return tt(t[error.key], error.params ?? {});
  }
  return error.message;
}
