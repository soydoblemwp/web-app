import { computeInvoiceTotals, formatMoney, type InvoiceLineInput, type InvoiceTotals } from "./invoice";
import { DOCUMENT_LIMITS } from "@/lib/public-tools/documents/limits";

/**
 * A receipt is a record of a payment/delivery the visitor is documenting —
 * never a verified transaction (spec section 19). It deliberately reuses
 * `business/invoice.ts`'s line/money core (the same integer-minor-units,
 * currency-aware calculation already used by the invoice tool) instead of a
 * second parallel money implementation.
 */
export type ReceiptMode = "detailed" | "simple" | "payment" | "donation";

export const RECEIPT_MODE_LABELS: Record<ReceiptMode, string> = {
  detailed: "Recibo detallado",
  simple: "Recibo simple",
  payment: "Recibo de pago",
  donation: "Recibo de donación",
};

export interface ReceiptData {
  issuerName: string;
  issuerContact: string;
  receiverName: string;
  receiverContact: string;
  receiptNumber: string;
  date: string;
  paymentMethod: string;
  reference: string;
  currency: string;
  mode: ReceiptMode;
  lines: InvoiceLineInput[];
  tipMinor: number;
  amountReceivedMinor: number;
  notes: string;
}

export function createReceiptLine(): InvoiceLineInput {
  return { id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, description: "", quantity: 1, unitPriceMinor: 0, discountPercent: 0, taxPercent: 0 };
}

export function createDefaultReceipt(): ReceiptData {
  return {
    issuerName: "",
    issuerContact: "",
    receiverName: "",
    receiverContact: "",
    receiptNumber: "",
    date: "",
    paymentMethod: "",
    reference: "",
    currency: "EUR",
    mode: "simple",
    lines: [createReceiptLine()],
    tipMinor: 0,
    amountReceivedMinor: 0,
    notes: "",
  };
}

export interface ReceiptTotals extends InvoiceTotals {
  changeMinor: number; // negative means the amount received falls short
}

export function computeReceiptTotals(data: ReceiptData): ReceiptTotals {
  const totals = computeInvoiceTotals({ lines: data.lines, globalDiscountPercent: 0, shippingMinor: data.tipMinor, paidMinor: data.amountReceivedMinor });
  return { ...totals, changeMinor: data.amountReceivedMinor - totals.grandTotalMinor };
}

export function formatReceiptMoney(minor: number, data: ReceiptData): string {
  return formatMoney(minor, data.currency);
}

export interface ReceiptValidation {
  errors: string[];
  warnings: string[];
}

export function validateReceipt(data: ReceiptData): ReceiptValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!data.issuerName.trim()) errors.push("Falta el nombre de quien emite el recibo.");
  if (data.lines.length === 0) errors.push("El recibo no tiene ninguna línea.");
  if (data.lines.length > DOCUMENT_LIMITS.businessDocument.maxLines) errors.push(`Demasiadas líneas (máximo ${DOCUMENT_LIMITS.businessDocument.maxLines}).`);
  for (const line of data.lines) {
    if (line.quantity < 0) errors.push("Una cantidad no puede ser negativa.");
    if (line.unitPriceMinor < 0) errors.push("Un precio no puede ser negativo.");
    if (!Number.isFinite(line.quantity) || !Number.isFinite(line.unitPriceMinor)) errors.push("Hay un valor numérico inválido en una línea.");
  }
  if (data.mode === "donation" && data.lines.some((l) => l.taxPercent > 0)) warnings.push("Las donaciones no suelen incluir impuestos; revisa si corresponde.");
  const totals = computeReceiptTotals(data);
  if (data.amountReceivedMinor > 0 && totals.changeMinor < 0) warnings.push("El importe recibido es menor que el total.");
  return { errors, warnings };
}
