import { isValidEmail, isValidUrlOrBareDomain } from "@/lib/public-tools/documents/validation";
import { PAGE_SIZES_PT, clampCustomSizeMm, mmToPoints, type PageSizePt } from "@/lib/public-tools/documents/measurements";

export type BusinessCardSizeId = "us" | "eu" | "custom";
export type BusinessCardTemplateId = "minimal" | "professional" | "corporate" | "creative" | "vertical";

export const BUSINESS_CARD_TEMPLATE_LABELS: Record<BusinessCardTemplateId, string> = {
  minimal: "Minimalista",
  professional: "Profesional",
  corporate: "Corporativa",
  creative: "Creativa",
  vertical: "Vertical",
};

export const BUSINESS_CARD_TEMPLATE_DESCRIPTIONS: Record<BusinessCardTemplateId, string> = {
  minimal: "Fondo blanco, sin barras ni bloques de color — solo el nombre en el color de acento.",
  professional: "Barra vertical de color de acento a la izquierda, contenido alineado con sangría.",
  corporate: "Banda de color a ancho completo en la parte superior con el nombre y el cargo en blanco, estilo membrete.",
  creative: "Distintivo circular con la inicial en una esquina y el nombre situado en el tercio inferior de la tarjeta.",
  vertical: "Orientación de retrato (más alta que ancha) con el contenido centrado horizontalmente.",
};

export interface BusinessCardData {
  name: string;
  jobTitle: string;
  company: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  template: BusinessCardTemplateId;
  size: BusinessCardSizeId;
  customWidthMm: number;
  customHeightMm: number;
  accentColorHex: string;
  showQr: boolean;
  qrValue: string;
  backEnabled: boolean;
  backText: string;
  logoPngBytes: number[] | null;
}

export function createDefaultBusinessCard(): BusinessCardData {
  return {
    name: "",
    jobTitle: "",
    company: "",
    phone: "",
    email: "",
    website: "",
    address: "",
    template: "minimal",
    size: "us",
    customWidthMm: 90,
    customHeightMm: 50,
    accentColorHex: "#2563eb",
    showQr: false,
    qrValue: "",
    backEnabled: false,
    backText: "",
    logoPngBytes: null,
  };
}

/** The "vertical" template is a real structural difference, not a cosmetic one — it genuinely swaps the card to portrait orientation (height > width) rather than just re-flowing text inside the same landscape rectangle. */
export function resolveCardSizePt(data: BusinessCardData): PageSizePt {
  const base = data.size === "us" ? PAGE_SIZES_PT.BUSINESS_CARD_US : data.size === "eu" ? PAGE_SIZES_PT.BUSINESS_CARD_EU : clampCustomSizeMm(data.customWidthMm, data.customHeightMm, 40, 150);
  if (data.template === "vertical" && base[0] > base[1]) return [base[1], base[0]];
  return base;
}

export interface BusinessCardValidation {
  errors: string[];
  warnings: string[];
}

export function validateBusinessCard(data: BusinessCardData): BusinessCardValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!data.name.trim()) errors.push("Falta el nombre.");
  if (data.email && !isValidEmail(data.email)) errors.push("El correo no parece válido.");
  if (data.website && !isValidUrlOrBareDomain(data.website)) warnings.push("El sitio web no parece una URL válida.");
  if (data.showQr && !data.qrValue.trim()) warnings.push("El código QR está activado pero no tiene contenido.");
  if (data.size === "custom" && (data.customWidthMm < 40 || data.customHeightMm < 40)) warnings.push("Un tamaño personalizado muy pequeño puede dificultar la lectura.");
  return { errors, warnings };
}

export interface SheetLayout {
  columns: number;
  rows: number;
  cardsPerSheet: number;
  marginXPt: number;
  marginYPt: number;
  gapPt: number;
}

/** Fits as many cards as possible on `sheetSize` with a real margin and gap — never overlaps and never exceeds the page. */
export function computeCardSheetLayout(sheetSize: PageSizePt, cardSize: PageSizePt, marginPt = 28, gapPt = mmToPoints(4)): SheetLayout {
  const [sheetW, sheetH] = sheetSize;
  const [cardW, cardH] = cardSize;
  const usableW = sheetW - marginPt * 2;
  const usableH = sheetH - marginPt * 2;
  const columns = Math.max(1, Math.floor((usableW + gapPt) / (cardW + gapPt)));
  const rows = Math.max(1, Math.floor((usableH + gapPt) / (cardH + gapPt)));
  return { columns, rows, cardsPerSheet: columns * rows, marginXPt: marginPt, marginYPt: marginPt, gapPt };
}
