/**
 * Recipe-cost core (spec section 21). Every price is a value the visitor
 * types in — never a grocery-price lookup, never a nutrition database (spec:
 * "no utilices precios de supermercado... no descargues ingredientes ni
 * bases de datos nutricionales"). Mass and volume never convert into each
 * other without an explicit density, reusing the same `convertRecipeUnit`
 * core the recipe scaler uses — never a second unit-conversion
 * implementation.
 */
import { convertRecipeUnit } from "./recipe-units";

export interface CostIngredient {
  id: string;
  name: string;
  packagePriceMinor: number;
  packageSize: number;
  packageUnitId: string;
  usedQuantity: number;
  usedUnitId: string;
  usableYieldPercent: number; // 0..100, e.g. 90 means 10% is trimmed/wasted
  densityGramsPerMl?: number;
}

export function createCostIngredient(): CostIngredient {
  return { id: `cost-ing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: "", packagePriceMinor: 0, packageSize: 1, packageUnitId: "g", usedQuantity: 0, usedUnitId: "g", usableYieldPercent: 100 };
}

export interface CostIngredientResult {
  id: string;
  name: string;
  usedCostMinor: number;
  wastedCostMinor: number;
  percentOfBatchCost: number;
}

export interface RecipeCostInput {
  ingredients: CostIngredient[];
  servings: number;
  additionalDirectCostsMinor: number; // packaging, labor entered manually, energy, indirect costs — all pre-summed by the caller or combined here
  targetSellingPriceMinor?: number; // optional — when provided, computes profit per portion
  targetMarginPercent?: number; // optional — when provided (and no explicit selling price), suggests a price
}

export interface RecipeCostResult {
  ok: boolean;
  error?: string;
  perIngredient?: CostIngredientResult[];
  totalIngredientCostMinor?: number;
  totalWastedCostMinor?: number;
  totalBatchCostMinor?: number; // ingredients + additional direct costs
  costPerServingMinor?: number;
  mostExpensiveIngredientId?: string;
  suggestedPriceMinor?: number;
  profitPerServingMinor?: number;
}

export function calculateRecipeCost(input: RecipeCostInput): RecipeCostResult {
  if (input.ingredients.length === 0) return { ok: false, error: "Añade al menos un ingrediente." };
  if (!Number.isFinite(input.servings) || input.servings <= 0) return { ok: false, error: "Las porciones deben ser mayores que cero." };
  if (!Number.isFinite(input.additionalDirectCostsMinor) || input.additionalDirectCostsMinor < 0) return { ok: false, error: "Los costes directos adicionales no pueden ser negativos." };

  const perIngredient: (CostIngredientResult & { _usedCostRaw: number })[] = [];
  let totalIngredientCostMinor = 0;
  let totalWastedCostMinor = 0;

  for (const ing of input.ingredients) {
    if (ing.packagePriceMinor < 0 || ing.packageSize <= 0) return { ok: false, error: `El paquete de "${ing.name || "un ingrediente"}" necesita un precio no negativo y un tamaño mayor que cero.` };
    if (ing.usedQuantity < 0) return { ok: false, error: `La cantidad usada de "${ing.name || "un ingrediente"}" no puede ser negativa.` };
    const yieldPercent = ing.usableYieldPercent > 0 ? ing.usableYieldPercent : 100;
    if (yieldPercent > 100) return { ok: false, error: `El rendimiento utilizable de "${ing.name || "un ingrediente"}" no puede superar el 100%.` };

    const converted = convertRecipeUnit(ing.usedQuantity, ing.usedUnitId, ing.packageUnitId, ing.densityGramsPerMl);
    if (!converted.ok || converted.value === undefined) return { ok: false, error: `No se pudo convertir la cantidad usada de "${ing.name || "un ingrediente"}" a la unidad del paquete: ${converted.error}` };

    const pricePerPackageUnit = ing.packagePriceMinor / ing.packageSize;
    const rawUsedCost = converted.value * pricePerPackageUnit;
    const usedCostMinor = rawUsedCost / (yieldPercent / 100);
    const wastedCostMinor = usedCostMinor - rawUsedCost;

    totalIngredientCostMinor += usedCostMinor;
    totalWastedCostMinor += wastedCostMinor;
    perIngredient.push({ id: ing.id, name: ing.name, usedCostMinor, wastedCostMinor, percentOfBatchCost: 0, _usedCostRaw: usedCostMinor });
  }

  const totalBatchCostMinor = totalIngredientCostMinor + input.additionalDirectCostsMinor;
  const costPerServingMinor = totalBatchCostMinor / input.servings;

  const finalPerIngredient: CostIngredientResult[] = perIngredient.map((p) => ({
    id: p.id,
    name: p.name,
    usedCostMinor: p.usedCostMinor,
    wastedCostMinor: p.wastedCostMinor,
    percentOfBatchCost: totalBatchCostMinor > 0 ? (p._usedCostRaw / totalBatchCostMinor) * 100 : 0,
  }));

  const mostExpensive = finalPerIngredient.reduce((max, cur) => (cur.usedCostMinor > (max?.usedCostMinor ?? -Infinity) ? cur : max), undefined as CostIngredientResult | undefined);

  let suggestedPriceMinor: number | undefined;
  let profitPerServingMinor: number | undefined;
  if (input.targetSellingPriceMinor !== undefined) {
    profitPerServingMinor = input.targetSellingPriceMinor - costPerServingMinor;
  } else if (input.targetMarginPercent !== undefined && input.targetMarginPercent < 100) {
    // price = cost / (1 - margin), the transparent inversion of the margin formula (never markup confused with margin).
    suggestedPriceMinor = costPerServingMinor / (1 - input.targetMarginPercent / 100);
    profitPerServingMinor = suggestedPriceMinor - costPerServingMinor;
  }

  return {
    ok: true,
    perIngredient: finalPerIngredient,
    totalIngredientCostMinor,
    totalWastedCostMinor,
    totalBatchCostMinor,
    costPerServingMinor,
    mostExpensiveIngredientId: mostExpensive?.id,
    suggestedPriceMinor,
    profitPerServingMinor,
  };
}
