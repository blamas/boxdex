// Amp-channel matching for N identical cabinets: series/parallel wiring loads and the
// continuous power an amp channel should deliver into the resulting load. All inputs
// are nominal figures; real impedance dips below nominal (see impedanceMinOhm).

export type LoadRating = "ok" | "caution" | "danger" | "inefficient";

export interface WiringOption {
  // "single", "2× parallel", "4× series", "2 series × 2 parallel"
  label: string;
  loadOhm: number;
  rating: LoadRating;
}

export function loadRating(loadOhm: number): LoadRating {
  if (loadOhm < 2) return "danger";
  if (loadOhm < 4) return "caution";
  if (loadOhm > 16) return "inefficient";
  return "ok";
}

// All series×parallel arrangements of N identical loads: s strings of p cabs each
// (s·p = N), load = Z·s/p. Sorted by ascending load.
export function wiringOptions(nominalOhm: number, qty: number): WiringOption[] {
  if (nominalOhm <= 0 || qty < 1 || !Number.isInteger(qty)) return [];
  if (qty === 1) {
    return [{ label: "single", loadOhm: nominalOhm, rating: loadRating(nominalOhm) }];
  }

  const options: WiringOption[] = [];
  for (let s = 1; s <= qty; s++) {
    if (qty % s !== 0) continue;
    const p = qty / s;
    const loadOhm = (nominalOhm * s) / p;
    let label: string;
    if (s === 1) label = `${p}× parallel`;
    else if (p === 1) label = `${s}× series`;
    else label = `${s} series × ${p} parallel`;
    options.push({ label, loadOhm, rating: loadRating(loadOhm) });
  }
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
  if (aesPerCabW <= 0 || qty < 1) return undefined;
  const total = aesPerCabW * qty;
  return { minW: total, idealW: total * 2 };
}
