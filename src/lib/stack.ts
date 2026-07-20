import { CATEGORIES, type Category } from "./category";
import type { EnclosureRecord } from "./metrics";

export interface StackSlot {
  slug: string;
  qty: number;
  curveSelection?: string; // encoded in URL as the third colon-segment after qty
  channels?: number; // explicit channel override; undefined = auto-suggested
}

export interface CoverageInputs {
  distanceM: number;
  targetSplDb: number;
  crestDb: number;
}

export const CATEGORY_UPPER_HZ: Record<Category, number> = {
  sub: 100,
  kick: 200,
  mid: 3500,
  top: 20000,
};

// Default crest factor (peak − RMS) used for headroom. AES2 driver tests and
// compressed live music both sit around 6 dB; sine is only 3 dB.
export const DEFAULT_CREST_DB = 6;

// dB gained by stacking N coupled cabinets. Subs couple coherently in their LF
// passband (≈ +6 dB / doubling = 20·log10 N); broadband mid/top sum closer to
// power (≈ +3 dB / doubling = 10·log10 N). See hornplans calc_niveau.
function gainCoeff(category: Category): number {
  return category === "sub" ? 20 : 10;
}

export function arrayGainDb(category: Category, n: number): number {
  if (n <= 1) return 0;
  return gainCoeff(category) * Math.log10(n);
}

// Combine several boxes' own max-SPL figures into one category-wide SPL@1m, honoring
// the category's coupling law: each entry's own qty first gets its own array gain, then
// entries combine in that same coeff domain (amplitude sum for subs, power sum for
// broadband) so a category split across several slots/models reads the same as one slot
// of the equivalent total count (see combineCategorySplDb tests). undefined for no entries.
export function combineCategorySplDb(
  category: Category,
  entries: { maxSplDb: number; qty: number }[]
): number | undefined {
  if (entries.length === 0) return undefined;
  const coeff = gainCoeff(category);
  let acc = 0;
  for (const { maxSplDb, qty } of entries) {
    acc += 10 ** ((maxSplDb + arrayGainDb(category, qty)) / coeff);
  }
  return coeff * Math.log10(acc);
}

// Combine already-computed per-category SPL@1m figures into one system total. Different
// categories occupy different bands, so they always sum incoherently (power domain)
// regardless of how coherently their own cabinets couple.
function combineSystemSplDb(catSplDb: Partial<Record<Category, number>>): number {
  let systemPower = 0;
  for (const db of Object.values(catSplDb)) {
    if (db === undefined) continue;
    systemPower += 10 ** (db / 10);
  }
  return 10 * Math.log10(systemPower);
}

// Bounds shared by the crossover/gain inputs (SystemResponse) and decodeStack, so a
// hand-edited URL can never feed values into the prediction that the UI itself would
// not accept.
export const XO_FC_MIN_HZ = 20;
export const XO_FC_MAX_HZ = 20000;
export const XO_GAIN_MIN_DB = -24;
export const XO_GAIN_MAX_DB = 24;

export function clampXoFcHz(n: number): number {
  return Math.min(Math.max(n, XO_FC_MIN_HZ), XO_FC_MAX_HZ);
}

export function clampXoGainDb(n: number): number {
  return Math.min(Math.max(n, XO_GAIN_MIN_DB), XO_GAIN_MAX_DB);
}

// Crossover UI state that travels with the share link: whether the LR4 prediction is
// applied, any custom crossover points (keyed by box id + side, see xoOverrideKey), and
// any manual gain trim per box (dB, display/prediction only, doesn't feed back into where
// a crossover point gets suggested, see the comment on gain application in SystemResponse).
export interface XoState {
  applied: boolean;
  overrides: Partial<Record<string, number>>;
  gains: Partial<Record<string, number>>;
}

const EMPTY_XO: XoState = { applied: false, overrides: {}, gains: {} };

