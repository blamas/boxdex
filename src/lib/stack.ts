import type { Category } from "./category";

export interface StackSlot {
  slug: string;
  qty: number;
}

export interface CoverageInputs {
  distanceM: number;
  targetSplDb: number;
  crestDb: number;
}

export interface CoverageResult {
  d: number;
  splAt1m: number;
  splAtD: number;
  arrayGainDb: number;
  systemSplAtD: number;
  requiredPeakDb: number;
  headroomDb: number;
  nNeeded: number;
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

// URL format: slug:qty,slug:qty,...,d=<distance>,spl=<target>,c=<crest>
// Slots are identified by containing ":", params by containing "=".
export function encodeStack(state: StackSlot[], cov: CoverageInputs): string {
  const parts = state.map((s) => `${s.slug}:${s.qty}`);
  parts.push(`d=${cov.distanceM}`, `spl=${cov.targetSplDb}`, `c=${cov.crestDb}`);
  return parts.join(",");
}

export function decodeStack(encoded: string): { state: StackSlot[]; cov: CoverageInputs } {
  const state: StackSlot[] = [];
  const cov: CoverageInputs = { distanceM: 20, targetSplDb: 103, crestDb: DEFAULT_CREST_DB };
  if (!encoded.trim()) return { state, cov };

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
      }
    } else if (part.includes(":")) {
      const colon = part.indexOf(":");
      const slug = part.slice(0, colon);
      const qty = Number.parseInt(part.slice(colon + 1), 10);
      if (slug && qty > 0) state.push({ slug, qty });
    }
  }

  return { state, cov };
}

// System SPL at distance: inverse-square loss from the 1 m reference (−20·log10 d,
// point source) plus the per-category array gain for the cabinet count. Headroom is
// measured against the peak the program needs: target (continuous) + crest factor.
export function calcCoverage(
  maxSplDb: number | undefined,
  category: Category,
  qty: number,
  distanceM: number,
  targetSplDb: number,
  crestDb: number = DEFAULT_CREST_DB
): CoverageResult | null {
  if (maxSplDb === undefined || distanceM <= 0) return null;
  const splAt1m = maxSplDb;
  const splAtD = maxSplDb - 20 * Math.log10(distanceM);
  const gain = arrayGainDb(category, qty);
  const systemSplAtD = splAtD + gain;
  const requiredPeakDb = targetSplDb + crestDb;
  const headroomDb = systemSplAtD - requiredPeakDb;
  // Smallest N whose array gain closes the deficit to the required peak.
  const deficit = requiredPeakDb - splAtD;
  const nNeeded = deficit <= 0 ? 1 : Math.max(1, Math.ceil(10 ** (deficit / gainCoeff(category))));
  return {
    d: distanceM,
    splAt1m,
    splAtD,
    arrayGainDb: gain,
    systemSplAtD,
    requiredPeakDb,
    headroomDb,
    nNeeded,
  };
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

const COMPOSITE_F_MIN = 20;
const COMPOSITE_F_MAX = 20000;
// Sub passband and broadband ("tops") regions used for the spectral-balance tilt.
const SUB_REGION: [number, number] = [20, 100];
const TOP_REGION: [number, number] = [1000, 16000];

// Log-linear interpolation of a band's dB at frequency f. Returns null outside the
// band's own data range. Bands never extrapolate beyond what they were measured/simmed at.
function interpDb(points: [number, number][], f: number): number | null {
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

// 1/12-octave log grid spanning the audio band.
function logGrid(): number[] {
  const grid: number[] = [];
  for (let f = COMPOSITE_F_MIN; f <= COMPOSITE_F_MAX; f *= 2 ** (1 / 12)) {
    grid.push(f);
  }
  return grid;
}

// Predicted system response: each band scaled by its array gain, then power-summed
// across bands on a shared grid. This is a derived prediction. Stored curves are
// left untouched. dB_total(f) = 10·log10( Σ 10^(dB_band(f)/10) ).
export function compositeResponse(bands: ResponseBand[]): [number, number][] {
  const out: [number, number][] = [];
  for (const f of logGrid()) {
    let powerSum = 0;
    for (const band of bands) {
      const db = interpDb(band.points, f);
      if (db === null) continue;
      powerSum += 10 ** ((db + arrayGainDb(band.category, band.qty)) / 10);
    }
    if (powerSum > 0) out.push([f, 10 * Math.log10(powerSum)]);
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
export function spectralBalance(bands: ResponseBand[]): SpectralBalance | null {
  const composite = compositeResponse(bands);
  const subAvgDb = meanInRange(composite, SUB_REGION);
  const topAvgDb = meanInRange(composite, TOP_REGION);
  if (subAvgDb === null || topAvgDb === null) return null;
  return { subAvgDb, topAvgDb, tiltDb: subAvgDb - topAvgDb };
}
