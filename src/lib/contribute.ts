// Shared with worker/box-contribute.ts. Pure and zod-free at runtime so the Worker bundle stays astro-free.

import type { z } from "astro/zod";
import type { enclosureFrontmatterObject } from "./schemas";

// The input type is what an untrusted submission claims to be, hence Partial plus an index signature.
export type EnclosureFrontmatterInput = z.input<typeof enclosureFrontmatterObject>;
export type EnclosureInput = Partial<EnclosureFrontmatterInput> & Record<string, unknown>;
export type CurveEntryInput = NonNullable<EnclosureFrontmatterInput["simulations"]>[number];
export type DesignSourceInput = NonNullable<EnclosureFrontmatterInput["sources"]>[number];

export interface FieldError {
  field: string;
  message: string;
}

export interface UploadMeta {
  name: string;
  size: number;
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

interface FileRef {
  name: string;
  role: FileRole;
  field: string;
}

export function referencedFiles(fm: EnclosureInput): FileRef[] {
  const refs: FileRef[] = [];
  for (const name of fm.images ?? []) refs.push({ name, role: "image", field: "images" });
  for (const name of fm.plans ?? []) refs.push({ name, role: "pdf", field: "plans" });
  (fm.simulations ?? []).forEach((s, i) => {
    refs.push({ name: s.file, role: "csv", field: `simulations.${i}.file` });
  });
  (fm.measurements ?? []).forEach((m, i) => {
    refs.push({ name: m.file, role: "csv", field: `measurements.${i}.file` });
  });
  (fm.sources ?? []).forEach((s, i) => {
    refs.push({ name: s.file, role: "source", field: `sources.${i}.file` });
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
      errors.push({ field: ref.field, message: `no uploaded file named "${ref.name}"` });
      continue;
    }
    if (!ROLE_EXT[ref.role].includes(ext(ref.name))) {
      errors.push({
        field: ref.field,
        message: `"${ref.name}" must be one of: ${ROLE_EXT[ref.role].join(", ")}`,
      });
    }
  }

  // Uploaded but not referenced (would be an orphan file in the PR).
  for (const upload of uploads) {
    if (!refNames.has(upload.name)) {
      errors.push({ field: "files", message: `uploaded file "${upload.name}" is not referenced` });
    }
  }

  // Duplicate names would collide on one repo path.
  const seen = new Set<string>();
  for (const upload of uploads) {
    if (seen.has(upload.name)) {
      errors.push({ field: "files", message: `duplicate filename "${upload.name}"` });
    }
    seen.add(upload.name);
  }

  let total = 0;
  for (const upload of uploads) {
    total += upload.size;
    if (upload.size > MAX_FILE_BYTES) {
      errors.push({
        field: "files",
        message: `"${upload.name}" exceeds the ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB per-file limit`,
      });
    }
  }
  if (total > MAX_TOTAL_BYTES) {
    errors.push({
      field: "files",
      message: `total upload size exceeds the ${Math.round(MAX_TOTAL_BYTES / 1024 / 1024)} MB limit`,
    });
  }
  if ((fm.images ?? []).length > MAX_IMAGES) {
    errors.push({ field: "images", message: `at most ${MAX_IMAGES} images` });
  }

  return errors;
}

export interface CurveRowState {
  driver: string[];
  kind: string;
  source: string;
  note: string;
  count: number | null;
  file: string | null;
}

interface SourceRowState {
  tool: string;
  file: string | null;
  note: string;
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
    driverCount: number | null;
  };
  driverIds: string[];
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
  sims: CurveRowState[];
  meas: CurveRowState[];
  srcs: SourceRowState[];
  images: string[];
  plans: string[];
  recommendedFor: string[];
  connectors: string[];
  lic: { license: string; licenseNote: string; author: string; sourceUrl: string };
}

// Drop empty values so absent optionals stay out of the posted frontmatter.
function clean(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj))
    if (v !== undefined && v !== null && v !== "") out[k] = v;
  return out;
}

function curveOut(r: CurveRowState): Record<string, unknown> {
  return clean({
    driver: r.driver,
    kind: r.kind,
    source: r.source,
    file: r.file ?? "",
    // A stale count from before switching off spl_stacked must not linger (unclearable input).
    count: r.kind === "spl_stacked" ? (r.count ?? undefined) : undefined,
    note: r.note || undefined,
  });
}

// Pure so the omission semantics (empty/null dropped, driverCount 1 implied) are unit-testable.
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
    drivers: s.driverIds,
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
    }),
  };

  if (s.basics.driverCount !== null && s.basics.driverCount !== 1)
    fm.driverCount = s.basics.driverCount;
  if (s.geom.sheetW !== null && s.geom.sheetH !== null)
    fm.sheetSizeMm = { wMm: s.geom.sheetW, hMm: s.geom.sheetH };
  if (s.sims.length) fm.simulations = s.sims.map(curveOut);
  if (s.meas.length) fm.measurements = s.meas.map(curveOut);
  if (s.srcs.length)
    fm.sources = s.srcs.map((x) => clean({ tool: x.tool, file: x.file ?? "", note: x.note }));
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
    Array.isArray(fm.drivers) && fm.drivers.length > 0,
    "drivers",
    "at least one driver is required"
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
