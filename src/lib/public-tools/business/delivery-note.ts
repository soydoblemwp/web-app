import { formatMoney } from "./invoice";
import { DOCUMENT_LIMITS } from "@/lib/public-tools/documents/limits";

export type DeliveryNoteMode = "delivery-note" | "packing-slip" | "packing-list";

export const DELIVERY_NOTE_MODE_LABELS: Record<DeliveryNoteMode, string> = {
  "delivery-note": "Nota de entrega",
  "packing-slip": "Packing slip",
  "packing-list": "Lista de empaque",
};

export interface DeliveryNoteLine {
  id: string;
  sku: string;
  description: string;
  quantityOrdered: number;
  quantityShipped: number;
  unit: string;
  weightKg: number | null;
  location: string;
  unitPriceMinor: number;
}

export interface DeliveryNoteData {
  mode: DeliveryNoteMode;
  senderName: string;
  senderAddress: string;
  recipientName: string;
  deliveryAddress: string;
  orderNumber: string;
  shipmentNumber: string;
  date: string;
  carrier: string;
  reference: string;
  packageCount: number;
  notes: string;
  currency: string;
  showPrices: boolean;
  showWeight: boolean;
  lines: DeliveryNoteLine[];
}

export function createDeliveryNoteLine(): DeliveryNoteLine {
  return { id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, sku: "", description: "", quantityOrdered: 1, quantityShipped: 1, unit: "ud.", weightKg: null, location: "", unitPriceMinor: 0 };
}

export function createDefaultDeliveryNote(): DeliveryNoteData {
  return {
    mode: "delivery-note",
    senderName: "",
    senderAddress: "",
    recipientName: "",
    deliveryAddress: "",
    orderNumber: "",
    shipmentNumber: "",
    date: "",
    carrier: "",
    reference: "",
    packageCount: 1,
    notes: "",
    currency: "EUR",
    showPrices: false,
    showWeight: false,
    lines: [createDeliveryNoteLine()],
  };
}

export function quantityPending(line: DeliveryNoteLine): number {
  return Math.max(0, line.quantityOrdered - line.quantityShipped);
}

export function formatDeliveryNoteMoney(minor: number, data: DeliveryNoteData): string {
  return formatMoney(minor, data.currency);
}

export interface DeliveryNoteValidation {
  errors: string[];
  warnings: string[];
}

export function validateDeliveryNote(data: DeliveryNoteData): DeliveryNoteValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!data.senderName.trim()) errors.push("Falta el nombre del remitente.");
  if (!data.recipientName.trim()) errors.push("Falta el nombre del destinatario.");
  if (data.lines.length === 0) errors.push("El documento no tiene ninguna línea.");
  if (data.lines.length > DOCUMENT_LIMITS.businessDocument.maxLines) errors.push(`Demasiadas líneas (máximo ${DOCUMENT_LIMITS.businessDocument.maxLines}).`);
  for (const line of data.lines) {
    if (line.quantityOrdered < 0 || line.quantityShipped < 0) errors.push("Una cantidad no puede ser negativa.");
    if (line.quantityShipped > line.quantityOrdered) warnings.push(`Se envía más cantidad de la solicitada para "${line.description || line.sku || "una línea"}".`);
  }
  if (data.packageCount < 1) warnings.push("El número de paquetes es menor que 1.");
  return { errors, warnings };
}
