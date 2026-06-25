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
  base: process.env.SITE_BASE || "/",
  output: "static",
  // When adding a locale: also add it to src/i18n/index.ts + a new src/i18n/<code>.ts.
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
      rollupOptions: {
        maxParallelFileOps: 100,
        // With 5000+ pages Vite generates thousands of chunks whose hashes
        // become unstable during SSR prerender. One vendor chunk fixes it.
        output: {
          manualChunks: (id) => (id.includes("node_modules") ? "vendor" : undefined),
        },
      },
    },
  },
});
