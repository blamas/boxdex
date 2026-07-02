## Description

<!-- What does this PR add or change? -->

## Checklist

### New enclosure design
- [ ] Folder named `src/content/enclosures/<slug>/`
- [ ] `index.mdx` with all required frontmatter fields
- [ ] All referenced CSV files are present and have `freq,value` columns
- [ ] All referenced PDF files are present
- [ ] Driver references resolve to existing entries in `data/drivers/`
- [ ] All units are SI (mm, L, Hz, dB, kg, W, Ω)
- [ ] `maxSplDb` is only set if you have a simulation or measurement to back it up
- [ ] `verified: true` only if you have real measured data
- [ ] `provenance` will be auto-derived from measurement sources; double-check it looks right

### New driver
- [ ] File at `data/drivers/<brand>/<id>.json`
- [ ] All required fields present (see `schema/driver.schema.json`)

### Code change
- [ ] `npm run lint` passes
- [ ] `npm test` passes
- [ ] `npm run build` passes (this validates all data)
