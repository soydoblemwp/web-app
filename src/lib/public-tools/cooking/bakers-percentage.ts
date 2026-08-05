/**
 * Baker's-percentage core (spec section 20): every ingredient's weight is
 * expressed as a percentage of the base ingredient (usually flour), which
 * itself is always 100%. Requires every ingredient to already be in a mass
 * unit (or convertible to one via a density) — baker's percentage is a
 * mass-ratio concept and never mixes in volume units directly.
 */
import { convertRecipeUnit } from "./recipe-units";
import type { RecipeIngredient } from "./recipe-scaling";

export interface BakersPercentageRow {
  id: string;
  name: string;
  grams: number;
  percent: number;
}

export interface BakersPercentageResult {
  ok: boolean;
  error?: string;
  baseIngredientId?: string;
  totalGrams?: number;
  rows?: BakersPercentageRow[];
}

export function calculateBakersPercentages(ingredients: RecipeIngredient[], baseIngredientId: string): BakersPercentageResult {
  const base = ingredients.find((i) => i.id === baseIngredientId);
  if (!base) return { ok: false, error: "Selecciona el ingrediente base (normalmente la harina)." };

  const grams: { id: string; name: string; grams: number }[] = [];
  for (const ing of ingredients) {
    const converted = convertRecipeUnit(ing.quantity, ing.unitId, "g", ing.densityGramsPerMl);
    if (!converted.ok || converted.value === undefined) {
      return { ok: false, error: `No se pudo convertir "${ing.name || "un ingrediente"}" a gramos (indica una densidad si es un ingrediente líquido).` };
    }
    grams.push({ id: ing.id, name: ing.name, grams: converted.value });
  }

  const baseGrams = grams.find((g) => g.id === baseIngredientId)?.grams ?? 0;
  if (baseGrams <= 0) return { ok: false, error: "El ingrediente base debe tener un peso mayor que cero." };

  const rows: BakersPercentageRow[] = grams.map((g) => ({ id: g.id, name: g.name, grams: g.grams, percent: (g.grams / baseGrams) * 100 }));
  const totalGrams = grams.reduce((sum, g) => sum + g.grams, 0);

  return { ok: true, baseIngredientId, totalGrams, rows };
}

/** Recalculates every ingredient's weight from baker's percentages for a target TOTAL dough weight — the inverse of `calculateBakersPercentages`. */
export function recalculateForTotalWeight(rows: BakersPercentageRow[], targetTotalGrams: number): { ok: boolean; error?: string; rows?: BakersPercentageRow[] } {
  if (!Number.isFinite(targetTotalGrams) || targetTotalGrams <= 0) return { ok: false, error: "El peso total objetivo debe ser mayor que cero." };
  const totalPercent = rows.reduce((sum, r) => sum + r.percent, 0);
  if (totalPercent <= 0) return { ok: false, error: "La suma de los porcentajes debe ser mayor que cero." };

  const gramsPerPercentPoint = targetTotalGrams / totalPercent;
  return { ok: true, rows: rows.map((r) => ({ ...r, grams: r.percent * gramsPerPercentPoint })) };
}
