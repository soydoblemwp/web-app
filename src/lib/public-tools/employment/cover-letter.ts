import { findPlaceholders } from "@/lib/public-tools/documents/validation";
import { DOCUMENT_LIMITS } from "@/lib/public-tools/documents/limits";

/**
 * The tool STRUCTURES and FORMATS a letter the visitor writes — it never
 * generates the letter's content automatically (spec section 16: "no debe
 * generar automáticamente una carta completa mediante IA"). Every paragraph
 * field here is free text the visitor types. The 5 modes below each
 * genuinely change structure/instructions/recommended length/subject
 * line/which fields apply — never just a cosmetic label (a real gap found
 * during the Fase 47 correction: `mode` was previously stored but never
 * read anywhere outside the UI selector).
 */
export type CoverLetterMode = "traditional" | "modern" | "brief" | "spontaneous" | "follow-up";

export const COVER_LETTER_MODE_LABELS: Record<CoverLetterMode, string> = {
  traditional: "Carta tradicional",
  modern: "Carta moderna",
  brief: "Carta breve",
  spontaneous: "Candidatura espontánea",
  "follow-up": "Seguimiento posterior a entrevista",
};

export interface CoverLetterModeConfig {
  description: string;
  showFullAddressBlock: boolean; // full postal address for recipient/company
  showJobReference: boolean;
  subjectTemplate: (positionTitle: string, jobReference: string) => string;
  paragraphLabels: [string, string, string, string];
  paragraphHints: [string, string, string, string];
  recommendedWordRange: [number, number];
  defaultSalutation: string;
  defaultFarewell: string;
}

export const COVER_LETTER_MODE_CONFIG: Record<CoverLetterMode, CoverLetterModeConfig> = {
  traditional: {
    description: "Estructura formal completa con bloque de dirección, ideal para procesos de selección convencionales.",
    showFullAddressBlock: true,
    showJobReference: true,
    subjectTemplate: (title, ref) => `Asunto: Candidatura para ${title || "el puesto"}${ref ? ` (ref. ${ref})` : ""}`,
    paragraphLabels: ["Apertura", "Experiencia relevante", "Motivación", "Cierre"],
    paragraphHints: [
      "Preséntate y menciona el puesto al que optas.",
      "Describe tu experiencia y logros más relevantes para el puesto.",
      "Explica por qué te interesa esta empresa en concreto.",
      "Agradece la consideración y propone un siguiente paso.",
    ],
    recommendedWordRange: [250, 400],
    defaultSalutation: "Estimado/a responsable de contratación:",
    defaultFarewell: "Atentamente,",
  },
  modern: {
    description: "Tono directo y cercano, sin bloque de dirección postal completo, pensado para empresas con cultura informal.",
    showFullAddressBlock: false,
    showJobReference: true,
    subjectTemplate: (title, ref) => `Asunto: Candidatura — ${title || "puesto"}${ref ? ` (${ref})` : ""}`,
    paragraphLabels: ["Gancho inicial", "Lo que aporto", "Por qué esta empresa", "Llamada a la acción"],
    paragraphHints: [
      "Empieza con una frase que capte la atención sobre tu perfil.",
      "Resume en pocas frases el valor concreto que aportarías.",
      "Conecta tus intereses con la misión o los productos de la empresa.",
      "Propón directamente una conversación o entrevista.",
    ],
    recommendedWordRange: [180, 300],
    defaultSalutation: "Hola,",
    defaultFarewell: "Un saludo,",
  },
  brief: {
    description: "Versión reducida a lo esencial — dos ideas concretas en vez de un desarrollo largo.",
    showFullAddressBlock: false,
    showJobReference: false,
    subjectTemplate: (title) => `Asunto: Candidatura breve — ${title || "puesto"}`,
    paragraphLabels: ["Quién soy", "Por qué encajo", "(opcional)", "Cierre breve"],
    paragraphHints: [
      "Una frase: quién eres y qué puesto buscas.",
      "Una o dos frases con tu argumento principal.",
      "Deja este campo vacío si no lo necesitas.",
      "Una frase de cierre y disponibilidad para hablar.",
    ],
    recommendedWordRange: [60, 150],
    defaultSalutation: "Hola,",
    defaultFarewell: "Gracias,",
  },
  spontaneous: {
    description: "Candidatura no solicitada — sin referencia de vacante, centrada en el interés general por la empresa.",
    showFullAddressBlock: false,
    showJobReference: false,
    subjectTemplate: () => "Asunto: Candidatura espontánea",
    paragraphLabels: ["Presentación", "Qué puedo aportar", "Por qué esta empresa", "Disponibilidad"],
    paragraphHints: [
      "Preséntate y explica que escribes sin que haya una vacante publicada.",
      "Describe el tipo de perfil o rol en el que podrías encajar.",
      "Explica por qué te interesa esta empresa en particular, no solo un puesto.",
      "Indica tu disponibilidad para una conversación exploratoria.",
    ],
    recommendedWordRange: [200, 350],
    defaultSalutation: "Estimados/as,",
    defaultFarewell: "Atentamente,",
  },
  "follow-up": {
    description: "Mensaje de seguimiento tras una entrevista ya realizada — no repite tu currículum, agradece y refuerza el interés.",
    showFullAddressBlock: false,
    showJobReference: true,
    subjectTemplate: (title, ref) => `Asunto: Seguimiento de la entrevista${title ? ` — ${title}` : ""}${ref ? ` (ref. ${ref})` : ""}`,
    paragraphLabels: ["Agradecimiento", "Punto destacado de la entrevista", "Refuerzo de interés", "Cierre"],
    paragraphHints: [
      "Agradece el tiempo dedicado a la entrevista y menciona la fecha.",
      "Retoma algún tema concreto que se comentara en la conversación.",
      "Reafirma tu interés en el puesto y tu ajuste con el equipo.",
      "Indica que quedas disponible para cualquier información adicional.",
    ],
    recommendedWordRange: [100, 220],
    defaultSalutation: "Estimado/a [Nombre del entrevistador]:",
    defaultFarewell: "Gracias de nuevo,",
  },
};

