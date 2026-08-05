/**
 * Display-only numeric formatting — `toFixed()`/`toPrecision()` are used
 * here strictly for presentation, never as part of a calculation (spec
 * section 9: "toFixed() puede utilizarse únicamente para presentación
 * final"). The calculator always states which precision it is showing.
 */
export const CALCULATOR_DISPLAY_PRECISION = 12;

export function formatCalculatorResult(value: number): string {
  if (Number.isNaN(value)) return "Error";
  if (!Number.isFinite(value)) return value > 0 ? "∞" : "-∞";
  if (value === 0) return "0";

  const abs = Math.abs(value);
  if (abs >= 1e15 || abs < 1e-9) {
    return value.toExponential(6).replace(/e([+-])(\d)$/, "e$1$2");
  }
  // Round to the documented display precision, then trim trailing zeros — never used as the
  // basis for a further calculation, only for what is shown to the visitor.
  const rounded = Number(value.toPrecision(CALCULATOR_DISPLAY_PRECISION));
  return String(rounded);
}
