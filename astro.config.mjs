import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import svelte from "@astrojs/svelte";
import { defineConfig } from "astro/config";
import pagefind from "astro-pagefind";

// `site` drives canonical URLs and the sitemap; set SITE_URL at build time
// (the deploy workflow does). Falls back to localhost for dev/preview.
// Set `base` here (e.g. base: "/boxdex") when deploying to a repo subpath.
export default defineConfig({
  site: process.env.SITE_URL || "http://localhost:4321",
  output: "static",
  integrations: [mdx(), svelte(), sitemap(), pagefind()],
  build: {
    assets: "_assets",
  },
});
