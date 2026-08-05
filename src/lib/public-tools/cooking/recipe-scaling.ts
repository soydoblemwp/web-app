/**
 * Recipe scaling core (spec section 20): scale by target servings, a direct
 * multiplier, or pan-size/area. Ingredient quantities are scaled using each
 * ingredient's OWN unit — mass ingredients scale as mass, volume as volume,
 * count-based ingredients (eggs) are scaled but never silently rounded to a
 * whole number by this module (the caller decides how to present a
 * fractional egg, e.g. via `toFriendlyFraction`).
 */
import { convertRecipeUnit } from "./recipe-units";

export interface RecipeIngredient {
  id: string;
  name: string;
  quantity: number;
  unitId: string;
  group: string;
  note: string;
  densityGramsPerMl?: number;
  bakersPercent?: number;
}

export function createRecipeIngredient(): RecipeIngredient {
  return { id: `ing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: "", quantity: 0, unitId: "g", group: "", note: "" };
}

export interface ScaledIngredient extends RecipeIngredient {
  scaledQuantity: number;
}

export function scaleByMultiplier(ingredients: RecipeIngredient[], multiplier: number): { ok: boolean; error?: string; ingredients?: ScaledIngredient[] } {
  if (!Number.isFinite(multiplier) || multiplier <= 0) return { ok: false, error: "El multiplicador debe ser un número mayor que cero." };
  return { ok: true, ingredients: ingredients.map((ing) => ({ ...ing, scaledQuantity: ing.quantity * multiplier })) };
}

export function scaleByServings(ingredients: RecipeIngredient[], originalServings: number, targetServings: number) {
  if (!Number.isFinite(originalServings) || originalServings <= 0) return { ok: false as const, error: "Las porciones originales deben ser mayores que cero." };
  if (!Number.isFinite(targetServings) || targetServings <= 0) return { ok: false as const, error: "Las porciones objetivo deben ser mayores que cero." };
  return scaleByMultiplier(ingredients, targetServings / originalServings);
}

export type PanShape = "circular" | "rectangular" | "square";

export interface PanDimensions {
  shape: PanShape;
  diameter?: number; // circular
  width?: number; // rectangular
  length?: number; // rectangular
  side?: number; // square
}

export function computePanArea(pan: PanDimensions): { ok: boolean; error?: string; area?: number } {
  if (pan.shape === "circular") {
    if (!pan.diameter || pan.diameter <= 0) return { ok: false, error: "El diámetro del molde circular debe ser mayor que cero." };
    const radius = pan.diameter / 2;
    return { ok: true, area: Math.PI * radius * radius };
  }
  if (pan.shape === "rectangular") {
    if (!pan.width || !pan.length || pan.width <= 0 || pan.length <= 0) return { ok: false, error: "El ancho y el largo del molde rectangular deben ser mayores que cero." };
    return { ok: true, area: pan.width * pan.length };
  }
  if (!pan.side || pan.side <= 0) return { ok: false, error: "El lado del molde cuadrado debe ser mayor que cero." };
  return { ok: true, area: pan.side * pan.side };
}

export function scaleByPanSize(ingredients: RecipeIngredient[], originalPan: PanDimensions, targetPan: PanDimensions) {
  const originalArea = computePanArea(originalPan);
  if (!originalArea.ok || !originalArea.area) return { ok: false as const, error: originalArea.error ?? "Molde original inválido." };
  const targetArea = computePanArea(targetPan);
  if (!targetArea.ok || !targetArea.area) return { ok: false as const, error: targetArea.error ?? "Molde objetivo inválido." };
  return { ...scaleByMultiplier(ingredients, targetArea.area / originalArea.area), areaMultiplier: targetArea.area / originalArea.area };
}

/** Converts every ingredient in a scaled list into a single common unit family (grams) where possible, for display — never mixes mass and volume without the ingredient's own density. */
export function normalizeToGramsWherePossible(ingredients: ScaledIngredient[]): (ScaledIngredient & { grams: number | null })[] {
  return ingredients.map((ing) => {
    const result = convertRecipeUnit(ing.scaledQuantity, ing.unitId, "g", ing.densityGramsPerMl);
    return { ...ing, grams: result.ok ? (result.value ?? null) : null };
  });
}
