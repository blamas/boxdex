// Zod schemas for the driver and horn collections: the single source of truth for
// both build-time validation (content.config.ts) and the client-side types the
// islands consume (via `import type`, so zod never reaches a browser bundle).
// The committed editor mirrors in schema/*.schema.json are generated from these
// via `npm run schema:gen`; regenerate after any edit here.

import { z } from "astro/zod";
import taxonomy from "../../data/taxonomy.json" with { type: "json" };
import { CATEGORIES } from "./category";
import { CURVE_KINDS } from "./csv";

// Vocabularies sourced from data/taxonomy.json: an array is a closed list (a value
// outside it is a build error), `null` is free-form (any string). The JSON import loses
// literal types, so cast the array to a non-empty tuple for z.enum.
const enumOf = (field: keyof typeof taxonomy) => {
  const values = taxonomy[field];
  return Array.isArray(values) ? z.enum(values as [string, ...string[]]) : z.string();
};

const driverBase = {
  brand: z.string(),
  model: z.string(),
  impedanceOhm: z.number().positive(),
  peW: z.number().positive(),
  datasheetUrl: z.url().optional(),
};

const coneDriverSchema = z.object({
  type: z.literal("cone"),
  ...driverBase,
  sizeInch: z.number().positive(),
  fsHz: z.number().positive(),
  qts: z.number().positive(),
  qes: z.number().positive().optional(),
  qms: z.number().positive().optional(),
  vasL: z.number().positive(),
  sdCm2: z.number().positive(),
  xmaxMm: z.number().positive(),
  reOhm: z.number().positive().optional(),
  bl: z.number().positive().optional(),
  mmsG: z.number().positive().optional(),
  sensitivityDb: z.number(),
});

const compressionDriverSchema = z.object({
  type: z.literal("compression"),
  ...driverBase,
  exitInch: z.number().positive(),
  throatMm: z.number().positive().optional(),
  voiceCoilMm: z.number().positive(),
  fLowHz: z.number().positive(),
  fHighHz: z.number().positive(),
  minCrossoverHz: z.number().positive(),
  crossoverSlopeDbOct: z.number().positive().optional(),
  sensitivityHornDb: z.number(),
  fsHz: z.number().positive().optional(),
  magnetMaterial: z.string().optional(),
  weightKg: z.number().positive().optional(),
});

export const driverSchema = z.discriminatedUnion("type", [
  coneDriverSchema,
  compressionDriverSchema,
]);

// Horns/waveguides are catalogued standalone (not tied to a cabinet): a horn mates a
// compression driver when its `exitInch` throat matches.
export const hornSchema = z.object({
  brand: z.string(),
  model: z.string(),
  exitInch: z.number().positive(),
  coverageHorizontalDeg: z.number().positive(),
  coverageVerticalDeg: z.number().positive(),
  cutoffHz: z.number().positive(),
  mouthWmm: z.number().positive(),
  mouthHmm: z.number().positive(),
  depthMm: z.number().positive().optional(),
  profile: enumOf("hornProfile"),
  constantDirectivity: z.boolean().optional(),
  material: z.string().optional(),
  weightKg: z.number().positive().optional(),
  datasheetUrl: z.url().optional(),
});

// driver is passed in so the build can use reference("drivers") while this schema uses plain ids.
export const makeCurveEntry = <D extends z.ZodTypeAny>(driver: D, sources: [string, ...string[]]) =>
  z
    .object({
      driver,
      kind: z.enum(CURVE_KINDS),
      source: z.enum(sources),
      file: z.string().endsWith(".csv"),
      count: z.number().int().positive().optional(),
      note: z.string().optional(),
    })
    .refine((v) => v.count === undefined || v.kind === "spl_stacked", {
      message: "count is only valid for kind: spl_stacked",
    })
    .refine((v) => v.kind !== "spl_stacked" || v.count !== undefined, {
      message: "count is required for kind: spl_stacked",
    });

export const SIM_SOURCES: [string, ...string[]] = [
  "hornresp_sim",
  "akabak_sim",
  "catt_sim",
  "vituixcad_sim",
  "winsd_sim",
  "basta_sim",
];

export const MEAS_SOURCES: [string, ...string[]] = ["rew_measured", "klippel"];

export const BUILD_COMPLEXITIES = ["simple", "moderate", "complex"] as const;

// Raw simulation project files (e.g. Hornresp record, AkAbak script) for remixing.
const designSource = z.object({
  tool: z.string(),
  file: z.string(),
  note: z.string().optional(),
});

