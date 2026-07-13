// Zod schemas for the driver and horn collections: the single source of truth for
// both build-time validation (content.config.ts) and the client-side types the
// islands consume (via `import type`, so zod never reaches a browser bundle).
// The committed editor mirrors in schema/*.schema.json are generated from these
// via `npm run schema:gen`; regenerate after any edit here.

import { z } from "astro/zod";
import taxonomy from "../../data/taxonomy.json" with { type: "json" };
import { CATEGORIES } from "./category";

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

// qty has no default: every entry states its count explicitly, including qty: 1, so a file is
// self-describing at a glance with nothing implicit to remember. `horn` is genuinely optional
// (absent for cone entries and for any CD using a non-cataloged horn), no cross-check against
// the driver's type or exitInch, same trust level as any other optional spec in this schema.
export const enclosureDriverEntry = z.object({
  driver: z.string(),
  qty: z.number().int().positive(),
  horn: z.string().optional(),
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

// One physical CSV, optionally with a note. `count` only appears on `stacked[]` items (see
// makeCurveSet below): every other kind is inherently single-count, so there's no field here for
// a value that could never legitimately vary.
const curveFile = z.object({
  file: z.string().endsWith(".csv"),
  note: z.string().optional(),
});

// count has no default (mirrors enclosureDriverEntry.qty's "always explicit" rationale). Only
// SPL stacks (array gain from N identical cabinets is a well-defined sum), so this shape is
// SPL-only, never generalised to other kinds.
const stackedCurveFile = z.object({
  count: z.number().int().positive(),
  file: z.string().endsWith(".csv"),
  note: z.string().optional(),
});

// One authored curve-set: everything describing "one simulation run" or "one measurement
// session" lives together in a single object, so kind variants (spl/phase/impedance/...) and
// stacked SPL counts can never accidentally fragment into separate, unrelated entries the way
// flat array rows correlated by a shared string id could. `id` only needs to be unique within
// its own profile's own array (simulations checked separately from measurements), enforced by
// driverProfileSuperRefine. It's also the curves API's grouping key.
const makeCurveSet = (sources: [string, ...string[]]) =>
  z
    .object({
      id: z.string().min(1),
      source: z.enum(sources),
      curves: z
        .object({
          spl: curveFile.optional(),
          phase: curveFile.optional(),
          impedance: curveFile.optional(),
          group_delay: curveFile.optional(),
          distortion: curveFile.optional(),
          power_compression: curveFile.optional(),
        })
        .default({}),
      stacked: z.array(stackedCurveFile).optional(),
    })
    .superRefine((v, ctx) => {
      const hasAny = Object.values(v.curves).some((c) => c !== undefined) || !!v.stacked?.length;
      if (!hasAny) {
        ctx.addIssue({
          code: "custom",
          path: ["curves"],
          params: { key: "curveSetEmpty" },
          message: "a curve set needs at least one kind of curve or a stacked entry",
        });
      }
      // A stacked count only means something relative to the single-unit curve: without a plain
      // spl entry in the same curve set, there's nothing to compare "4x" against.
      if (v.stacked?.length && !v.curves.spl) {
        ctx.addIssue({
          code: "custom",
          path: ["stacked"],
          params: { key: "stackedMissingBase" },
          message: "stacked entries need a plain spl (1x) entry in the same curve set",
        });
      }
      const seenCounts = new Set<number>();
      v.stacked?.forEach((s, i) => {
        if (seenCounts.has(s.count)) {
          ctx.addIssue({
            code: "custom",
            path: ["stacked", i, "count"],
            params: { key: "duplicateStackedCount", count: s.count },
            message: `duplicate stacked count ${s.count}`,
          });
        }
        seenCounts.add(s.count);
      });
    });

// One buildable driver line-up for a box. Most boxes have exactly one profile (id: "default");
// a box that's buildable with more than one combination (e.g. 2x driver X + Y, or 2x driver P +
// Q) declares one entry per combination. Each profile owns its own simulations/measurements:
// nesting is the link to "which driver combination does this curve describe", so unlike the
// earlier `driverProfile` string-id approach, it can never dangle or mismatch.
export const driverProfile = z.object({
  id: z.string().min(1),
  drivers: z.array(enclosureDriverEntry).min(1),
  simulations: z.array(makeCurveSet(SIM_SOURCES)).default([]),
  measurements: z.array(makeCurveSet(MEAS_SOURCES)).default([]),
});

export const BUILD_COMPLEXITIES = ["simple", "moderate", "complex"] as const;

// Raw simulation project files (e.g. Hornresp record, AkAbak script) for remixing.
const designSource = z.object({
  tool: z.string(),
  file: z.string(),
  note: z.string().optional(),
});

// How to reach the designer/vendor for a box whose plans are not a free download.
// `value` is free-form (a handle or URL): the safe href is built at render in lib/contact.ts.
const contactEntry = z.object({
  channel: enumOf("contactChannel"),
  value: z.string().min(1),
  note: z.string().optional(),
});

// Un-refined so content.config.ts can .extend() it (a schema with .superRefine has no .extend);
// content.config.ts re-declares driverProfiles/images with reference()/image() for build-time checks.
export const enclosureFrontmatterObject = z.object({
  // Bounds below block impossible or fat-fingered values (a negative dimension, an extra
  // zero, degrees past 360, a port faster than the speed of sound), not implausible ones:
  // they're deliberately far outside anything in the real catalog, not a "typical" range.
  name: z.string().min(3).max(120),
  category: z.enum(CATEGORIES),
  topology: enumOf("topology"),
  driverProfiles: z.array(driverProfile).min(1),
  netVolumeL: z.number().min(0.01).max(50000),
  dims: z.object({
    hMm: z.number().min(10).max(10000),
    wMm: z.number().min(10).max(10000),
    dMm: z.number().min(10).max(10000),
  }),
  weightKg: z.number().min(0.1).max(5000).optional(),
  specs: z.object({
    // Frequency fields share the audible range (1 Hz - 20 kHz): nothing above 20 kHz is a
    // "cabinet f3" or a "crossover point" in any meaningful sense, that's just a bad unit.
    f3Hz: z.number().min(1).max(20000),
    f3HzHigh: z.number().min(1).max(20000).optional(),
    f6Hz: z.number().min(1).max(20000).optional(),
    fbHz: z.number().min(1).max(20000).optional(),
    maxSplDb: z.number().min(50).max(200).optional(),
    // Two independent limits: below Fb excursion-limited, above it power/thermal-limited.
    maxSplExcursionDb: z.number().min(50).max(200).optional(),
    maxSplThermalDb: z.number().min(50).max(200).optional(),
    sensitivityDb: z.number().min(30).max(150).optional(),
    impedanceMinOhm: z.number().min(0.1).max(1000).optional(),
    // Stated nominal load, for when internal multi-driver wiring makes it underivable.
    impedanceNominalOhm: z.number().min(0.1).max(1000).optional(),
    recommendedPowerW: z.number().min(1).max(1000000).optional(),
    powerAesW: z.number().min(1).max(1000000).optional(),
    powerProgramW: z.number().min(1).max(1000000).optional(),
    // A true physical ceiling: coverage can't exceed a full circle.
    coverageAngleDeg: z.number().min(1).max(360).optional(),
    recommendedCrossoverHz: z.number().min(1).max(20000).optional(),
    hornCutoffHz: z.number().min(1).max(20000).optional(),
    hornMouthCm2: z.number().min(1).max(1000000).optional(),
    hornThroatCm2: z.number().min(1).max(1000000).optional(),
    // A true physical ceiling: port air velocity can't exceed the speed of sound (~343 m/s).
    maxVelocityMs: z.number().min(0.1).max(343).optional(),
  }),
  sources: z.array(designSource).default([]),
  images: z.array(z.string()).default([]),
  plans: z.array(z.string().endsWith(".pdf")).default([]),
  author: z.string().optional(),
  sourceUrl: z.url().optional(),
  // How the box is obtained. Optional, no default: absent means unstated (assume the plans speak for themselves).
  availability: enumOf("availability").optional(),
  contact: z.array(contactEntry).default([]),
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
  grossVolumeL: z.number().min(0.01).max(50000).optional(),
  plywoodThicknessMm: z.number().min(1).max(100).optional(),
  sheetCount: z.number().int().min(1).max(1000).optional(),
  sheetSizeMm: z
    .object({ wMm: z.number().min(100).max(10000), hMm: z.number().min(100).max(10000) })
    .optional(),
});

// Typed structurally so it applies to both the shared object and content.config.ts's extended variant.
export const licenseSuperRefine = (
  e: {
    license: string;
    licenseNote?: string;
    plans: unknown[];
    availability?: string;
    contact?: unknown[];
    sourceUrl?: string;
  },
  ctx: z.RefinementCtx
) => {
  if (e.license === "LicenseRef-Proprietary" && e.plans.length > 0) {
    ctx.addIssue({
      code: "custom",
      path: ["plans"],
      params: { key: "proprietaryPlans" },
      message:
        "LicenseRef-Proprietary entries are metadata-only: plan files must not be committed (link via sourceUrl instead)",
    });
  }
  if (e.license === "LicenseRef-Permission" && !e.licenseNote) {
    ctx.addIssue({
      code: "custom",
      path: ["licenseNote"],
      params: { key: "licenseNoteRequired" },
      message:
        "LicenseRef-Permission requires licenseNote recording the permission grant (who, when, scope)",
    });
  }
  // A box you must "contact" or "commission" for is a dead end without a way to reach anyone.
  if (
    (e.availability === "contact" || e.availability === "commission") &&
    (e.contact?.length ?? 0) === 0 &&
    !e.sourceUrl
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["contact"],
      params: { key: "contactRequired" },
      message:
        "availability contact/commission needs at least one contact channel or a sourceUrl to reach",
    });
  }
};

