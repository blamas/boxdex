// Derived driver hints from Thiele–Small parameters. All inputs SI.

export type Alignment = "sealed" | "flexible" | "ported";

// Efficiency Bandwidth Product = fs / qes; the sealed-vs-ported suitability heuristic.
export function ebp(fsHz: number, qes: number | undefined): number | undefined {
  if (qes === undefined || qes <= 0) return undefined;
  return Math.round(fsHz / qes);
}

export function alignmentFromEbp(value: number | undefined): Alignment | undefined {
  if (value === undefined) return undefined;
  if (value < 50) return "sealed";
  if (value > 100) return "ported";
  return "flexible";
}

// Sealed-box net volume for a target total system Q (Qtc).
//   Vb = Vas / ((Qtc/Qts)^2 - 1)
// Returns undefined when Qts >= Qtc (driver is already over-damped for the target,
// so no sealed volume yields that Qtc).
export function sealedVbL(vasL: number, qts: number, qtc = Math.SQRT1_2): number | undefined {
  const ratio = (qtc / qts) ** 2 - 1;
  if (ratio <= 0) return undefined;
  return Math.round((vasL / ratio) * 10) / 10;
}
