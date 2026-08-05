/**
 * Break-even math core — three modes sharing the same contribution-margin
 * primitive (spec section 10-11). Money is always an integer number of
 * minor currency units in and out (never a raw float), matching the
 * convention already established by `business/invoice.ts`. A negative or
 * zero contribution margin never produces a finite break-even point — that
 * distinction (mathematically impossible vs. a real number) is returned
 * explicitly so the UI never silently shows a fake result (spec section 11:
 * "no muestres un punto de equilibrio finito cuando la contribución sea
 * cero o negativa").
 */

export interface ContributionMargin {
  perUnitMinor: number;
  ratio: number; // unrounded, 0..1 range for a healthy product (can exceed if variable cost is negative, which we reject)
}

export function computeContributionMargin(priceMinor: number, variableCostMinor: number): ContributionMargin {
  const perUnitMinor = priceMinor - variableCostMinor;
  const ratio = priceMinor === 0 ? 0 : perUnitMinor / priceMinor;
  return { perUnitMinor, ratio };
}

export interface SingleProductInput {
  fixedCostsMinor: number;
  priceMinor: number;
  variableCostMinor: number;
  expectedUnits: number;
}

export interface SingleProductResult {
  ok: boolean;
  error?: string;
  contributionMarginMinor?: number;
  contributionMarginRatio?: number;
  breakEvenUnits?: number;
  breakEvenRevenueMinor?: number;
  profitAtExpectedMinor?: number;
  marginOfSafetyUnits?: number;
  marginOfSafetyPercent?: number;
  chartPoints?: { units: number; costMinor: number; revenueMinor: number }[];
}

function validateBase(fixedCostsMinor: number, priceMinor: number, variableCostMinor: number): string | null {
  if (!Number.isFinite(fixedCostsMinor) || !Number.isFinite(priceMinor) || !Number.isFinite(variableCostMinor)) return "Introduce solo números finitos.";
  if (fixedCostsMinor < 0) return "Los costes fijos no pueden ser negativos.";
  if (priceMinor < 0) return "El precio de venta no puede ser negativo.";
  if (variableCostMinor < 0) return "El coste variable no puede ser negativo.";
  return null;
}

export function calculateSingleProduct(input: SingleProductInput): SingleProductResult {
  const baseError = validateBase(input.fixedCostsMinor, input.priceMinor, input.variableCostMinor);
  if (baseError) return { ok: false, error: baseError };
  if (!Number.isFinite(input.expectedUnits) || input.expectedUnits < 0) return { ok: false, error: "Las unidades previstas no pueden ser negativas." };

  const { perUnitMinor, ratio } = computeContributionMargin(input.priceMinor, input.variableCostMinor);

  if (perUnitMinor <= 0) {
    return {
      ok: false,
      error:
        perUnitMinor === 0
          ? "El precio de venta es igual al coste variable: el margen de contribución es cero y no existe un punto de equilibrio finito."
          : "El precio de venta es menor que el coste variable: cada unidad vendida genera más pérdida, no existe un punto de equilibrio finito.",
      contributionMarginMinor: perUnitMinor,
      contributionMarginRatio: ratio,
    };
  }

  const breakEvenUnits = input.fixedCostsMinor / perUnitMinor;
  const breakEvenRevenueMinor = breakEvenUnits * input.priceMinor;
  const profitAtExpectedMinor = input.expectedUnits * perUnitMinor - input.fixedCostsMinor;
  const marginOfSafetyUnits = input.expectedUnits - breakEvenUnits;
  const marginOfSafetyPercent = input.expectedUnits > 0 ? (marginOfSafetyUnits / input.expectedUnits) * 100 : 0;

  const maxUnitsForChart = Math.max(breakEvenUnits * 2, input.expectedUnits, 1);
  const chartPoints = Array.from({ length: 6 }, (_, i) => {
    const units = (maxUnitsForChart / 5) * i;
    return { units, costMinor: input.fixedCostsMinor + units * input.variableCostMinor, revenueMinor: units * input.priceMinor };
  });

  return {
    ok: true,
    contributionMarginMinor: perUnitMinor,
    contributionMarginRatio: ratio,
    breakEvenUnits,
    breakEvenRevenueMinor,
    profitAtExpectedMinor,
    marginOfSafetyUnits,
    marginOfSafetyPercent,
    chartPoints,
  };
}

export interface ProfitTargetInput extends SingleProductInput {
  profitTargetMinor: number;
}

export interface ProfitTargetResult {
  ok: boolean;
  error?: string;
  unitsNeeded?: number;
  revenueNeeded?: number;
  differenceFromBreakEvenUnits?: number;
}

