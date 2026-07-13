// Shared with worker/box-contribute.ts. Pure and zod-free at runtime so the Worker bundle stays astro-free.

import type { z } from "astro/zod";
import type { CurveKind } from "./csv";
import type { enclosureFrontmatterObject } from "./schemas";

// The kinds a curve set's `curves` map can hold: every kind except spl_stacked, which is its
// own `stacked` array instead (count only means something relative to a plain spl entry).
export type NonStackedKind = Exclude<CurveKind, "spl_stacked">;

// The input type is what an untrusted submission claims to be, hence Partial plus an index signature.
export type EnclosureFrontmatterInput = z.input<typeof enclosureFrontmatterObject>;
export type EnclosureInput = Partial<EnclosureFrontmatterInput> & Record<string, unknown>;
export type DriverProfileInput = NonNullable<EnclosureFrontmatterInput["driverProfiles"]>[number];
export type CurveEntryInput = NonNullable<DriverProfileInput["simulations"]>[number];
export type DesignSourceInput = NonNullable<EnclosureFrontmatterInput["sources"]>[number];
export type ContactEntryInput = NonNullable<EnclosureFrontmatterInput["contact"]>[number];

export interface FieldError {
  field: string;
  message: string;
  // Present on client-facing errors so the UI can render a localized string. The worker
  // only ever forwards `message` (English), key/params are ignored server-side.
  key?: string;
  params?: Record<string, string | number>;
}

export interface UploadMeta {
  name: string;
  size: number;
}

// POST /api/box-contribute response shape, shared by worker/box-contribute.ts and
// ContributeBox.svelte so a field rename on either side fails tsc instead of only failing at
// runtime (the worker is excluded from the app tsconfig, so nothing else catches drift).
export interface BoxContributeSuccess {
  prUrl: string;
}

export interface BoxContributeError {
  errors: FieldError[];
}

// Upload caps. PDFs justify a generous per-file cap.
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 40 * 1024 * 1024;
export const MAX_IMAGES = 12;

type FileRole = "image" | "pdf" | "csv" | "source";

export const ROLE_EXT: Record<FileRole, string[]> = {
  image: ["png", "jpg", "jpeg", "webp"],
  pdf: ["pdf"],
  csv: ["csv"],
  // Raw simulation project files (Hornresp record, AkAbak script, ...): text or archives.
  source: ["csv", "txt", "dat", "zip", "pdf"],
};

function ext(name: string): string {
  return name.slice(name.lastIndexOf(".") + 1).toLowerCase();
}

// An upload name is committed straight into a repo path, so it must be a bare basename:
// path separators, .. sequences, leading dots and control chars are all rejected before it
// can escape data/enclosures/<slug>/.
export function isSafeUploadName(name: string): boolean {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control chars in a filename is the intent.
  return name.length > 0 && name.length <= 128 && !/[\\/]|^\.|\.\.|[\u0000-\u001f]/u.test(name);
}

// MDX bodies compile to JS and execute during `astro build`. Contribute submissions are
// untrusted, so neutralize the three MDX code vectors before the body reaches a committed
// .mdx: ESM import/export statements (dropped), {expressions} and <jsx>/raw-html (escaped
// to literal text). Applied only to submitted bodies, existing enclosure .mdx keeps its MDX.
export function sanitizeMdxBody(body: string): string {
  return body
    .split("\n")
    .filter((line) => !/^\s*(import|export)\b/.test(line))
    .join("\n")
    .replace(/[{}]/g, (c) => `\\${c}`)
    .replace(/</g, "&lt;");
}

interface FileRef {
  name: string;
  role: FileRole;
  field: string;
}

