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
  // Prefetch on hover; clientPrerender upgrades to full background prerender on Chrome
  // (Speculation Rules API), with silent fallback. "hover" avoids mass-prefetching
  // every visible catalog card as the user scrolls.
  prefetch: { prefetchAll: true, defaultStrategy: "hover" },
  experimental: { clientPrerender: true },
  // The per-locale 404 pages are real routes (/en/404/), keep them out of the sitemap.
  integrations: [
    mdx(),
    svelte(),
    sitemap({ filter: (page) => !page.endsWith("/404/") }),
    pagefind(),
  ],
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
  },
});