export interface CoverLetterData {
  mode: CoverLetterMode;
  candidateName: string;
  candidateContact: string; // free text: phone / email / address, one per line
  date: string;
  recipientName: string;
  recipientTitle: string;
  companyName: string;
  companyAddress: string;
  positionTitle: string;
  jobReference: string;
  salutation: string;
  openingParagraph: string;
  experienceParagraph: string;
  motivationParagraph: string;
  closingParagraph: string;
  farewell: string;
  signatureName: string;
}

export function createDefaultCoverLetter(): CoverLetterData {
  const config = COVER_LETTER_MODE_CONFIG.traditional;
  return {
    mode: "traditional",
    candidateName: "",
    candidateContact: "",
    date: "",
    recipientName: "",
    recipientTitle: "",
    companyName: "",
    companyAddress: "",
    positionTitle: "",
    jobReference: "",
    salutation: config.defaultSalutation,
    openingParagraph: "",
    experienceParagraph: "",
    motivationParagraph: "",
    closingParagraph: "",
    farewell: config.defaultFarewell,
    signatureName: "",
  };
}

/** Applies a mode's default salutation/farewell — only when the visitor hasn't already customized them away from the previous mode's defaults, so switching modes never silently overwrites real edits. */
export function applyModeDefaults(data: CoverLetterData, newMode: CoverLetterMode): CoverLetterData {
  const oldConfig = COVER_LETTER_MODE_CONFIG[data.mode];
  const newConfig = COVER_LETTER_MODE_CONFIG[newMode];
  return {
    ...data,
    mode: newMode,
    salutation: data.salutation === oldConfig.defaultSalutation ? newConfig.defaultSalutation : data.salutation,
    farewell: data.farewell === oldConfig.defaultFarewell ? newConfig.defaultFarewell : data.farewell,
  };
}

export function coverLetterParagraphs(data: CoverLetterData): string[] {
  return [data.openingParagraph, data.experienceParagraph, data.motivationParagraph, data.closingParagraph].filter((p) => p.trim().length > 0);
}

export interface CoverLetterValidation {
  errors: string[];
  warnings: string[];
  placeholders: string[];
}

