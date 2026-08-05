import { computeInvoiceTotals, formatMoney, type InvoiceLineInput, type InvoiceTotals } from "./invoice";
import { DOCUMENT_LIMITS } from "@/lib/public-tools/documents/limits";

export interface PurchaseOrderParty {
  name: string;
  address: string;
  contact: string;
}

export interface PurchaseOrderLine extends InvoiceLineInput {
  sku: string;
  unit: string;
}

export interface PurchaseOrderData {
  buyer: PurchaseOrderParty;
  supplier: PurchaseOrderParty;
  orderNumber: string;
  date: string;
  requiredDate: string;
  reference: string;
  currency: string;
  terms: string;
  billingAddress: string;
  shippingAddress: string;
  responsible: string;
  notes: string;
  lines: PurchaseOrderLine[];
  shippingMinor: number;
}

export function createPurchaseOrderLine(): PurchaseOrderLine {
  return { id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, sku: "", description: "", quantity: 1, unitPriceMinor: 0, discountPercent: 0, taxPercent: 0, unit: "ud." };
}

export function createDefaultPurchaseOrder(): PurchaseOrderData {
  return {
    buyer: { name: "", address: "", contact: "" },
    supplier: { name: "", address: "", contact: "" },
    orderNumber: "",
    date: "",
    requiredDate: "",
    reference: "",
    currency: "EUR",
    terms: "",
    billingAddress: "",
    shippingAddress: "",
    responsible: "",
    notes: "",
    lines: [createPurchaseOrderLine()],
    shippingMinor: 0,
  };
}

export function computePurchaseOrderTotals(data: PurchaseOrderData): InvoiceTotals {
  return computeInvoiceTotals({ lines: data.lines, globalDiscountPercent: 0, shippingMinor: data.shippingMinor, paidMinor: 0 });
}

export function formatPurchaseOrderMoney(minor: number, data: PurchaseOrderData): string {
  return formatMoney(minor, data.currency);
}

export interface PurchaseOrderValidation {
  errors: string[];
  warnings: string[];
}

export function validatePurchaseOrder(data: PurchaseOrderData): PurchaseOrderValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!data.buyer.name.trim()) errors.push("Falta el nombre del comprador.");
  if (!data.supplier.name.trim()) errors.push("Falta el nombre del proveedor.");
  if (data.lines.length === 0) errors.push("La orden no tiene ninguna línea.");
  if (data.lines.length > DOCUMENT_LIMITS.businessDocument.maxLines) errors.push(`Demasiadas líneas (máximo ${DOCUMENT_LIMITS.businessDocument.maxLines}).`);
  for (const line of data.lines) {
    if (line.quantity <= 0) errors.push("Una cantidad debe ser mayor que cero.");
    if (line.unitPriceMinor < 0) errors.push("Un precio no puede ser negativo.");
  }
  if (!data.billingAddress && !data.shippingAddress) warnings.push("No se indicó dirección de facturación ni de entrega.");
  return { errors, warnings };
}