// URL format: slug:qty[:ch<n>][:curveSelection],slug:qty,...,d=<distance>,spl=<target>,c=<crest>
// plus xo=1 when the crossover prediction is applied, x<id>=<fc> per custom crossover
// point, and g<id>=<db> per gain trim (db may be negative or fractional, unlike Hz values).
// Slots are identified by containing ":", params by containing "=". The optional channel
// override and curve selection are positional (per-slot), not slug-keyed, so two slots
// sharing a slug keep independent values.
export function encodeStack(
  state: StackSlot[],
  cov: CoverageInputs,
  xo: XoState = EMPTY_XO
): string {
  const parts = state.map((s) => {
    const segs = [s.slug, String(s.qty)];
    if (s.channels !== undefined) segs.push(`ch${s.channels}`);
    if (s.curveSelection) segs.push(s.curveSelection);
    return segs.join(":");
  });
  parts.push(`d=${cov.distanceM}`, `spl=${cov.targetSplDb}`, `c=${cov.crestDb}`);
  if (xo.applied) parts.push("xo=1");
  // Only state for slugs still in the stack: overrides/gains for removed slots would
  // otherwise ride along in share links and localStorage forever.
  const liveSlugs = new Set(state.map((s) => s.slug));
  for (const [key, fc] of Object.entries(xo.overrides)) {
    const colon = key.lastIndexOf(":");
    const slug = colon > 0 ? key.slice(0, colon) : key;
    if (fc !== undefined && fc > 0 && liveSlugs.has(slug)) parts.push(`x${key}=${fc}`);
  }
  for (const [id, db] of Object.entries(xo.gains)) {
    if (db !== undefined && db !== 0 && liveSlugs.has(id)) parts.push(`g${id}=${db}`);
  }
  return parts.join(",");
}

// Old curveSelection keys were "meas:driverId:c1:source"; strip the legacy suffix.
function migrateCurveKey(key: string): string {
  const m = key.match(/^((?:meas|sim):[^:]+):c\d+:/);
  return m ? m[1] : key;
}

export function decodeStack(encoded: string): {
  state: StackSlot[];
  cov: CoverageInputs;
  xo: XoState;
} {
  const state: StackSlot[] = [];
  const cov: CoverageInputs = { distanceM: 20, targetSplDb: 103, crestDb: DEFAULT_CREST_DB };
  const xo: XoState = { applied: false, overrides: {}, gains: {} };
  if (!encoded.trim()) return { state, cov, xo };

  for (const part of encoded.split(",")) {
    if (part.includes("=")) {
      const eqIdx = part.indexOf("=");
      const key = part.slice(0, eqIdx);
      const val = part.slice(eqIdx + 1);
      if (key === "d") {
        const n = Number(val);
        if (n > 0) cov.distanceM = n;
      } else if (key === "spl") {
        const n = Number(val);
        if (n > 0) cov.targetSplDb = n;
      } else if (key === "c") {
        const n = Number(val);
        if (n >= 0) cov.crestDb = n;
      } else if (key === "xo") {
        xo.applied = val === "1";
      } else if (key.length > 1 && key[0] === "x") {
        // id is an arbitrary enclosure slug now, not a closed Category enum: accept any
        // non-empty id and let resolveCrossovers silently ignore stale/unmatched ones,
        // same tolerance as any other junk key. An old xsub=85 link decodes fine here
        // (overrides.sub = 85) but never resolves to anything, since no real box is
        // slugged "sub".
        const id = key.slice(1);
        const n = Number(val);
        if (id && n > 0) xo.overrides[id] = clampXoFcHz(n);
      } else if (key.length > 1 && key[0] === "g") {
        const id = key.slice(1);
        const n = Number(val);
        if (id && Number.isFinite(n) && n !== 0) xo.gains[id] = clampXoGainDb(n);
      }
    } else if (part.includes(":")) {
      const colon = part.indexOf(":");
      const slug = part.slice(0, colon);
      const rest = part.slice(colon + 1);
      const qty = Number.parseInt(rest, 10);
      // parseInt stops at the first non-digit, so "1:sim:bc-..." → qty=1
      // The rest (if any) follows the qty digits and a colon: an optional "ch<n>"
      // channel override, then an optional curve selection, each colon-separated.
      const qtyLen = String(qty).length;
      let tail = rest.length > qtyLen + 1 ? rest.slice(qtyLen + 1) : undefined;
      let channels: number | undefined;
      const chMatch = tail?.match(/^ch(\d+)(?::(.*))?$/s);
      if (chMatch) {
        const n = Number(chMatch[1]);
        channels = n > 0 ? n : undefined;
        tail = chMatch[2];
      }
      const curveSelection = tail ? migrateCurveKey(tail) : undefined;
      if (slug && qty > 0) state.push({ slug, qty, curveSelection, channels });
    }
  }

  return { state, cov, xo };
}