// Typed structurally so it applies to both the shared object and content.config.ts's extended
// variant. Curve-set-internal checks (empty curve set, stacked count needing a base, duplicate
// stacked counts) live in makeCurveSet's own superRefine, since a curve set is now a single
// atomic object. This function only needs to check across curve sets: duplicate profile ids, and
// duplicate curve-set ids within one profile's own simulations (checked separately from its
// measurements): nesting means there's no more driverProfile string to resolve or mismatch.
export const driverProfileSuperRefine = (
  e: {
    driverProfiles: { id: string; simulations: { id: string }[]; measurements: { id: string }[] }[];
  },
  ctx: z.RefinementCtx
) => {
  const seenProfileIds = new Set<string>();
  e.driverProfiles.forEach((p, i) => {
    if (seenProfileIds.has(p.id)) {
      ctx.addIssue({
        code: "custom",
        path: ["driverProfiles", i, "id"],
        params: { key: "duplicateProfileId", id: p.id },
        message: `duplicate driverProfiles id "${p.id}"`,
      });
    }
    seenProfileIds.add(p.id);

    const checkCurveSetIds = (entries: { id: string }[], field: "simulations" | "measurements") => {
      const seen = new Set<string>();
      entries.forEach((entry, j) => {
        if (seen.has(entry.id)) {
          ctx.addIssue({
            code: "custom",
            path: ["driverProfiles", i, field, j, "id"],
            params: { key: "duplicateCurveId", id: entry.id },
            message: `duplicate curve set id "${entry.id}"`,
          });
        }
        seen.add(entry.id);
      });
    };
    checkCurveSetIds(p.simulations, "simulations");
    checkCurveSetIds(p.measurements, "measurements");
  });
};

export const enclosureFrontmatterSchema = enclosureFrontmatterObject.superRefine((e, ctx) => {
  licenseSuperRefine(e, ctx);
  driverProfileSuperRefine(e, ctx);
});

// API entity shapes: collection data plus the entry id the JSON endpoints add.
export type ConeDriver = z.infer<typeof coneDriverSchema> & { id: string };
export type CompressionDriver = z.infer<typeof compressionDriverSchema> & { id: string };
export type Driver = ConeDriver | CompressionDriver;
export type Horn = z.infer<typeof hornSchema> & { id: string };

// Minimal driver shape for label pickers that never read T/S params (Compare, ContributeBox),
// served by /api/driver-options.json so those pages skip the full drivers.json download.
export type DriverOption = Pick<Driver, "id" | "brand" | "model" | "type">;