export function calculateProfitTarget(input: ProfitTargetInput): ProfitTargetResult {
  const base = calculateSingleProduct(input);
  if (!base.ok || base.contributionMarginMinor === undefined || base.contributionMarginMinor <= 0) {
    return { ok: false, error: base.error ?? "No se puede calcular un objetivo de beneficio sin un margen de contribución positivo." };
  }
  if (!Number.isFinite(input.profitTargetMinor)) return { ok: false, error: "El beneficio objetivo no es un número válido." };

  const unitsNeeded = (input.fixedCostsMinor + input.profitTargetMinor) / base.contributionMarginMinor;
  if (unitsNeeded < 0) return { ok: false, error: "Un beneficio objetivo negativo mayor que las pérdidas cubiertas por los costes fijos no requiere unidades adicionales; ajusta el objetivo." };

  const revenueNeeded = unitsNeeded * input.priceMinor;
  const differenceFromBreakEvenUnits = unitsNeeded - (base.breakEvenUnits ?? 0);

  return { ok: true, unitsNeeded, revenueNeeded, differenceFromBreakEvenUnits };
}

export interface MixProductInput {
  id: string;
  name: string;
  priceMinor: number;
  variableCostMinor: number;
  proportionPercent: number; // expected share of total units sold, 0..100
}

export interface ProductMixInput {
  fixedCostsMinor: number;
  products: MixProductInput[];
}

export interface MixProductResult {
  id: string;
  name: string;
  contributionMarginMinor: number;
  breakEvenUnits: number;
}

export interface ProductMixResult {
  ok: boolean;
  error?: string;
  warning?: string;
  weightedContributionMarginMinor?: number;
  totalBreakEvenUnits?: number;
  totalBreakEvenRevenueMinor?: number;
  perProduct?: MixProductResult[];
}

const PROPORTION_TOLERANCE = 0.5; // percentage points

export function calculateProductMix(input: ProductMixInput): ProductMixResult {
  if (input.products.length === 0) return { ok: false, error: "Añade al menos un producto a la mezcla." };
  if (input.fixedCostsMinor < 0) return { ok: false, error: "Los costes fijos no pueden ser negativos." };

  for (const p of input.products) {
    if (p.priceMinor < 0 || p.variableCostMinor < 0) return { ok: false, error: `El producto "${p.name || "sin nombre"}" tiene un precio o coste negativo.` };
    if (p.proportionPercent < 0) return { ok: false, error: `El producto "${p.name || "sin nombre"}" tiene una proporción negativa.` };
  }

  const totalProportion = input.products.reduce((sum, p) => sum + p.proportionPercent, 0);
  if (totalProportion <= 0) return { ok: false, error: "La suma de las proporciones debe ser mayor que cero." };

  // Normalizes instead of hard-rejecting a mix that doesn't sum to exactly 100% (real user input rarely
  // does) — but only silently by a small tolerance; a mix far from 100% gets an explicit warning rather
  // than being normalized without telling the visitor.
  const normalizedProducts = input.products.map((p) => ({ ...p, weight: p.proportionPercent / totalProportion }));
  const warning = Math.abs(totalProportion - 100) > PROPORTION_TOLERANCE ? `Las proporciones suman ${totalProportion.toFixed(1)}% en vez de 100%; se han normalizado proporcionalmente para el cálculo.` : undefined;

  const weightedContributionMarginMinor = normalizedProducts.reduce((sum, p) => sum + p.weight * (p.priceMinor - p.variableCostMinor), 0);

  if (weightedContributionMarginMinor <= 0) {
    return {
      ok: false,
      error: "El margen de contribución ponderado de la mezcla es cero o negativo: no existe un punto de equilibrio finito con esta combinación de precios, costes y proporciones.",
      weightedContributionMarginMinor,
    };
  }

  const totalBreakEvenUnits = input.fixedCostsMinor / weightedContributionMarginMinor;
  const perProduct: MixProductResult[] = normalizedProducts.map((p) => ({
    id: p.id,
    name: p.name,
    contributionMarginMinor: p.priceMinor - p.variableCostMinor,
    breakEvenUnits: totalBreakEvenUnits * p.weight,
  }));
  const totalBreakEvenRevenueMinor = perProduct.reduce((sum, p, i) => sum + p.breakEvenUnits * normalizedProducts[i].priceMinor, 0);

  return { ok: true, warning, weightedContributionMarginMinor, totalBreakEvenUnits, totalBreakEvenRevenueMinor, perProduct };
}
