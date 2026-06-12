import { defineCollection, reference, z } from "astro:content";
import { glob } from "astro/loaders";
import { CURVE_KINDS } from "./lib/csv";
import { driverSchema, enumOf, hornSchema } from "./lib/schemas";

// Driver and horn schemas live in src/lib/schemas.ts so islands can share the inferred
// types. Validation is enforced at build/`astro sync`; the committed editor mirrors in
// schema/*.schema.json are regenerated via `npm run schema:gen`, never hand-edited.

const drivers = defineCollection({
  // Data is organised as data/drivers/<type>/<manufacturer>/<id>.json. Horns live under
  // data/drivers/horns and are a separate collection, so exclude them here. The id is the
  // bare filename (stable across the type/manufacturer folders enclosures reference by id).
  loader: glob({
    pattern: ["cone/**/*.json", "compression/**/*.json"],
    base: "./data/drivers",
    generateId: ({ entry }) => entry.replace(/.*\//, "").replace(/\.json$/, ""),
  }),
  schema: driverSchema,
});

const horns = defineCollection({
  loader: glob({
    pattern: "**/*.json",
    base: "./data/drivers/horns",
    generateId: ({ entry }) => entry.replace(/.*\//, "").replace(/\.json$/, ""),
  }),
  schema: hornSchema,
});

const simulation = z.object({
  driver: reference("drivers"),
  kind: z.enum(CURVE_KINDS),
  source: z.enum(["hornresp_sim", "akabak_sim"]),
  file: z.string().endsWith(".csv"),
  note: z.string().optional(),
});

const measurement = z.object({
  driver: reference("drivers"),
  kind: z.enum(CURVE_KINDS),
  source: z.enum(["rew_measured", "klippel"]),
  file: z.string().endsWith(".csv"),
  note: z.string().optional(),
});

// Raw simulation project files (e.g. Hornresp record, AkAbak script) for remixing.
const designSource = z.object({
  tool: z.string(),
  file: z.string(),
  note: z.string().optional(),
});

const enclosures = defineCollection({
  loader: glob({
    pattern: "**/index.mdx",
    base: "./data/enclosures",
    generateId: ({ entry }) => entry.split("/")[0],
  }),
  schema: ({ image }) =>
    z
      .object({
        name: z.string(),
        category: z.enum(["sub", "kick", "mid", "top"]),
        topology: enumOf("topology"),
        drivers: z.array(reference("drivers")).min(1),
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
          // Max SPL is bounded by two independent limits; quote whichever are known.
          // Below Fb the box is excursion-limited, above it power/thermal-limited.
          maxSplExcursionDb: z.number().optional(),
          maxSplThermalDb: z.number().optional(),
          sensitivityDb: z.number().optional(),
          impedanceMinOhm: z.number().positive().optional(),
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
        simulations: z.array(simulation).default([]),
        measurements: z.array(measurement).default([]),
        sources: z.array(designSource).default([]),
        images: z.array(image()).default([]),
        plans: z.array(z.string().endsWith(".pdf")).default([]),
        author: z.string().optional(),
        sourceUrl: z.url().optional(),
        ways: z.number().int().min(1).max(4).optional(),
        revision: z.string().optional(),
        // No default on purpose: silently labelling a third-party plan would misstate
        // its rights. LicenseRef-* terms are defined in LICENSES/.
        license: enumOf("license"),
        licenseNote: z.string().optional(),
        recommendedFor: z.array(enumOf("recommendedFor")).default([]),
        verified: z.boolean().default(false),
        buildComplexity: z.enum(["simple", "moderate", "complex"]).optional(),
        topologyVariant: enumOf("topologyVariant").optional(),
        connectors: z.array(enumOf("connectors")).default([]),
        grossVolumeL: z.number().positive().optional(),
        plywoodThicknessMm: z.number().positive().optional(),
        sheetCount: z.number().int().positive().optional(),
        sheetSizeMm: z
          .object({ wMm: z.number().positive(), hMm: z.number().positive() })
          .optional(),
      })
      .superRefine((e, ctx) => {
        if (e.license === "LicenseRef-Proprietary" && e.plans.length > 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["plans"],
            message:
              "LicenseRef-Proprietary entries are metadata-only: plan files must not be committed (link via sourceUrl instead)",
          });
        }
        if (e.license === "LicenseRef-Permission" && !e.licenseNote) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["licenseNote"],
            message:
              "LicenseRef-Permission requires licenseNote recording the permission grant (who, when, scope)",
          });
        }
      }),
});

export const collections = { drivers, enclosures, horns };
