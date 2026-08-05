import { parseCsv, detectDelimiter } from "@/lib/performance/csv";
import type { BarcodeFormat } from "@/lib/public-tools/barcodes/formats";
import { DOCUMENT_LIMITS } from "@/lib/public-tools/documents/limits";

/**
 * Generic organization/inventory labels only — never official carrier
 * (USPS/UPS/FedEx/DHL), airline, customs, or regulated-product labels
 * (spec section 28). QR and barcode rendering reuse the exact existing
 * cores (`qrcode` package the QR tool already uses ad hoc, and
 * `barcodes/generation.ts` from Fase 46) rather than a third implementation.
 */
export interface LabelItem {
  id: string;
  text: string;
  price: string;
  sku: string;
  description: string;
  qrValue: string;
  barcodeValue: string;
  barcodeFormat: BarcodeFormat | "";
}

export type LabelSheetSize = "A4" | "LETTER";

export interface LabelsData {
  items: LabelItem[];
  widthMm: number;
  heightMm: number;
  sheetSize: LabelSheetSize;
  marginMm: number;
  gapMm: number;
  cornerRadiusMm: number;
  showBorder: boolean;
  fontSizePt: number;
  sequentialNumbering: boolean;
  sequenceStart: number;
}

export function createLabelItem(): LabelItem {
  return { id: `label-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text: "", price: "", sku: "", description: "", qrValue: "", barcodeValue: "", barcodeFormat: "" };
}

export function createDefaultLabelsData(): LabelsData {
  return {
    items: [createLabelItem()],
    widthMm: 63.5,
    heightMm: 38.1, // a common generic address-label size — a genuine, widely-used dimension, not tied to a specific brand
    sheetSize: "LETTER",
    marginMm: 8,
    gapMm: 2.5,
    cornerRadiusMm: 1,
    showBorder: true,
    fontSizePt: 9,
    sequentialNumbering: false,
    sequenceStart: 1,
  };
}

export interface CsvImportResult {
  ok: boolean;
  error?: string;
  headers?: string[];
  rows?: string[][];
}

/** Reuses the project's existing safe CSV parser (`lib/performance/csv.ts`) rather than a third parser implementation, and enforces label-specific row/column/cell limits on top of it. */
export function parseLabelsCsv(text: string): CsvImportResult {
  const delimiter = detectDelimiter(text);
  const { headers, rows } = parseCsv(text, delimiter);
  if (headers.length > DOCUMENT_LIMITS.labels.maxCsvColumns) {
    return { ok: false, error: `El CSV tiene demasiadas columnas (máximo ${DOCUMENT_LIMITS.labels.maxCsvColumns}).` };
  }
  if (rows.length > DOCUMENT_LIMITS.labels.maxCsvRows) {
    return { ok: false, error: `El CSV tiene demasiadas filas (máximo ${DOCUMENT_LIMITS.labels.maxCsvRows}).` };
  }
  for (const row of rows) {
    for (const cell of row) {
      if (cell.length > DOCUMENT_LIMITS.labels.maxCsvCellChars) {
        return { ok: false, error: `Una celda del CSV supera el límite de ${DOCUMENT_LIMITS.labels.maxCsvCellChars} caracteres.` };
      }
    }
  }
  return { ok: true, headers, rows };
}

export interface CsvColumnMapping {
  text?: string;
  price?: string;
  sku?: string;
  description?: string;
}

/** Builds label items from parsed CSV rows given a header→field mapping — every cell becomes plain drawn text (via pdf-lib/canvas), never HTML/markup, so CSV-formula-looking content (e.g. "=SUM(...)") is inert by construction. */
export function csvRowsToLabelItems(headers: string[], rows: string[][], mapping: CsvColumnMapping): LabelItem[] {
  const indexOf = (col?: string) => (col ? headers.indexOf(col) : -1);
  const textIdx = indexOf(mapping.text);
  const priceIdx = indexOf(mapping.price);
  const skuIdx = indexOf(mapping.sku);
  const descIdx = indexOf(mapping.description);
  return rows.map((row) => ({
    ...createLabelItem(),
    text: textIdx >= 0 ? (row[textIdx] ?? "") : "",
    price: priceIdx >= 0 ? (row[priceIdx] ?? "") : "",
    sku: skuIdx >= 0 ? (row[skuIdx] ?? "") : "",
    description: descIdx >= 0 ? (row[descIdx] ?? "") : "",
  }));
}

export interface LabelSheetLayout {
  columns: number;
  rows: number;
  labelsPerSheet: number;
}

export function computeLabelSheetLayout(data: LabelsData): LabelSheetLayout {
  const sheetWidthMm = data.sheetSize === "A4" ? 210 : 215.9;
  const sheetHeightMm = data.sheetSize === "A4" ? 297 : 279.4;
  const usableWidth = sheetWidthMm - data.marginMm * 2;
  const usableHeight = sheetHeightMm - data.marginMm * 2;
  const columns = Math.max(1, Math.floor((usableWidth + data.gapMm) / (data.widthMm + data.gapMm)));
  const rows = Math.max(1, Math.floor((usableHeight + data.gapMm) / (data.heightMm + data.gapMm)));
  return { columns, rows, labelsPerSheet: columns * rows };
}

export interface LabelsValidation {
  errors: string[];
  warnings: string[];
}

export function validateLabelsData(data: LabelsData): LabelsValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (data.items.length === 0) errors.push("No hay ninguna etiqueta para generar.");
  if (data.items.length > DOCUMENT_LIMITS.labels.maxLabels) errors.push(`Demasiadas etiquetas (máximo ${DOCUMENT_LIMITS.labels.maxLabels}).`);
  if (data.widthMm < 10 || data.heightMm < 10) errors.push("El tamaño de etiqueta es demasiado pequeño.");
  const layout = computeLabelSheetLayout(data);
  if (layout.labelsPerSheet === 0) errors.push("El tamaño de etiqueta no cabe en la hoja con los márgenes actuales.");
  return { errors, warnings };
}
