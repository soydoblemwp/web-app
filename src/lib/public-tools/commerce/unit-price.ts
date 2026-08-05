/**
 * Unit-price comparator core (spec section 16). Reuses `utilities/units.ts`
 * for its base-unit conversion factors so every product is normalized to
 * the SAME base unit before comparing — never mixes mass and volume without
 * a visitor-provided density (this module has no density bridging at all;
 * it only compares within one dimension at a time, spec: "no conviertas
 * masa a volumen... sin un factor proporcionado por el usuario"). The final
 * price is the real amount paid (after any discount/coupon/tax the visitor
 * already applied), never re-derived from a separate discount calculator.
 */
import { UNIT_CATEGORIES, type UnitCategoryId } from "../utilities/units";

export interface UnitPriceProductInput {
  id: string;
  name: string;
  finalPriceMinor: number; // what was actually paid
  packageQuantity: number; // e.g. 500 (grams), 1 (liter), 12 (count)
  unitId: string; // must belong to `categoryId`
  packagesCount: number; // how many identical packages this price covers
  usablePercent: number; // 0..100, defaults to 100 when not provided
}

export interface UnitPriceInput {
  categoryId: UnitCategoryId | "count";
  products: UnitPriceProductInput[];
  targetQuantity?: number; // in the base unit, for the "savings for a target amount" result
}

export interface UnitPriceProductResult {
  id: string;
  name: string;
  totalBaseQuantity: number;
  totalUsableBaseQuantity: number;
  pricePerBaseUnitMinor: number;
  pricePerUsableBaseUnitMinor: number;
  totalPriceMinor: number;
  rank: number;
  isBestValue: boolean;
  savingsVsBestPerBaseUnitMinor: number;
  savingsForTargetQuantityMinor?: number;
}

export interface UnitPriceResult {
  ok: boolean;
  error?: string;
  baseUnitLabel?: string;
  products?: UnitPriceProductResult[];
}

function toBaseQuantity(categoryId: UnitCategoryId | "count", unitId: string, quantity: number): { ok: boolean; value?: number; error?: string } {
  if (categoryId === "count") {
    if (unitId !== "unit") return { ok: false, error: "Unidad desconocida para la categoría 'cantidad'." };
    return { ok: true, value: quantity };
  }
  const category = UNIT_CATEGORIES.find((c) => c.id === categoryId);
  if (!category) return { ok: false, error: "Categoría de unidad desconocida." };
  if (category.id === "temperatura") return { ok: false, error: "La temperatura no es una unidad de cantidad comparable por precio." };
  const unit = category.units.find((u) => u.id === unitId);
  if (!unit || unit.toBase === null) return { ok: false, error: "Unidad desconocida para esta categoría." };
  return { ok: true, value: quantity * unit.toBase };
}

export function calculateUnitPrices(input: UnitPriceInput): UnitPriceResult {
  if (input.products.length < 2) return { ok: false, error: "Añade al menos 2 productos para comparar." };
  if (input.products.length > 20) return { ok: false, error: "Se admiten como máximo 20 productos." };

  const category = input.categoryId === "count" ? null : UNIT_CATEGORIES.find((c) => c.id === input.categoryId);
  const baseUnitLabel = input.categoryId === "count" ? "unidad" : (category?.baseUnitLabel ?? "unidad");

  const computed: (UnitPriceProductResult & { _sortKey: number })[] = [];
  for (const p of input.products) {
    if (!Number.isFinite(p.finalPriceMinor) || p.finalPriceMinor < 0) return { ok: false, error: `El precio de "${p.name || "un producto"}" no puede ser negativo.` };
    if (!Number.isFinite(p.packageQuantity) || p.packageQuantity <= 0) return { ok: false, error: `La cantidad por paquete de "${p.name || "un producto"}" debe ser mayor que cero.` };
    if (!Number.isFinite(p.packagesCount) || p.packagesCount <= 0) return { ok: false, error: `El número de paquetes de "${p.name || "un producto"}" debe ser mayor que cero.` };
    const usablePercent = p.usablePercent > 0 ? p.usablePercent : 100;
    if (usablePercent > 100) return { ok: false, error: `El porcentaje utilizable de "${p.name || "un producto"}" no puede superar el 100%.` };

    const baseQty = toBaseQuantity(input.categoryId, p.unitId, p.packageQuantity);
    if (!baseQty.ok || baseQty.value === undefined) return { ok: false, error: baseQty.error };

    const totalBaseQuantity = baseQty.value * p.packagesCount;
    const totalUsableBaseQuantity = totalBaseQuantity * (usablePercent / 100);
    if (totalUsableBaseQuantity <= 0) return { ok: false, error: `"${p.name || "Un producto"}" no tiene cantidad utilizable mayor que cero.` };

    computed.push({
      id: p.id,
      name: p.name,
      totalBaseQuantity,
      totalUsableBaseQuantity,
      pricePerBaseUnitMinor: p.finalPriceMinor / totalBaseQuantity,
      pricePerUsableBaseUnitMinor: p.finalPriceMinor / totalUsableBaseQuantity,
      totalPriceMinor: p.finalPriceMinor,
      rank: 0,
      isBestValue: false,
      savingsVsBestPerBaseUnitMinor: 0,
      _sortKey: p.finalPriceMinor / totalUsableBaseQuantity,
    });
  }

  computed.sort((a, b) => a._sortKey - b._sortKey);
  const bestPricePerUnit = computed[0]?.pricePerUsableBaseUnitMinor ?? 0;

  const products: UnitPriceProductResult[] = computed.map((p, i) => ({
    ...p,
    rank: i + 1,
    isBestValue: i === 0,
    savingsVsBestPerBaseUnitMinor: p.pricePerUsableBaseUnitMinor - bestPricePerUnit,
    savingsForTargetQuantityMinor: input.targetQuantity !== undefined && input.targetQuantity > 0 ? (p.pricePerUsableBaseUnitMinor - bestPricePerUnit) * input.targetQuantity : undefined,
  }));

  return { ok: true, baseUnitLabel, products };
}
