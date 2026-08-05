/**
 * Per-product profitability core (spec section 14). Every fee (platform
 * commission, processing, shipping, ads) is a value the visitor types in —
 * never a baked-in marketplace rate (spec: "no incluya automáticamente
 * tarifas de Amazon, Etsy, eBay, Shopify, TikTok Shop"). Money is integer
 * minor units throughout.
 */

export interface ProductProfitabilityInput {
  id: string;
  name: string;
  priceMinor: number;
  costMinor: number;
  packagingMinor: number;
  shippingMinor: number;
  processingFeeMinor: number;
  commissionFixedMinor: number;
  commissionPercent: number;
  adCostPerSaleMinor: number;
  returnRatePercent: number; // expected % of sales returned/lost, 0..100
  nonRecoverableTaxMinor: number;
  unitsSoldPerMonth: number;
  allocatedFixedCostsMinor: number; // monthly, optional (0 if not used)
  targetMarginPercent: number; // used to compute the max allowed acquisition cost
}

export interface ProductProfitabilityResult {
  ok: boolean;
  error?: string;
  id?: string;
  name?: string;
  revenuePerUnitMinor?: number;
  variableCostsMinor?: number; // packaging + shipping + processing
  commissionMinor?: number;
  returnLossMinor?: number; // expected loss per unit from returns
  profitPerUnitMinor?: number;
  netMarginPercent?: number;
  roiOnCostPercent?: number;
  monthlyProfitMinor?: number;
  unitsToCoverFixedCosts?: number;
  breakEvenPriceMinor?: number;
  maxAcquisitionCostForTargetMarginMinor?: number;
}

function validateInput(input: ProductProfitabilityInput): string | null {
  const numericFields: [string, number][] = [
    ["El precio", input.priceMinor],
    ["El coste del producto", input.costMinor],
    ["El embalaje", input.packagingMinor],
    ["El envío", input.shippingMinor],
    ["El coste de procesamiento", input.processingFeeMinor],
    ["La comisión fija", input.commissionFixedMinor],
    ["La comisión porcentual", input.commissionPercent],
    ["El coste publicitario", input.adCostPerSaleMinor],
    ["La tasa de devolución", input.returnRatePercent],
    ["El impuesto no recuperable", input.nonRecoverableTaxMinor],
    ["Las unidades vendidas", input.unitsSoldPerMonth],
    ["Los costes fijos asignados", input.allocatedFixedCostsMinor],
  ];
  for (const [label, value] of numericFields) {
    if (!Number.isFinite(value)) return `${label} debe ser un número finito.`;
    if (value < 0) return `${label} no puede ser negativo.`;
  }
  if (input.returnRatePercent > 100) return "La tasa de devolución no puede superar el 100%.";
  if (input.commissionPercent > 100) return "La comisión porcentual no puede superar el 100%.";
  return null;
}

export function calculateProductProfitability(input: ProductProfitabilityInput): ProductProfitabilityResult {
  const error = validateInput(input);
  if (error) return { ok: false, error };

  const commissionMinor = Math.round(input.priceMinor * (input.commissionPercent / 100)) + input.commissionFixedMinor;
  const variableCostsMinor = input.costMinor + input.packagingMinor + input.shippingMinor + input.processingFeeMinor + input.nonRecoverableTaxMinor;
  const revenuePerUnitMinor = input.priceMinor;
  const grossProfitBeforeReturns = revenuePerUnitMinor - variableCostsMinor - commissionMinor - input.adCostPerSaleMinor;
  const returnLossMinor = grossProfitBeforeReturns * (input.returnRatePercent / 100);
  const profitPerUnitMinor = grossProfitBeforeReturns - returnLossMinor;
  const netMarginPercent = revenuePerUnitMinor > 0 ? (profitPerUnitMinor / revenuePerUnitMinor) * 100 : 0;
  const totalAcquisitionCost = variableCostsMinor + commissionMinor + input.adCostPerSaleMinor;
  const roiOnCostPercent = totalAcquisitionCost > 0 ? (profitPerUnitMinor / totalAcquisitionCost) * 100 : 0;
  const monthlyProfitMinor = profitPerUnitMinor * input.unitsSoldPerMonth - input.allocatedFixedCostsMinor;

  const unitsToCoverFixedCosts = profitPerUnitMinor > 0 && input.allocatedFixedCostsMinor > 0 ? input.allocatedFixedCostsMinor / profitPerUnitMinor : profitPerUnitMinor > 0 ? 0 : undefined;

  // Price at which profitPerUnit == 0, holding all other per-unit costs and the commission rate fixed
  // (commission has both a fixed and percent-of-price component, so this solves the linear equation
  // for price rather than reusing profitPerUnitMinor directly).
  const returnFactor = 1 - input.returnRatePercent / 100;
  const denominatorForBreakEvenPrice = returnFactor * (1 - input.commissionPercent / 100);
  const breakEvenPriceMinor =
    denominatorForBreakEvenPrice > 0
      ? (returnFactor * (input.costMinor + input.packagingMinor + input.shippingMinor + input.processingFeeMinor + input.nonRecoverableTaxMinor + input.adCostPerSaleMinor) + returnFactor * input.commissionFixedMinor) /
        denominatorForBreakEvenPrice
      : undefined;

  // Highest per-unit acquisition (product) cost that still allows hitting the target margin at the
  // current price, all other costs held fixed — a transparent inversion of the margin formula, never a
  // hidden "recommended" number.
  const targetProfitPerUnit = revenuePerUnitMinor * (input.targetMarginPercent / 100);
  const otherCostsMinor = input.packagingMinor + input.shippingMinor + input.processingFeeMinor + input.nonRecoverableTaxMinor + commissionMinor + input.adCostPerSaleMinor;
  const maxAcquisitionCostForTargetMarginMinor = returnFactor > 0 ? revenuePerUnitMinor - otherCostsMinor - targetProfitPerUnit / returnFactor : undefined;

  return {
    ok: true,
    id: input.id,
    name: input.name,
    revenuePerUnitMinor,
    variableCostsMinor,
    commissionMinor,
    returnLossMinor,
    profitPerUnitMinor,
    netMarginPercent,
    roiOnCostPercent,
    monthlyProfitMinor,
    unitsToCoverFixedCosts,
    breakEvenPriceMinor,
    maxAcquisitionCostForTargetMarginMinor,
  };
}

export function sortByProfit(results: ProductProfitabilityResult[]): ProductProfitabilityResult[] {
  return [...results].sort((a, b) => (b.profitPerUnitMinor ?? -Infinity) - (a.profitPerUnitMinor ?? -Infinity));
}

export function sortByMargin(results: ProductProfitabilityResult[]): ProductProfitabilityResult[] {
  return [...results].sort((a, b) => (b.netMarginPercent ?? -Infinity) - (a.netMarginPercent ?? -Infinity));
}

export function findLossMakingProducts(results: ProductProfitabilityResult[]): ProductProfitabilityResult[] {
  return results.filter((r) => (r.profitPerUnitMinor ?? 0) < 0);
}
