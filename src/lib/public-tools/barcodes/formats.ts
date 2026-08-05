/**
 * Real format definitions — length/character-set rules only, never
 * decorative bars. Rendering itself is delegated to `jsbarcode` (a focused,
 * browser-compatible, MIT-licensed dependency — see generation.ts), loaded
 * dynamically and only client-side.
 */
export type BarcodeFormat = "CODE128" | "CODE39" | "EAN13" | "EAN8" | "UPC" | "ITF14";

export interface FormatDef {
  id: BarcodeFormat;
  label: string;
  description: string;
  /** Exact required length for fixed-length numeric formats; undefined for variable-length formats. */
  fixedLength?: number;
  hasCheckDigit: boolean;
}

export const BARCODE_FORMATS: FormatDef[] = [
  { id: "CODE128", label: "Code 128", description: "Alfanumérico de longitud variable, alta densidad.", hasCheckDigit: false },
  { id: "CODE39", label: "Code 39", description: "Alfanumérico básico, conjunto de caracteres limitado.", hasCheckDigit: false },
  { id: "EAN13", label: "EAN-13", description: "13 dígitos, estándar de retail internacional.", fixedLength: 13, hasCheckDigit: true },
  { id: "EAN8", label: "EAN-8", description: "8 dígitos, para envases pequeños.", fixedLength: 8, hasCheckDigit: true },
  { id: "UPC", label: "UPC-A", description: "12 dígitos, estándar de retail en Norteamérica.", fixedLength: 12, hasCheckDigit: true },
  { id: "ITF14", label: "ITF-14", description: "14 dígitos, para cajas y embalajes de distribución.", fixedLength: 14, hasCheckDigit: true },
];

// Code 39's real supported character set (per the ISO/IEC 16388 spec) — never claim full Unicode support.
export const CODE39_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%";

export function isCode39Compatible(value: string): boolean {
  return value.length > 0 && [...value.toUpperCase()].every((ch) => CODE39_CHARSET.includes(ch));
}

// Code 128 (via jsbarcode's CODE128 auto-subset) supports the full printable ASCII range (0x00-0x7F in
// full spec, but jsbarcode's default CODE128 subset covers standard printable ASCII 0-127).
export function isCode128Compatible(value: string): boolean {
  return value.length > 0 && [...value].every((ch) => ch.charCodeAt(0) <= 127);
}

export function getFormatDef(format: BarcodeFormat): FormatDef {
  const def = BARCODE_FORMATS.find((f) => f.id === format);
  if (!def) throw new Error(`Formato de código de barras desconocido: ${format}`);
  return def;
}
