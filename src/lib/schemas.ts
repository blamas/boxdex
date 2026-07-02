// Zod schemas for the driver and horn collections: the single source of truth for
// both build-time validation (content.config.ts) and the client-side types the
// islands consume (via `import type`, so zod never reaches a browser bundle).
// The committed editor mirrors in schema/*.schema.json are generated from these
// via `npm run schema:gen`; regenerate after any edit here.

import { z } from "astro/zod";
import taxonomy from "../../data/taxonomy.json" with { type: "json" };

// Vocabularies sourced from data/taxonomy.json: an array is a closed list (a value
// outside it is a build error), `null` is free-form (any string). The JSON import loses
// literal types, so cast the array to a non-empty tuple for z.enum.
export const enumOf = (field: keyof typeof taxonomy) => {
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

// API entity shapes: collection data plus the entry id the JSON endpoints add.
export type ConeDriver = z.infer<typeof coneDriverSchema> & { id: string };
export type CompressionDriver = z.infer<typeof compressionDriverSchema> & { id: string };
export type Driver = ConeDriver | CompressionDriver;
export type Horn = z.infer<typeof hornSchema> & { id: string };