// The frontmatter is untrusted (the worker runs this on raw payloads before any schema
// validation): a list that isn't an array, or an element that isn't an object, must degrade
// to "no refs" (surfacing as a fileNotReferenced 400) rather than throw a 500.
function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function curveSetFiles(cs: CurveEntryInput, base: string): FileRef[] {
  if (!isObj(cs)) return [];
  const refs: FileRef[] = [];
  for (const [kind, entry] of Object.entries(isObj(cs.curves) ? cs.curves : {})) {
    if (!isObj(entry)) continue;
    refs.push({ name: String(entry.file), role: "csv", field: `${base}.curves.${kind}.file` });
  }
  asArray<NonNullable<CurveEntryInput["stacked"]>[number]>(cs.stacked)
    .filter(isObj)
    .forEach((s, si) => {
      refs.push({ name: String(s.file), role: "csv", field: `${base}.stacked.${si}.file` });
    });
  return refs;
}

export function referencedFiles(fm: EnclosureInput): FileRef[] {
  const refs: FileRef[] = [];
  for (const name of asArray<string>(fm.images))
    refs.push({ name, role: "image", field: "images" });
  for (const name of asArray<string>(fm.plans)) refs.push({ name, role: "pdf", field: "plans" });
  asArray<DriverProfileInput>(fm.driverProfiles)
    .filter(isObj)
    .forEach((p, pi) => {
      asArray<CurveEntryInput>(p.simulations).forEach((cs, ci) => {
        refs.push(...curveSetFiles(cs, `driverProfiles.${pi}.simulations.${ci}`));
      });
      asArray<CurveEntryInput>(p.measurements).forEach((cs, ci) => {
        refs.push(...curveSetFiles(cs, `driverProfiles.${pi}.measurements.${ci}`));
      });
    });
  asArray<DesignSourceInput>(fm.sources)
    .filter(isObj)
    .forEach((s, i) => {
      refs.push({ name: String(s.file), role: "source", field: `sources.${i}.file` });
    });
  return refs;
}

export function validateUploads(fm: EnclosureInput, uploads: UploadMeta[]): FieldError[] {
  const errors: FieldError[] = [];
  const refs = referencedFiles(fm);
  const uploadByName = new Map(uploads.map((u) => [u.name, u]));
  const refNames = new Set(refs.map((r) => r.name));

  for (const ref of refs) {
    const upload = uploadByName.get(ref.name);
    if (!upload) {
      errors.push({
        field: ref.field,
        message: `no uploaded file named "${ref.name}"`,
        key: "fileMissing",
        params: { name: ref.name },
      });
      continue;
    }
    if (!ROLE_EXT[ref.role].includes(ext(ref.name))) {
      errors.push({
        field: ref.field,
        message: `"${ref.name}" must be one of: ${ROLE_EXT[ref.role].join(", ")}`,
        key: "fileWrongType",
        params: { name: ref.name, types: ROLE_EXT[ref.role].join(", ") },
      });
    }
  }

  // Uploaded but not referenced (would be an orphan file in the PR).
  for (const upload of uploads) {
    if (!refNames.has(upload.name)) {
      errors.push({
        field: "files",
        message: `uploaded file "${upload.name}" is not referenced`,
        key: "fileNotReferenced",
        params: { name: upload.name },
      });
    }
  }

  // Reject names that aren't a bare basename before they're committed into a repo path.
  for (const upload of uploads) {
    if (!isSafeUploadName(upload.name)) {
      errors.push({
        field: "files",
        message: `invalid filename "${upload.name}"`,
        key: "fileBadName",
        params: { name: upload.name },
      });
    }
  }

  // Duplicate names would collide on one repo path.
  const seen = new Set<string>();
  for (const upload of uploads) {
    if (seen.has(upload.name)) {
      errors.push({
        field: "files",
        message: `duplicate filename "${upload.name}"`,
        key: "fileDuplicateName",
        params: { name: upload.name },
      });
    }
    seen.add(upload.name);
  }

  let total = 0;
  for (const upload of uploads) {
    total += upload.size;
    if (upload.size > MAX_FILE_BYTES) {
      const mb = Math.round(MAX_FILE_BYTES / 1024 / 1024);
      errors.push({
        field: "files",
        message: `"${upload.name}" exceeds the ${mb} MB per-file limit`,
        key: "fileTooLarge",
        params: { name: upload.name, mb },
      });
    }
  }
  if (total > MAX_TOTAL_BYTES) {
    const mb = Math.round(MAX_TOTAL_BYTES / 1024 / 1024);
    errors.push({
      field: "files",
      message: `total upload size exceeds the ${mb} MB limit`,
      key: "totalTooLarge",
      params: { mb },
    });
  }
  if ((fm.images ?? []).length > MAX_IMAGES) {
    errors.push({
      field: "images",
      message: `at most ${MAX_IMAGES} images`,
      key: "tooManyImages",
      params: { max: MAX_IMAGES },
    });
  }

  return errors;
}

