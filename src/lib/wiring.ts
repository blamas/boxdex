// Amp-channel matching for N identical cabinets: series/parallel wiring loads and the
// continuous power an amp channel should deliver into the resulting load. All inputs
// are nominal figures; real impedance dips below nominal (see impedanceMinOhm).

export type LoadRating = "ok" | "caution" | "danger" | "inefficient";

// How N cabinets are arranged: p parallel branches of s cabinets in series. Kept as
// structure rather than a prebuilt English label so the UI can localize it.
export interface WiringArrangement {
  kind: "single" | "parallel" | "series" | "seriesParallel";
  series: number;
  parallel: number;
}

export interface WiringOption {
  arrangement: WiringArrangement;
  loadOhm: number;
  rating: LoadRating;
  // Combined load using each box's real impedance dip below nominal (impedanceMinOhm),
  // when known. undefined when the manifest has no minimum-impedance figure for this box.
  minLoadOhm: number | undefined;
  // Rating of that dip, normalised through IEC_MIN_IMPEDANCE_RATIO (see makeOption).
  minRating: LoadRating | undefined;
}

export function loadRating(loadOhm: number): LoadRating {
  if (loadOhm < 2) return "danger";
  if (loadOhm < 4) return "caution";
  if (loadOhm > 16) return "inefficient";
  return "ok";
}

// IEC 60268-5 allows a compliant box's impedance minimum to dip to 0.8× nominal, and the
// nominal-load thresholds above already anticipate that. Rating the raw dip against them
// would double-count the conservatism (every honest 4 Ω load "dips" to ~3.2), so the dip
// is normalised back through this ratio first: only a dip anomalously deep versus the
// claimed nominal actually downgrades the rating.
const IEC_MIN_IMPEDANCE_RATIO = 0.8;

const RATING_SEVERITY: Record<LoadRating, number> = {
  ok: 0,
  inefficient: 1,
  caution: 2,
  danger: 3,
};

// A dip can only ever downgrade the nominal rating, never improve it: a high (inefficient)
// nominal load doesn't become "ok" because its dip normalises into the 4-16 Ω window.
function worseRating(a: LoadRating, b: LoadRating): LoadRating {
  return RATING_SEVERITY[a] >= RATING_SEVERITY[b] ? a : b;
}

// The rating an amp channel actually sees: the (IEC-normalised) real-dip rating when
// known, since that's the worst case the amp has to survive, nominal otherwise.
export function effectiveRating(o: WiringOption): LoadRating {
  return o.minRating ?? o.rating;
}

export function divisors(n: number): number[] {
  const d: number[] = [];
  for (let i = 1; i <= n; i++) if (n % i === 0) d.push(i);
  return d;
}

// One arrangement's option: minOhm (impedanceMinOhm) gets the same s/p ratio applied as
// nominal, since series/parallel combination is linear regardless of which impedance
// figure is being combined. The dip is rated after normalising through
// IEC_MIN_IMPEDANCE_RATIO (see there), and can only worsen the nominal rating.
function makeOption(
  arrangement: WiringArrangement,
  nominalOhm: number,
  ratio: number,
  minOhm?: number
) {
  const loadOhm = nominalOhm * ratio;
  const rating = loadRating(loadOhm);
  const minLoadOhm = minOhm !== undefined ? minOhm * ratio : undefined;
  // mΩ rounding so an exactly-compliant dip (0.8× nominal) normalises back to nominal
  // instead of landing a float ulp below a rating threshold.
  const normalisedDip =
    minLoadOhm !== undefined
      ? Math.round((minLoadOhm / IEC_MIN_IMPEDANCE_RATIO) * 1000) / 1000
      : undefined;
  return {
    arrangement,
    loadOhm,
    rating,
    minLoadOhm,
    minRating:
      normalisedDip !== undefined ? worseRating(rating, loadRating(normalisedDip)) : undefined,
  };
}

// All series×parallel arrangements of N identical loads: p parallel branches of s cabs
// each in series (s·p = N), load = Z·s/p. Sorted by ascending load.
export function wiringOptions(nominalOhm: number, qty: number, minOhm?: number): WiringOption[] {
  if (nominalOhm <= 0 || qty < 1 || !Number.isInteger(qty)) return [];
  if (qty === 1) {
    return [makeOption({ kind: "single", series: 1, parallel: 1 }, nominalOhm, 1, minOhm)];
  }

  const options = divisors(qty).map((s) => {
    const p = qty / s;
    const kind = s === 1 ? "parallel" : p === 1 ? "series" : "seriesParallel";
    return makeOption({ kind, series: s, parallel: p }, nominalOhm, s / p, minOhm);
  });
  return options.sort((a, b) => a.loadOhm - b.loadOhm);
}

export interface AmpChannelW {
  // Continuous (RMS) rating into the chosen load. min = 1× total AES; ideal = 2× AES
  // (clean peak headroom: an amp clipping into drivers kills more of them than honest
  // overpowering, so size up, not down).
  minW: number;
  idealW: number;
}

export function ampChannelW(aesPerCabW: number, qty: number): AmpChannelW | undefined {
  if (aesPerCabW <= 0 || qty < 1 || !Number.isInteger(qty)) return undefined;
  const total = aesPerCabW * qty;
  return { minW: total, idealW: total * 2 };
}

// Target AES power per channel: ~4 kW is a safe continuous ceiling for a single amp
// channel. When per-channel load exceeds this, the suggestion splits across more channels.
const SUGGESTED_MAX_W_PER_CHANNEL = 4000;

interface SuggestedChannelsOptions {
  // Enables power-aware suggestions.
  aesPerCabW?: number;
  maxWPerChannel?: number;
  // impedanceMinOhm, so the rating reflects an anomalously deep real dip (see makeOption).
  minOhm?: number;
}

// Smallest divisor of qty where at least one wiring option per channel is "ok" (4-16 Ω)
// AND per-channel AES power is within target. When no divisor reaches that bar, falls
// back to the best impedance rating reachable ("ok" over "caution"), preferring the
// split with the lowest per-channel power among equally-rated candidates (more channels
// beats fewer once the power target itself is unreachable).
export function suggestedChannels(
  nominalOhm: number,
  qty: number,
  opts: SuggestedChannelsOptions = {}
): number {
  const { aesPerCabW = 0, maxWPerChannel = SUGGESTED_MAX_W_PER_CHANNEL, minOhm } = opts;
  const hasPowerBudget = aesPerCabW > 0;
  let bestOk: number | undefined;
  let bestCaution: number | undefined;

  for (const d of divisors(qty)) {
    const qtyPerCh = qty / d;
    const options = wiringOptions(nominalOhm, qtyPerCh, minOhm);
    const powerPerCh = aesPerCabW * qtyPerCh;

    if (options.some((o) => effectiveRating(o) === "ok")) {
      if (hasPowerBudget && powerPerCh <= maxWPerChannel) return d;
      // Power target unreachable at this divisor: keep scanning, preferring the
      // divisor with the lowest per-channel power once a power budget is known.
      if (bestOk === undefined || (hasPowerBudget && d > bestOk)) bestOk = d;
    } else if (options.some((o) => effectiveRating(o) === "caution")) {
      if (bestCaution === undefined || (hasPowerBudget && d > bestCaution)) bestCaution = d;
    }
  }

  return bestOk ?? bestCaution ?? 1;
}
