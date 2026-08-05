/**
 * Recipe-measurement unit core (spec section 20). Mass and volume are kept
 * as two separate dimensions with their own base units — a mass unit only
 * ever converts to another mass unit, a volume unit only to another volume
 * unit, UNLESS the visitor supplies an explicit density, exactly like the
 * spec demands ("masa se convierte con masa; volumen se convierte con
 * volumen; masa ↔ volumen únicamente cuando el usuario proporcione
 * densidad"). Count-based ingredients (eggs, cloves) are never silently
 * rounded away — `scaleCountUnit` returns the exact fraction and lets the
 * caller decide how to present it.
 */

export type RecipeDimension = "mass" | "volume" | "count";

export interface RecipeUnitDefinition {
  id: string;
  label: string;
  dimension: RecipeDimension;
  /** Multiply a value in this unit by `toBaseGrams`/`toBaseMl` to reach the dimension's base unit (grams for mass, milliliters for volume). Unused for "count". */
  toBase: number | null;
}

export const RECIPE_UNITS: RecipeUnitDefinition[] = [
  { id: "g", label: "Gramos (g)", dimension: "mass", toBase: 1 },
  { id: "kg", label: "Kilogramos (kg)", dimension: "mass", toBase: 1000 },
  { id: "oz", label: "Onzas (oz)", dimension: "mass", toBase: 28.349523125 },
  { id: "lb", label: "Libras (lb)", dimension: "mass", toBase: 453.59237 },
  { id: "ml", label: "Mililitros (ml)", dimension: "volume", toBase: 1 },
  { id: "l", label: "Litros (l)", dimension: "volume", toBase: 1000 },
  { id: "tsp", label: "Cucharadita (tsp)", dimension: "volume", toBase: 4.92892159375 },
  { id: "tbsp", label: "Cucharada (tbsp)", dimension: "volume", toBase: 14.78676478125 },
  { id: "cup", label: "Taza (cup)", dimension: "volume", toBase: 236.5882365 },
  { id: "unit", label: "Unidad", dimension: "count", toBase: null },
];

export function getRecipeUnit(id: string): RecipeUnitDefinition | undefined {
  return RECIPE_UNITS.find((u) => u.id === id);
}

export interface UnitConversionResult {
  ok: boolean;
  error?: string;
  value?: number;
}

/**
 * Converts between two recipe units. Same-dimension conversions (mass<->mass,
 * volume<->volume) never need density. Cross-dimension (mass<->volume) is
 * only performed when `densityGramsPerMl` is supplied — otherwise it's
 * rejected outright rather than silently guessing a density.
 */
export function convertRecipeUnit(value: number, fromUnitId: string, toUnitId: string, densityGramsPerMl?: number): UnitConversionResult {
  if (!Number.isFinite(value)) return { ok: false, error: "El valor no es un número finito." };
  const from = getRecipeUnit(fromUnitId);
  const to = getRecipeUnit(toUnitId);
  if (!from || !to) return { ok: false, error: "Unidad desconocida." };

  if (from.dimension === "count" || to.dimension === "count") {
    if (from.id !== to.id) return { ok: false, error: "Las unidades contables (unidad) no se pueden convertir a masa o volumen." };
    return { ok: true, value };
  }

  if (from.dimension === to.dimension) {
    const baseValue = value * (from.toBase ?? 1);
    return { ok: true, value: baseValue / (to.toBase ?? 1) };
  }

  // Cross-dimension: mass <-> volume, requires density.
  if (!densityGramsPerMl || densityGramsPerMl <= 0) {
    return { ok: false, error: "Convertir entre masa y volumen requiere una densidad (g/ml) proporcionada por ti." };
  }
  if (from.dimension === "mass" && to.dimension === "volume") {
    const grams = value * (from.toBase ?? 1);
    const ml = grams / densityGramsPerMl;
    return { ok: true, value: ml / (to.toBase ?? 1) };
  }
  // volume -> mass
  const ml = value * (from.toBase ?? 1);
  const grams = ml * densityGramsPerMl;
  return { ok: true, value: grams / (to.toBase ?? 1) };
}

/** Renders a decimal as a friendly fraction (halves/thirds/quarters/eighths) for count-based or small volume ingredients — never silently rounds to a whole number. */
export function toFriendlyFraction(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const whole = Math.floor(value);
  const remainder = value - whole;
  const denominators = [2, 3, 4, 8];
  let best: { num: number; den: number; diff: number } | null = null;
  for (const den of denominators) {
    const num = Math.round(remainder * den);
    if (num === 0 || num === den) continue;
    const diff = Math.abs(remainder - num / den);
    if (!best || diff < best.diff) best = { num, den, diff };
  }
  if (!best || best.diff > 0.02) return value.toLocaleString("es-ES", { maximumFractionDigits: 2 });
  const fractionText = `${best.num}/${best.den}`;
  return whole > 0 ? `${whole} ${fractionText}` : fractionText;
}