// A stack line item once its slug resolved to a manifest record.
export interface StackEntry {
  qty: number;
  rec: EnclosureRecord;
}

export interface StackSummary {
  totalCabs: number;
  totalWeightKg: number;
  weightMissing: boolean;
  // External (transport) volume from each cab's bounding box: what the van sees.
  totalTransportM3: number;
  totalSheets: number;
  sheetsMissing: boolean;
  // Distinct sheet sizes the counted plans assume, as "W×H" mm strings.
  sheetSizes: string[];
  totalPowerAesW: number;
  powerMissing: boolean;
  totalPowerProgramW: number;
  hasProgram: boolean;
  // Broadband power-sum of each band's max SPL (with its array gain) at 1 m;
  // undefined when no cab has a figure, "partial" when some are missing.
  systemMaxSplDb: number | undefined;
  maxSplPartial: boolean;
  lowHz: number | undefined;
  highHz: number | undefined;
}

export function summarizeStack(entries: StackEntry[]): StackSummary {
  let totalCabs = 0;
  let totalWeightKg = 0;
  let weightMissing = false;
  let totalTransportM3 = 0;
  let totalSheets = 0;
  let sheetsMissing = false;
  const sheetSizes = new Set<string>();
  let totalPowerAesW = 0;
  let powerMissing = false;
  let totalPowerProgramW = 0;
  let hasProgram = false;
  const catEntries: Partial<Record<Category, { maxSplDb: number; qty: number }[]>> = {};
  let hasMaxSpl = false;
  let maxSplPartial = false;
  let lowHz = Number.POSITIVE_INFINITY;
  let highHz = 0;

  for (const { qty, rec } of entries) {
    totalCabs += qty;

    if (rec.metrics.weightKg !== undefined) {
      totalWeightKg += qty * rec.metrics.weightKg;
    } else {
      weightMissing = true;
    }

    // footprint cm² × height mm → m³ (÷1e4 ÷1e3)
    totalTransportM3 += (qty * rec.metrics.footprintCm2 * rec.metrics.heightMm) / 1e7;

    if (rec.sheetCount !== undefined) {
      totalSheets += qty * rec.sheetCount;
      if (rec.sheetSizeMm !== undefined) {
        sheetSizes.add(`${rec.sheetSizeMm.wMm}×${rec.sheetSizeMm.hMm}`);
      }
    } else {
      sheetsMissing = true;
    }

    const aesPerCab = rec.powerAesW ?? rec.recommendedPowerW;
    if (aesPerCab !== undefined) {
      totalPowerAesW += qty * aesPerCab;
    } else {
      powerMissing = true;
    }
    if (rec.powerProgramW !== undefined) {
      totalPowerProgramW += qty * rec.powerProgramW;
      hasProgram = true;
    }

    if (rec.metrics.maxSplDb !== undefined) {
      if (!catEntries[rec.category]) catEntries[rec.category] = [];
      catEntries[rec.category]?.push({ maxSplDb: rec.metrics.maxSplDb, qty });
      hasMaxSpl = true;
    } else {
      maxSplPartial = true;
    }

    if (rec.metrics.f3Hz !== undefined) lowHz = Math.min(lowHz, rec.metrics.f3Hz);
    highHz = Math.max(highHz, rec.recommendedCrossoverHz ?? CATEGORY_UPPER_HZ[rec.category]);
  }

  const catSplDb: Partial<Record<Category, number>> = {};
  for (const cat of CATEGORIES) {
    const list = catEntries[cat];
    if (list) catSplDb[cat] = combineCategorySplDb(cat, list);
  }

  return {
    totalCabs,
    totalWeightKg,
    weightMissing,
    totalTransportM3,
    totalSheets,
    sheetsMissing,
    sheetSizes: [...sheetSizes],
    totalPowerAesW,
    powerMissing,
    totalPowerProgramW,
    hasProgram,
    systemMaxSplDb: hasMaxSpl ? combineSystemSplDb(catSplDb) : undefined,
    maxSplPartial,
    lowHz: Number.isFinite(lowHz) ? lowHz : undefined,
    highHz: highHz > 0 ? highHz : undefined,
  };
}

