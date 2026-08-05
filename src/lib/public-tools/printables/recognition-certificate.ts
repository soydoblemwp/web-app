import { DOCUMENT_LIMITS } from "@/lib/public-tools/documents/limits";

/**
 * Deliberately restricted to informal recognition (spec section 27) — the
 * type list below is a closed set, not a free-text field, specifically so
 * the tool can never be pointed at an official/legal document type.
 */
export type CertificateType = "recognition" | "participation" | "completion" | "gratitude" | "attendance" | "internal-award" | "volunteering" | "workshop";

export const CERTIFICATE_TYPE_LABELS: Record<CertificateType, string> = {
  recognition: "Reconocimiento",
  participation: "Participación",
  completion: "Finalización interna",
  gratitude: "Agradecimiento",
  attendance: "Asistencia",
  "internal-award": "Premio interno",
  volunteering: "Voluntariado",
  workshop: "Taller no acreditado",
};

export type CertificateTemplateId = "formal" | "modern" | "school" | "volunteering" | "gratitude" | "participation";

export const CERTIFICATE_TEMPLATE_LABELS: Record<CertificateTemplateId, string> = {
  formal: "Formal",
  modern: "Moderna",
  school: "Escolar informal",
  volunteering: "Voluntariado",
  gratitude: "Agradecimiento",
  participation: "Participación",
};

export const CERTIFICATE_TEMPLATE_DESCRIPTIONS: Record<CertificateTemplateId, string> = {
  formal: "Doble borde y tipografía serif — el estilo clásico de diploma.",
  modern: "Borde simple, tipografía de palo seco y líneas de acento arriba y abajo.",
  school: "Banda de color a ancho completo con el nombre del reconocimiento, estilo escolar informal.",
  volunteering: "Distintivo circular tipo medalla en la esquina superior, borde simple.",
  gratitude: "Sin caja de borde, mucho espacio en blanco — un tono cercano y minimalista.",
  participation: "Línea vertical discontinua que separa un resguardo, como una entrada de evento.",
};

export interface RecognitionCertificateData {
  certificateType: CertificateType;
  recognitionName: string; // e.g. "Certificado de Participación"
  recipientName: string;
  reason: string;
  organizationName: string;
  date: string;
  place: string;
  signerNames: string[]; // up to a small number, each with a title
  signerTitles: string[];
  internalNumber: string;
  template: CertificateTemplateId;
  accentColorHex: string;
  logoPngBytes: number[] | null;
}

export function createDefaultCertificate(): RecognitionCertificateData {
  return {
    certificateType: "recognition",
    recognitionName: "Certificado de Reconocimiento",
    recipientName: "",
    reason: "",
    organizationName: "",
    date: "",
    place: "",
    signerNames: [""],
    signerTitles: [""],
    internalNumber: "",
    template: "formal",
    accentColorHex: "#b45309",
    logoPngBytes: null,
  };
}

export const NOT_OFFICIAL_NOTICE = "Plantilla de reconocimiento no oficial creada con los datos introducidos por el usuario.";

export interface CertificateValidation {
  errors: string[];
  warnings: string[];
}

export function validateCertificate(data: RecognitionCertificateData): CertificateValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!data.recipientName.trim()) errors.push("Falta el nombre de la persona.");
  if (!data.recognitionName.trim()) errors.push("Falta el nombre del reconocimiento.");
  if (data.reason.length > DOCUMENT_LIMITS.certificate.maxTextChars) warnings.push(`El motivo es muy largo (máximo recomendado ${DOCUMENT_LIMITS.certificate.maxTextChars} caracteres).`);
  if (!data.organizationName.trim()) warnings.push("No se indicó la organización que otorga el reconocimiento.");
  return { errors, warnings };
}
