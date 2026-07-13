import { defineCollection, reference } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import {
  driverProfile,
  driverProfileSuperRefine,
  driverSchema,
  enclosureDriverEntry,
  enclosureFrontmatterObject,
  hornSchema,
  licenseSuperRefine,
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

// Extends the shared schema (./lib/schemas) with the fields that need Astro's content-layer types.
const enclosures = defineCollection({
  loader: glob({
    pattern: "**/index.mdx",
    base: "./data/enclosures",
    generateId: ({ entry }) => entry.split("/")[0],
  }),
  schema: ({ image }) =>
    enclosureFrontmatterObject
      .extend({
        driverProfiles: z
          .array(
            driverProfile.extend({
              drivers: z
                .array(
                  enclosureDriverEntry.extend({
                    driver: reference("drivers"),
                    horn: reference("horns").optional(),
                  })
                )
                .min(1),
            })
          )
          .min(1),
        images: z.array(image()).default([]),
      })
      .superRefine((e, ctx) => {
        licenseSuperRefine(e, ctx);
        driverProfileSuperRefine(e, ctx);
      }),
});

export const collections = { drivers, enclosures, horns };
