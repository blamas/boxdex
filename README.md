# Boxdex: open enclosure plans

A static website centralizing open plans for sound-system subwoofer and top enclosures.

## Stack

| Area | Choice |
|------|--------|
| Generator | Astro 5 (static) |
| Interactive islands | Svelte 5 (runes) |
| Charts | **Apache ECharts**: one library for curve overlays and design-space scatter |
| Search | Pagefind via astro-pagefind |
| Lint/format | Biome |
| Tests | Vitest |
| Units | SI only (mm, L, Hz, dB, kg, W, Ω) |
| Hosting | GitHub Pages |

## Data model

```
src/content/
  drivers/<id>.json          Thiele-Small parameters (schema in schema/driver.schema.json)
  enclosures/<slug>/
    index.mdx                Frontmatter metadata + build notes
    *.csv                    Frequency/phase/impedance/group-delay curves
    *.pdf                    Downloadable plan files
    *.png / *.jpg / *.webp   Photos and renders
```

Enclosures reference drivers by id. A dangling reference fails the build. A
significantly different build variant gets a new slug so existing links stay stable.

## Commands

```sh
npm install       # install dependencies
npm run dev       # development server (search not available here)
npm run build     # production build: validates all data; fails on bad refs
npm test          # vitest (pure logic only)
npm run lint      # biome check
```

## Deploying to GitHub Pages

Set `site` in `astro.config.mjs`:

```js
export default defineConfig({
  site: "https://<your-org>.github.io",
  // If hosting at a repo subpath:
  // base: "/boxdex",
  ...
});
```

The deploy workflow (`.github/workflows/deploy.yml`) builds and publishes `dist/`
automatically on push to `main`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the folder convention, CSV format, and
metric definitions.