export function validateCoverLetter(data: CoverLetterData): CoverLetterValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!data.candidateName.trim()) errors.push("Falta el nombre del remitente.");
  if (!data.salutation.trim()) warnings.push("Falta el saludo inicial.");

  const paragraphs = coverLetterParagraphs(data);
  if (paragraphs.length === 0) errors.push("La carta no tiene ningún párrafo escrito.");
  if (paragraphs.length > DOCUMENT_LIMITS.coverLetter.maxParagraphs) errors.push(`Demasiados párrafos (máximo ${DOCUMENT_LIMITS.coverLetter.maxParagraphs}).`);
  for (const p of paragraphs) {
    if (p.length > DOCUMENT_LIMITS.coverLetter.maxParagraphChars) warnings.push("Un párrafo es muy largo; considera dividirlo.");
  }

  const placeholders = coverLetterAllPlaceholders(data);
  if (placeholders.length > 0) warnings.push(`Hay ${placeholders.length} marcador(es) sin sustituir, como "${placeholders[0]}".`);

  const [minWords, maxWords] = COVER_LETTER_MODE_CONFIG[data.mode].recommendedWordRange;
  const wordCount = coverLetterWordCount(data);
  if (wordCount > 0 && (wordCount < minWords || wordCount > maxWords)) {
    warnings.push(`Para "${COVER_LETTER_MODE_LABELS[data.mode]}" se recomiendan entre ${minWords} y ${maxWords} palabras (actualmente ${wordCount}).`);
  }

  return { errors, warnings, placeholders };
}

export function coverLetterAllPlaceholders(data: CoverLetterData): string[] {
  const fields = [data.salutation, ...coverLetterParagraphs(data), data.farewell];
  const found: string[] = [];
  for (const field of fields) found.push(...findPlaceholders(field));
  return found;
}

export function coverLetterWordCount(data: CoverLetterData): number {
  const text = coverLetterParagraphs(data).join(" ");
  return text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
}

function subjectLine(data: CoverLetterData): string | null {
  if (!data.positionTitle && COVER_LETTER_MODE_CONFIG[data.mode].showJobReference) return null;
  const config = COVER_LETTER_MODE_CONFIG[data.mode];
  return config.subjectTemplate(data.positionTitle, config.showJobReference ? data.jobReference : "");
}

export function coverLetterToPlainText(data: CoverLetterData): string {
  const config = COVER_LETTER_MODE_CONFIG[data.mode];
  const lines: string[] = [];
  if (data.candidateName) lines.push(data.candidateName);
  if (data.candidateContact) lines.push(...data.candidateContact.split("\n"));
  lines.push("");
  if (data.date) lines.push(data.date);
  lines.push("");
  if (config.showFullAddressBlock) {
    if (data.recipientName) lines.push(data.recipientName);
    if (data.recipientTitle) lines.push(data.recipientTitle);
    if (data.companyName) lines.push(data.companyName);
    if (data.companyAddress) lines.push(...data.companyAddress.split("\n"));
    lines.push("");
  } else if (data.recipientName || data.companyName) {
    lines.push([data.recipientName, data.companyName].filter(Boolean).join(" · "));
    lines.push("");
  }
  const subject = subjectLine(data);
  if (subject) {
    lines.push(subject);
    lines.push("");
  }
  if (data.salutation) lines.push(data.salutation);
  for (const paragraph of coverLetterParagraphs(data)) {
    lines.push("");
    lines.push(paragraph);
  }
  lines.push("");
  if (data.farewell) lines.push(data.farewell);
  if (data.signatureName) lines.push(data.signatureName);
  return lines.join("\n");
}

export function coverLetterToMarkdown(data: CoverLetterData): string {
  const escape = (s: string) => s.replace(/([\\`*_{}[\]()#+.!-])/g, "\\$1");
  const lines: string[] = [];
  const subject = subjectLine(data);
  if (subject) lines.push(`**${escape(subject)}**`, "");
  if (data.salutation) lines.push(escape(data.salutation), "");
  for (const paragraph of coverLetterParagraphs(data)) lines.push(escape(paragraph), "");
  if (data.farewell) lines.push(escape(data.farewell));
  if (data.signatureName) lines.push(`\n**${escape(data.signatureName)}**`);
  return lines.join("\n");
}

export { subjectLine as coverLetterSubjectLine };
