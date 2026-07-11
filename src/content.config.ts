import { defineCollection, reference } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import {
  driverSchema,
  enclosureFrontmatterObject,
  hornSchema,
  licenseSuperRefine,
  MEAS_SOURCES,
  makeCurveEntry,
  SIM_SOURCES,
} from "./lib/schemas";

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

// The enclosure frontmatter schema lives in ./lib/schemas so the contribute island can
// share it. Here we re-declare only the fields that need Astro's content-layer types
// (reference("drivers") and image()), then re-apply the shared license refinement. All
// scalar/enum fields come from the shared object, so there is a single source of truth.
const enclosures = defineCollection({
  loader: glob({
    pattern: "**/index.mdx",
    base: "./data/enclosures",
    generateId: ({ entry }) => entry.split("/")[0],
  }),
  schema: ({ image }) =>
    enclosureFrontmatterObject
      .extend({
        drivers: z.array(reference("drivers")).min(1),
        images: z.array(image()).default([]),
        simulations: z
          .array(makeCurveEntry(z.array(reference("drivers")).min(1), SIM_SOURCES))
          .default([]),
        measurements: z
          .array(makeCurveEntry(z.array(reference("drivers")).min(1), MEAS_SOURCES))
          .default([]),
      })
      .superRefine(licenseSuperRefine),
});

export const collections = { drivers, enclosures, horns };
