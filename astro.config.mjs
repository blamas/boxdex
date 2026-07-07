import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import svelte from "@astrojs/svelte";
import { defineConfig } from "astro/config";
import pagefind from "astro-pagefind";

// `site` drives canonical URLs and the sitemap, `base` the path prefix, both from
// generic env vars so the build stays portable. SITE_URL is the explicit override
// (production sets it), otherwise localhost. SITE_BASE only for a subpath deployment.
export default defineConfig({
  site: process.env.SITE_URL || "http://localhost:4321",
  base: process.env.SITE_BASE || "/",
  output: "static",
  // When adding a locale: also add it to src/i18n/index.ts + a new src/i18n/locales/<code>.json.
  i18n: {
    defaultLocale: "en",
    locales: ["en", "fr"],
    routing: { prefixDefaultLocale: true },
  },
  // Prefetch links as they enter the viewport; clientPrerender upgrades to full
  // background prerender on Chrome (Speculation Rules API), with silent fallback.
  prefetch: { prefetchAll: true, defaultStrategy: "viewport" },
  experimental: { clientPrerender: true },
  integrations: [mdx(), svelte(), sitemap(), pagefind()],
  build: {
    assets: "_assets",
    inlineStylesheets: "auto",
    concurrency: 16,
  },
  vite: {
    server: {
      warmup: {
        clientFiles: ["./src/lib/echarts.ts", "./src/components/EChart.svelte"],
      },
    },
    build: {
      chunkSizeWarningLimit: 1000,
    },
  },
});
