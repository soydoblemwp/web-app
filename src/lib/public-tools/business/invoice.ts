/**
 * Invoice/estimate math core. Money is always represented as an integer
 * number of minor currency units (cents) — never a raw JS float — and
 * quantities are scaled to a fixed 4-decimal integer before multiplying,
 * so every multiplication is an exact integer operation. Rounding happens
 * at exactly one well-defined point per computed amount (a single
 * `Math.round` after dividing back down), never accumulated across steps
 * (spec section 8: "los cálculos deben utilizar una estrategia decimal
 * segura... no utilices aritmética flotante ingenua para moneda").
 */

const QUANTITY_SCALE = 10_000;

export type DocumentKind = "FACTURA" | "PRESUPUESTO";

export interface InvoiceLineInput {
  id: string;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  discountPercent: number;
  taxPercent: number;
}

export interface InvoiceLineComputed extends InvoiceLineInput {
  baseAmountMinor: number;
  discountAmountMinor: number;
  netAmountMinor: number;
  taxAmountMinor: number;
  totalMinor: number;
}

export interface InvoiceTotals {
  lines: InvoiceLineComputed[];
  subtotalMinor: number;
  totalTaxMinor: number;
  globalDiscountMinor: number;
  shippingMinor: number;
  grandTotalMinor: number;
  paidMinor: number;
  balanceDueMinor: number;
}

export interface InvoiceComputeInput {
  lines: InvoiceLineInput[];
  globalDiscountPercent: number;
  shippingMinor: number;
  paidMinor: number;
}

function roundToInt(value: number): number {
  return Math.round(value);
}

/** Scales a quantity to a 4-decimal-place integer so it can be multiplied against integer minor units without float drift (e.g. 2.5 -> 25000). */
function scaleQuantity(quantity: number): number {
  return roundToInt(quantity * QUANTITY_SCALE);
}

export function computeLine(line: InvoiceLineInput): InvoiceLineComputed {
  const scaledQty = scaleQuantity(line.quantity);
  const baseAmountMinor = roundToInt((line.unitPriceMinor * scaledQty) / QUANTITY_SCALE);
  const discountAmountMinor = roundToInt((baseAmountMinor * line.discountPercent) / 100);
  const netAmountMinor = baseAmountMinor - discountAmountMinor;
  const taxAmountMinor = roundToInt((netAmountMinor * line.taxPercent) / 100);
  const totalMinor = netAmountMinor + taxAmountMinor;
  return { ...line, baseAmountMinor, discountAmountMinor, netAmountMinor, taxAmountMinor, totalMinor };
}

export function computeInvoiceTotals(input: InvoiceComputeInput): InvoiceTotals {
  const lines = input.lines.map(computeLine);
  const subtotalMinor = lines.reduce((sum, l) => sum + l.netAmountMinor, 0);
  const totalTaxMinor = lines.reduce((sum, l) => sum + l.taxAmountMinor, 0);
  const globalDiscountMinor = roundToInt((subtotalMinor * input.globalDiscountPercent) / 100);
  const grandTotalMinor = subtotalMinor - globalDiscountMinor + totalTaxMinor + input.shippingMinor;
  const balanceDueMinor = grandTotalMinor - input.paidMinor;

  return {
    lines,
    subtotalMinor,
    totalTaxMinor,
    globalDiscountMinor,
    shippingMinor: input.shippingMinor,
    grandTotalMinor,
    paidMinor: input.paidMinor,
    balanceDueMinor,
  };
}

/** Resolves how many minor units make up one major unit for a given ISO 4217 currency code (2 for most, 0 for JPY, 3 for KWD, etc.) via the platform's own currency formatting data — never a hand-maintained table that can drift out of date. */
export function minorUnitDigitsForCurrency(currencyCode: string): number {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

export function minorToMajor(minor: number, currencyCode: string): number {
  const digits = minorUnitDigitsForCurrency(currencyCode);
  return minor / 10 ** digits;
}

export function majorToMinor(major: number, currencyCode: string): number {
  const digits = minorUnitDigitsForCurrency(currencyCode);
  return roundToInt(major * 10 ** digits);
}

export function formatMoney(minor: number, currencyCode: string, locale = "es-ES"): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: currencyCode }).format(minorToMajor(minor, currencyCode));
  } catch {
    return `${minorToMajor(minor, currencyCode).toFixed(2)} ${currencyCode}`;
  }
}

export const COMMON_CURRENCIES = ["EUR", "USD", "GBP", "MXN", "ARS", "COP", "CLP", "PEN", "BRL", "JPY", "CAD", "AUD", "CHF"] as const;