export interface CategoryCoverageResult {
  category: Category;
  totalQty: number;
  d: number;
  splAt1m: number;
  splAtD: number;
  requiredPeakDb: number;
  headroomDb: number;
}

// Coverage for a whole category: system SPL at distance is the combined SPL@1m (every
// slot's own maxSplDb + qty via the coupling law of combineCategorySplDb) minus the
// inverse-square loss (−20·log10 d, point source), and headroom is measured against the
// peak the program needs (target continuous + crest factor). Reflects everything already
// in the stack for that band: a category split across two models each qty 4 reads the
// same headroom as one model at qty 8 would.
export function calcCategoryCoverage(
  category: Category,
  entries: { maxSplDb: number; qty: number }[],
  distanceM: number,
  targetSplDb: number,
  crestDb: number = DEFAULT_CREST_DB
): CategoryCoverageResult | null {
  if (distanceM <= 0) return null;
  const splAt1m = combineCategorySplDb(category, entries);
  if (splAt1m === undefined) return null;
  const splAtD = splAt1m - 20 * Math.log10(distanceM);
  const requiredPeakDb = targetSplDb + crestDb;
  return {
    category,
    totalQty: entries.reduce((a, e) => a + e.qty, 0),
    d: distanceM,
    splAt1m,
    splAtD,
    requiredPeakDb,
    headroomDb: splAtD - requiredPeakDb,
  };
}

// How many more of one already-in-stack model (entries[targetIndex]) would need to be
// added, holding every other entry in the category fixed, to close the remaining gap to
// distanceM/targetSplDb/crestDb. 0 when the category already meets it without help from
// this model. Closed-form solve of the same coeff-domain combination as above: pull this
// entry's own contribution out of the total, see how much more it alone must supply.
export function additionalUnitsNeeded(
  category: Category,
  entries: { maxSplDb: number; qty: number }[],
  targetIndex: number,
  distanceM: number,
  targetSplDb: number,
  crestDb: number = DEFAULT_CREST_DB
): number {
  const target = entries[targetIndex];
  if (!target || distanceM <= 0) return 0;
  const coeff = gainCoeff(category);
  let otherAcc = 0;
  entries.forEach((e, idx) => {
    if (idx === targetIndex) return;
    otherAcc += 10 ** ((e.maxSplDb + arrayGainDb(category, e.qty)) / coeff);
  });
  const requiredAt1m = targetSplDb + crestDb + 20 * Math.log10(distanceM);
  const neededAcc = 10 ** (requiredAt1m / coeff) - otherAcc;
  if (neededAcc <= 0) return 0;
  const neededLevel = coeff * Math.log10(neededAcc) - target.maxSplDb;
  const neededQty = Math.max(1, Math.ceil(10 ** (neededLevel / coeff)));
  return Math.max(0, neededQty - target.qty);
}

// Generator sizing. Amps draw their continuous (AES-equivalent) acoustic output from the
// mains divided by amplifier efficiency; a genset should never run flat out, so add headroom.
// Defaults: Class-D efficiency 0.85, 30 % generator headroom (run at ≤ ~75 %).
export const AMP_EFFICIENCY = 0.85;
export const GENERATOR_HEADROOM = 1.3;

export function recommendedGeneratorW(
  totalAesW: number,
  efficiency: number = AMP_EFFICIENCY,
  headroom: number = GENERATOR_HEADROOM
): number {
  if (totalAesW <= 0) return 0;
  return (totalAesW / efficiency) * headroom;
}

export interface ResponseBand {
  category: Category;
  qty: number;
  points: [number, number][];
}

// One stack slot's plottable band: ResponseBand plus the identity/styling the chart and
// crossover matching need. Shared by StackBuilder (producer) and SystemResponse
// (consumer); id is the enclosure slug applyCrossovers matches corners by.
export interface SlotBand extends ResponseBand {
  id: string;
  name: string;
  color: string;
}

// One slot's passband summary for the CrossoverStrip: curve-derived bounds when the SPL
// curve is loaded, manifest specs otherwise (see StackBuilder's crossoverSlots).
export interface CrossoverSlot {
  category: Category;
  f3Hz: number;
  upperHz: number;
  name: string;
}

const COMPOSITE_F_MIN = 20;
const COMPOSITE_F_MAX = 20000;
// Sub passband and broadband ("tops") regions used for the spectral-balance tilt.
const SUB_REGION: [number, number] = [20, 100];
const TOP_REGION: [number, number] = [1000, 16000];