// Un-refined so content.config.ts can .extend() it (a schema with .superRefine has no .extend);
// content.config.ts re-declares drivers/images with reference()/image() for build-time checks.
export const enclosureFrontmatterObject = z.object({
  name: z.string().min(1),
  category: z.enum(CATEGORIES),
  topology: enumOf("topology"),
  drivers: z.array(z.string()).min(1),
  driverCount: z.number().int().positive().default(1),
  netVolumeL: z.number().positive(),
  dims: z.object({
    hMm: z.number().positive(),
    wMm: z.number().positive(),
    dMm: z.number().positive(),
  }),
  weightKg: z.number().positive().optional(),
  specs: z.object({
    f3Hz: z.number().positive(),
    f3HzHigh: z.number().positive().optional(),
    f6Hz: z.number().positive().optional(),
    fbHz: z.number().positive().optional(),
    maxSplDb: z.number().optional(),
    // Two independent limits: below Fb excursion-limited, above it power/thermal-limited.
    maxSplExcursionDb: z.number().optional(),
    maxSplThermalDb: z.number().optional(),
    sensitivityDb: z.number().optional(),
    impedanceMinOhm: z.number().positive().optional(),
    // Stated nominal load, for when internal multi-driver wiring makes it underivable.
    impedanceNominalOhm: z.number().positive().optional(),
    recommendedPowerW: z.number().positive().optional(),
    powerAesW: z.number().positive().optional(),
    powerProgramW: z.number().positive().optional(),
    coverageAngleDeg: z.number().positive().optional(),
    recommendedCrossoverHz: z.number().positive().optional(),
    hornCutoffHz: z.number().positive().optional(),
    hornMouthCm2: z.number().positive().optional(),
    hornThroatCm2: z.number().positive().optional(),
    maxVelocityMs: z.number().positive().optional(),
  }),
  simulations: z.array(makeCurveEntry(z.array(z.string()).min(1), SIM_SOURCES)).default([]),
  measurements: z.array(makeCurveEntry(z.array(z.string()).min(1), MEAS_SOURCES)).default([]),
  sources: z.array(designSource).default([]),
  images: z.array(z.string()).default([]),
  plans: z.array(z.string().endsWith(".pdf")).default([]),
  author: z.string().optional(),
  sourceUrl: z.url().optional(),
  ways: z.number().int().min(1).max(4).optional(),
  revision: z.string().optional(),
  // No default on purpose: silently labelling a third-party plan would misstate its rights.
  license: enumOf("license"),
  licenseNote: z.string().optional(),
  recommendedFor: z.array(enumOf("recommendedFor")).default([]),
  verified: z.boolean().default(false),
  buildComplexity: z.enum(BUILD_COMPLEXITIES).optional(),
  topologyVariant: enumOf("topologyVariant").optional(),
  connectors: z.array(enumOf("connectors")).default([]),
  grossVolumeL: z.number().positive().optional(),
  plywoodThicknessMm: z.number().positive().optional(),
  sheetCount: z.number().int().positive().optional(),
  sheetSizeMm: z.object({ wMm: z.number().positive(), hMm: z.number().positive() }).optional(),
});

// Typed structurally so it applies to both the shared object and content.config.ts's extended variant.
export const licenseSuperRefine = (
  e: { license: string; licenseNote?: string; plans: unknown[] },
  ctx: z.RefinementCtx
) => {
  if (e.license === "LicenseRef-Proprietary" && e.plans.length > 0) {
    ctx.addIssue({
      code: "custom",
      path: ["plans"],
      message:
        "LicenseRef-Proprietary entries are metadata-only: plan files must not be committed (link via sourceUrl instead)",
    });
  }
  if (e.license === "LicenseRef-Permission" && !e.licenseNote) {
    ctx.addIssue({
      code: "custom",
      path: ["licenseNote"],
      message:
        "LicenseRef-Permission requires licenseNote recording the permission grant (who, when, scope)",
    });
  }
};

export const enclosureFrontmatterSchema =
  enclosureFrontmatterObject.superRefine(licenseSuperRefine);

// API entity shapes: collection data plus the entry id the JSON endpoints add.
export type ConeDriver = z.infer<typeof coneDriverSchema> & { id: string };
export type CompressionDriver = z.infer<typeof compressionDriverSchema> & { id: string };
export type Driver = ConeDriver | CompressionDriver;
export type Horn = z.infer<typeof hornSchema> & { id: string };
