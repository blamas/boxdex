# La Bible des Caissons → data/enclosures/ import plan

## Source

678 PDFs from [hornplans.free.fr](http://hornplans.free.fr) / La Bible des Caissons, stored locally under `$SOURCE_DIR`:

```
Kicks/   12" / 15" / 18" kick bins
Subs/    10" / 12" / 15" / 18" / 21" subwoofers  (~60 designs for 18" alone)
Tops/    T2Vs (2-way) / T3Vs (3-way) / Pavillons (horns)
Ressources/  tutorials (skip)
```

~150 unique designs. Each folder has:
- **`Plan *.pdf`**: main spec sheet (the one we want)
- **`ModelName 1U 125x250.pdf`** etc.: CNC cut plans only, no specs (skip)

---

## PDF content reality check

| Group | Count | Content |
|---|---|---|
| Text-rich Plan PDFs | ~90 | Spec block parseable via pdftotext |
| Image-only Plan PDFs | ~60 | Vector drawings / scanned, need OCR |
| Cut-list PDFs (1U/2U/…) | ~520 | CNC dims only, skip entirely |

SPL graphs: always embedded as **bitmap images** inside Plan PDFs, never as data. But they are consistently formatted Hornresp outputs (log Hz X-axis, dB Y-axis, clean gridlines) and are **digitizable** (see Phase 2) below.

---

## Tool stack

**docling is broken** in nixpkgs: `docling-parse` is marked broken and blocks the whole tree.

**pymupdf** (`nixpkgs#python313Packages.pymupdf` v1.27.2) handles everything:
- `page.get_text()`: text extraction for text-rich PDFs
- `page.get_textpage_ocr()`: tesseract-backed OCR for image-only PDFs (tesseract 5.5.2 is a pymupdf dependency, pulled automatically)
- `page.get_pixmap()`: page rendering for graph digitization

**OpenCV** (`nixpkgs#python313Packages.opencv4`) for graph → CSV curve tracing.

```sh
# One nix shell covers everything:
nix shell nixpkgs#python313Packages.pymupdf nixpkgs#python313Packages.opencv4
```

---

## Phase 1: Metadata extraction → MDX stubs

### Script: `scripts/bible_import.py`

```sh
nix shell nixpkgs#python313Packages.pymupdf nixpkgs#python313Packages.opencv4 \
  --command python3 scripts/bible_import.py \
    --input "$SOURCE_DIR" \
    --output data/enclosures \
    --driver-map scripts/driver_aliases.json \
    --dry-run
```

#### Text extraction

```python
import fitz  # pymupdf

doc = fitz.open(pdf_path)
text = doc[0].get_text()

if len(text.strip()) < 200:
    tp = doc[0].get_textpage_ocr(language="fra+eng", dpi=200)
    text = doc[0].get_text(textpage=tp)
```

Uniform API, no separate code path for image vs text PDFs.

#### Field extraction (regex heuristics)

Spec blocks are mostly flat key-value lines in French/English:

```python
patterns = {
    "sensitivityDb": r"sensib\w*[:\s]+(\d+(?:\.\d+)?)\s*dB",
    "f3Hz":          r"F3\s*[=:]\s*(\d+)\s*Hz",
    "fbHz":          r"(?:accord|FB|Fb)\s*[=:]\s*(\d+(?:\.\d+)?)\s*Hz",
    "hpHz":          r"(?:coupure|high.?pass|filtre.{0,20})\s*(\d+)\s*Hz",
    "hpSlope":       r"(\d+)\s*dB/oct",
    "impedanceOhm":  r"(\d+)\s*ohms?",
    "powerRmsW":     r"(\d+)\s*[Ww]\s*RMS",
    "dims":          r"(\d+)\s*[xX×]\s*(\d+)\s*[xX×]\s*(\d+)\s*(?:mm|cm)",
    "drivers_raw":   r"(?:HP|optimis[eé]\s+pour|compatible)[:\s]+(.+?)(?:\n|$)",
}
```

Unmatched fields stay null → filled manually later.

#### Driver name → boxdex ID mapping

Build `scripts/driver_aliases.json` as you go:

```json
{
  "RCF LF18N401":          "rcf-lf18n401-8",
  "Eighteensound 18LW1400": "18s-18lw1400-8",
  "Faital 18HP1020":        "fpl-18hp1020-8"
}
```

Unmapped drivers → `drivers: []` + `driverNote: "RCF LF18N401"` in MDX (dangling ref check passes, note preserved for manual fix).

#### Slug + topology inference

- Slug: kebab from design name, e.g. `horn-mhb46`, `paraflex-type-r-18`
- Category from top-level folder: `Subs` → `sub`, `Kicks` → `kick`, `Tops` → `top`
- Topology keywords: `horn/MH/TH` → `horn`; `paraflex` → `paraflex`; `BR/FAITH/reflex` → `bass_reflex`; `compound/BP` → `bandpass`

#### Generated MDX

```yaml
---
name: "MHB-46"
category: sub
topology: horn
drivers: []
driverNote: "RCF LF18N401 / 18Sound 18LW1400 / Faital 18HP1020"
driverCount: 1
specs:
  sensitivityDb: 105
  f3Hz: 49
  fbHz: null
  recommendedHpHz: 35
  recommendedHpSlope: 24
  impedanceNominalOhm: 8
simulations: []
measurements: []
verified: false
license: "LicenseRef-Proprietary"
licenseNote: "© Marc.O Hornplans, non-commercial use only"
sourceUrl: "http://hornplans.free.fr"
---
<!-- imported from La Bible des Caissons -->
```

Original Plan PDF is copied to `data/enclosures/<slug>/<slug>.pdf`.

---

## Phase 2: Graph → CSV

The SPL curves are Hornresp simulation screenshots. They have a **very consistent layout**:
- X-axis: 10–10000 Hz (logarithmic), gridlines at decades + octaves
- Y-axis: dB (linear), gridlines at 5 dB steps
- 1–3 curves per plot (different stack sizes or power levels)
- Black background or white background depending on author

This is well-suited to automated OpenCV tracing because the format is predictable.

### Script: `scripts/bible_digitize.py`

Algorithm:
1. Render the SPL graph page via pymupdf: `page.get_pixmap(dpi=200)`
2. Detect plot bounding box: largest dark-bordered rectangle
3. Read axis labels (tick marks + numbers) to calibrate:
   - X: map pixel column → log₁₀(Hz), anchored by visible decade labels (10, 100, 1k, 10k)
   - Y: map pixel row → dB, anchored by labeled grid lines
4. For each curve color (black, red, blue): scan column by column, find the pixel with that color, record `(freq_hz, spl_db)`
5. Thin redundant points (±0.5 dB change threshold)
6. Write `data/enclosures/<slug>/spl-sim.csv` with `freq,value` columns

```sh
python3 scripts/bible_digitize.py \
  --input "$SOURCE_DIR" \
  --output data/enclosures \
  --page-hint 3   # which PDF page typically has the SPL graph
```

### Expected accuracy

- Frequency: ±3–5% (log scale, depends on tick calibration)
- SPL: ±1–2 dB (pixel quantization at 200 DPI)
- Point density: ~50–100 points per decade → sufficient for display

This matches boxdex CSV format (`freq,value`, `# comment` lines allowed). After digitizing, the MDX `simulations` entry gets updated:

```yaml
simulations:
  - driver: []
    kind: spl
    source: hornresp_sim
    file: spl-sim.csv
    note: "digitized from PDF graph, ±2 dB accuracy"
```

### Caveats

- Graphs with **overlapping curves** (1U vs 4U on same plot) need manual split or pick one
- Some plans show **acoustical power** not SPL, note in CSV comment
- High-frequency comb filtering artifacts (typical in Hornresp) are preserved as-is

---

## Phased scope

### Pilot (3 entries, validate before full run)

Pick one from each major format type to stress-test both scripts:

1. `Subs/18_ - 2x18_/HSR FAITH118/`: text-rich Plan PDF with SPL graph, French structured table
2. `Subs/18_ - 2x18_/MHB-46/`: text-rich Plan PDF, terse Marc.O style
3. `Subs/18_ - 2x18_/Paraflex Type R 18_/`: long text PDF (HOQS), English, parts list format

Verify MDX passes `mise run build`, spot-check CSV against the PDF graph by eye.

### Full run (after pilot validates)

1. **Subs/18"** (~60 designs): largest set, most consistent format, start here
2. **Kicks/15" + 12"**: next
3. **Subs/12" / 15" / 21"**: smaller sets
4. **Tops T2Vs / T3Vs**: last (multi-way, different field set, skip graph digitization for now)

---

## Post-import manual work per entry

- Assign correct driver IDs (search `driverNote` fields)
- Add missing topology values to `data/taxonomy.json` if needed
- Review graph digitization output for obvious artifacts
- Fill in weight, connectors, `verified: true` when confirmed

---

## Validation

```sh
mise run build   # catches dangling refs, bad license, invalid taxonomy
mise run test    # nothing breaks (no logic changed)
```