// Log-linear interpolation of a band's dB at frequency f. Returns null outside the
// band's own data range. Bands never extrapolate beyond what they were measured/simmed at.
// Exported for crossover.ts's curve-crossing search (findCrossingHz), which needs the
// same never-extrapolate sampling this module already uses for compositeResponse.
export function interpDb(points: [number, number][], f: number): number | null {
  if (points.length === 0) return null;
  if (f < points[0][0] || f > points[points.length - 1][0]) return null;
  for (let i = 1; i < points.length; i++) {
    const [f0, d0] = points[i - 1];
    const [f1, d1] = points[i];
    if (f <= f1) {
      if (f1 === f0) return d1;
      const t = (Math.log10(f) - Math.log10(f0)) / (Math.log10(f1) - Math.log10(f0));
      return d0 + t * (d1 - d0);
    }
  }
  return points[points.length - 1][1];
}

// 1/12-octave log grid spanning the audio band, computed once at module load. Exported
// so crossover.ts's findCrossingHz scans the same grid, not a second one.
export const LOG_GRID: number[] = (() => {
  const grid: number[] = [];
  for (let f = COMPOSITE_F_MIN; f <= COMPOSITE_F_MAX; f *= 2 ** (1 / 12)) {
    grid.push(f);
  }
  return grid;
})();

// Clamped at both ends so an out-of-range value lands on the edge, not off-canvas.
export function logFraction(f: number, fMin: number, fMax: number): number {
  const lo = Math.log10(fMin);
  const hi = Math.log10(fMax);
  const v = (Math.log10(Math.min(Math.max(f, fMin), fMax)) - lo) / (hi - lo);
  return Math.min(Math.max(v, 0), 1);
}

// Integer multiples within each decade (30,40,…,90,200,…), strictly inside the range.
export function minorLogTicks(fMin: number, fMax: number): number[] {
  const ticks: number[] = [];
  for (let exp = Math.floor(Math.log10(fMin)); exp <= Math.ceil(Math.log10(fMax)); exp++) {
    for (let mult = 2; mult <= 9; mult++) {
      const f = mult * 10 ** exp;
      if (f > fMin && f < fMax) ticks.push(f);
    }
  }
  return ticks;
}

// Predicted system response: each band scaled by its array gain, then summed across
// bands on a shared grid. "power" (default) assumes random phase between bands:
// dB = 10·log10( Σ 10^(dB/10) ). "coherent" assumes aligned phase, the ideal-LR4
// assumption once crossovers are applied (matched LR4 halves sum flat through fc):
// dB = 20·log10( Σ 10^(dB/20) ). Derived prediction; stored curves are left untouched.
export function compositeResponse(
  bands: ResponseBand[],
  mode: "power" | "coherent" = "power"
): [number, number][] {
  const coeff = mode === "coherent" ? 20 : 10;
  const out: [number, number][] = [];
  for (const f of LOG_GRID) {
    let sum = 0;
    for (const band of bands) {
      const db = interpDb(band.points, f);
      if (db === null) continue;
      sum += 10 ** ((db + arrayGainDb(band.category, band.qty)) / coeff);
    }
    if (sum > 0) out.push([f, coeff * Math.log10(sum)]);
  }
  return out;
}

export interface SpectralBalance {
  subAvgDb: number;
  topAvgDb: number;
  tiltDb: number;
}

function meanInRange(points: [number, number][], [lo, hi]: [number, number]): number | null {
  const vals = points.filter(([f]) => f >= lo && f <= hi).map(([, d]) => d);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// Sub-to-top tilt of the composite response (positive = subs hotter than tops, the
// "house curve" most bass-led genres want). Null unless both regions carry energy.
// `mode` must match the one the displayed composite was built with, otherwise the
// readout describes a different curve than the one plotted above it.
export function spectralBalance(
  bands: ResponseBand[],
  mode: "power" | "coherent" = "power"
): SpectralBalance | null {
  const composite = compositeResponse(bands, mode);
  const subAvgDb = meanInRange(composite, SUB_REGION);
  const topAvgDb = meanInRange(composite, TOP_REGION);
  if (subAvgDb === null || topAvgDb === null) return null;
  return { subAvgDb, topAvgDb, tiltDb: subAvgDb - topAvgDb };
}