interface CurveKindEntryState {
  file: string | null;
  note: string;
}

interface StackedEntryState {
  count: number | null;
  file: string | null;
  note: string;
}

// One curve set: a single simulation run or measurement session, mirroring makeCurveSet in
// schemas.ts. `curves` is keyed by non-stacked CurveKind (spl/phase/impedance/...), stacked SPL
// counts are their own array since a count only means something relative to the plain spl entry.
export interface CurveSetState {
  id: string;
  source: string;
  curves: Partial<Record<NonStackedKind, CurveKindEntryState>>;
  stacked: StackedEntryState[];
}

interface SourceRowState {
  tool: string;
  file: string | null;
  note: string;
}

interface ContactRowState {
  channel: string;
  value: string;
  note: string;
}

interface DriverEntryState {
  id: string;
  qty: number | null;
  horn: string | null;
}

interface DriverProfileState {
  id: string;
  drivers: DriverEntryState[];
  simulations: CurveSetState[];
  measurements: CurveSetState[];
}

export interface ContributeState {
  basics: {
    name: string;
    category: string;
    topology: string;
    topologyVariant: string;
    ways: number | null;
    revision: string;
    buildComplexity: string;
  };
  driverProfiles: DriverProfileState[];
  geom: {
    hMm: number | null;
    wMm: number | null;
    dMm: number | null;
    netVolumeL: number | null;
    grossVolumeL: number | null;
    weightKg: number | null;
    plywoodThicknessMm: number | null;
    sheetCount: number | null;
    sheetW: number | null;
    sheetH: number | null;
  };
  f3Hz: number | null;
  specs: Record<string, number | null | undefined>;
  srcs: SourceRowState[];
  images: string[];
  plans: string[];
  recommendedFor: string[];
  connectors: string[];
  lic: { license: string; licenseNote: string; author: string; sourceUrl: string };
  availability: string;
  contact: ContactRowState[];
}

// Drop empty values so absent optionals stay out of the posted frontmatter.
function clean(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj))
    if (v !== undefined && v !== null && v !== "") out[k] = v;
  return out;
}

// file stays as `""` rather than being dropped when unset, same as the rest of this function's
// omission semantics: a missing file is a genuine validation error (path .curves.<kind>.file /
// .stacked.<i>.file), not something that should silently vanish the row from the preview.
function curveSetOut(cs: CurveSetState): Record<string, unknown> {
  const curves: Record<string, unknown> = {};
  for (const [kind, entry] of Object.entries(cs.curves)) {
    if (!entry) continue;
    curves[kind] = clean({ file: entry.file ?? "", note: entry.note });
  }
  const out: Record<string, unknown> = { id: cs.id, source: cs.source, curves };
  if (cs.stacked.length) {
    out.stacked = cs.stacked.map((s) =>
      clean({ count: s.count ?? undefined, file: s.file ?? "", note: s.note })
    );
  }
  return out;
}

// Pure so the omission semantics (empty/null dropped) are unit-testable.
export function buildFrontmatter(s: ContributeState): Record<string, unknown> {
  const specsObj: Record<string, number> = {};
  if (s.f3Hz !== null) specsObj.f3Hz = s.f3Hz;
  for (const [k, v] of Object.entries(s.specs)) {
    if (k !== "f3Hz" && v !== null && v !== undefined) specsObj[k] = v;
  }

  const fm: Record<string, unknown> = {
    name: s.basics.name,
    category: s.basics.category,
    topology: s.basics.topology,
    // Profile id and qty are always meant to be set (no default to fall back on). horn is
    // genuinely optional and dropped via clean() when unset. simulations/measurements live on
    // the profile itself now (nesting is the link), omitted entirely when empty.
    driverProfiles: s.driverProfiles.map((p) => ({
      id: p.id,
      drivers: p.drivers.map((e) => clean({ driver: e.id, qty: e.qty, horn: e.horn })),
      ...(p.simulations.length ? { simulations: p.simulations.map(curveSetOut) } : {}),
      ...(p.measurements.length ? { measurements: p.measurements.map(curveSetOut) } : {}),
    })),
    netVolumeL: s.geom.netVolumeL ?? undefined,
    dims: {
      hMm: s.geom.hMm ?? undefined,
      wMm: s.geom.wMm ?? undefined,
      dMm: s.geom.dMm ?? undefined,
    },
    specs: specsObj,
    license: s.lic.license,
    ...clean({
      topologyVariant: s.basics.topologyVariant,
      buildComplexity: s.basics.buildComplexity,
      ways: s.basics.ways,
      revision: s.basics.revision,
      grossVolumeL: s.geom.grossVolumeL,
      weightKg: s.geom.weightKg,
      plywoodThicknessMm: s.geom.plywoodThicknessMm,
      sheetCount: s.geom.sheetCount,
      licenseNote: s.lic.licenseNote,
      author: s.lic.author,
      sourceUrl: s.lic.sourceUrl,
      availability: s.availability,
    }),
  };

  if (s.geom.sheetW !== null && s.geom.sheetH !== null)
    fm.sheetSizeMm = { wMm: s.geom.sheetW, hMm: s.geom.sheetH };
  if (s.srcs.length)
    fm.sources = s.srcs.map((x) => clean({ tool: x.tool, file: x.file ?? "", note: x.note }));
  const contact = s.contact
    .filter((c) => c.value.trim() !== "")
    .map((c) => clean({ channel: c.channel, value: c.value.trim(), note: c.note }));
  if (contact.length) fm.contact = contact;
  if (s.images.length) fm.images = s.images;
  if (s.plans.length) fm.plans = s.plans;
  if (s.recommendedFor.length) fm.recommendedFor = s.recommendedFor;
  if (s.connectors.length) fm.connectors = s.connectors;
  return fm;
}

// Presence/positivity only, not duplicated here: full validation is the CI build gate.
export function requiredFieldErrors(fm: EnclosureInput): FieldError[] {
  const errors: FieldError[] = [];
  const req = (cond: boolean, field: string, message: string) => {
    if (!cond) errors.push({ field, message });
  };
  req(typeof fm.name === "string" && fm.name.trim().length > 0, "name", "name is required");
  req(
    typeof fm.category === "string" && fm.category.length > 0,
    "category",
    "category is required"
  );
  req(typeof fm.license === "string" && fm.license.length > 0, "license", "license is required");
  req(
    Array.isArray(fm.driverProfiles) && fm.driverProfiles.length > 0,
    "driverProfiles",
    "at least one driver profile is required"
  );
  req(
    typeof fm.netVolumeL === "number" && fm.netVolumeL > 0,
    "netVolumeL",
    "netVolumeL is required"
  );
  req(
    typeof fm.dims?.hMm === "number" &&
      typeof fm.dims?.wMm === "number" &&
      typeof fm.dims?.dMm === "number",
    "dims",
    "dims (hMm, wMm, dMm) are required"
  );
  req(
    typeof fm.specs?.f3Hz === "number" && fm.specs.f3Hz > 0,
    "specs.f3Hz",
    "specs.f3Hz is required"
  );
  return errors;
}
