import { isValidEmail, isValidUrlOrBareDomain } from "@/lib/public-tools/documents/validation";
import { DOCUMENT_LIMITS } from "@/lib/public-tools/documents/limits";

/**
 * Résumé data model and validation. Dates are free text ("2022", "ene. 2022")
 * rather than a strict calendar type — résumés routinely use partial/relative
 * dates the {year,month,day} `CalendarDate` core isn't meant for, so this
 * module deliberately does NOT reuse `utilities/dates.ts` here (that core
 * stays reserved for the tools that need real calendar arithmetic — the
 * calendar/planner generators in organization/*).
 */
export type ResumeSectionKind = "experience" | "education" | "skills" | "languages" | "certifications" | "projects" | "volunteer" | "awards" | "publications" | "references" | "custom";

export type ResumeTemplateId = "simple" | "professional" | "modern" | "compact" | "academic";

export const RESUME_TEMPLATE_LABELS: Record<ResumeTemplateId, string> = {
  simple: "Sencilla",
  professional: "Profesional",
  modern: "Moderna",
  compact: "Compacta",
  academic: "Académica",
};

export const RESUME_TEMPLATE_DESCRIPTIONS: Record<ResumeTemplateId, string> = {
  simple: "Una columna, sin decoración, máxima compatibilidad de lectura — el punto de partida más seguro.",
  professional: "Encabezados con color de acento y una línea de acento bajo el nombre — un estilo corporativo clásico.",
  modern: "Banda de color a ancho completo detrás del nombre y encabezados en mayúsculas con marca de color — más visual.",
  compact: "Tipografía y espaciado reducidos para aprovechar cada página al máximo en currículums extensos.",
  academic: "Tipografía serif, encabezados en mayúsculas con línea inferior — el estilo habitual en CV académicos y de investigación.",
};

export interface ResumeContact {
  fullName: string;
  jobTitle: string;
  city: string;
  region: string;
  phone: string;
  email: string;
  website: string;
  linkedin: string;
  portfolio: string;
  summary: string;
}

export interface ResumeEntry {
  id: string;
  title: string;
  organization: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  description: string;
  bullets: string[];
  hidden: boolean;
}

export interface ResumeSection {
  id: string;
  kind: ResumeSectionKind;
  title: string;
  entries: ResumeEntry[];
  hidden: boolean;
}

export interface ResumeData {
  contact: ResumeContact;
  sections: ResumeSection[];
  template: ResumeTemplateId;
  accentColorHex: string;
  photoEnabled: boolean;
  photoPngBytes: number[] | null; // plain array so it survives JSON.stringify for import/export
}

export const RESUME_SECTION_LABELS: Record<ResumeSectionKind, string> = {
  experience: "Experiencia laboral",
  education: "Educación",
  skills: "Habilidades",
  languages: "Idiomas",
  certifications: "Certificaciones",
  projects: "Proyectos",
  volunteer: "Voluntariado",
  awards: "Premios",
  publications: "Publicaciones",
  references: "Referencias",
  custom: "Sección personalizada",
};

export function createEmptyContact(): ResumeContact {
  return { fullName: "", jobTitle: "", city: "", region: "", phone: "", email: "", website: "", linkedin: "", portfolio: "", summary: "" };
}

export function createResumeEntry(): ResumeEntry {
  return { id: `entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title: "", organization: "", location: "", startDate: "", endDate: "", current: false, description: "", bullets: [], hidden: false };
}

export function createResumeSection(kind: ResumeSectionKind): ResumeSection {
  return { id: `section-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, kind, title: RESUME_SECTION_LABELS[kind], entries: [], hidden: false };
}

export function createDefaultResume(): ResumeData {
  return {
    contact: createEmptyContact(),
    sections: [createResumeSection("experience"), createResumeSection("education"), createResumeSection("skills")],
    template: "simple",
    accentColorHex: "#2563eb",
    photoEnabled: false,
    photoPngBytes: null,
  };
}

export interface ResumeValidation {
  errors: string[];
  warnings: string[];
}

/** Never scores/rates the candidate — only flags structural/contact issues (spec section 15: "no califiques al candidato"). */
export function validateResume(data: ResumeData): ResumeValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (data.contact.email && !isValidEmail(data.contact.email)) errors.push("El correo electrónico no parece válido.");
  if (data.contact.website && !isValidUrlOrBareDomain(data.contact.website)) warnings.push("El sitio web no parece una URL válida.");
  if (data.contact.linkedin && !isValidUrlOrBareDomain(data.contact.linkedin)) warnings.push("El enlace de LinkedIn no parece una URL válida.");
  if (data.contact.portfolio && !isValidUrlOrBareDomain(data.contact.portfolio)) warnings.push("El enlace de portafolio no parece una URL válida.");

  if (!data.contact.fullName.trim()) errors.push("Falta el nombre completo.");
  if (!data.contact.email && !data.contact.phone) warnings.push("No hay ningún dato de contacto (correo o teléfono).");
  if (data.contact.summary.length > DOCUMENT_LIMITS.resume.maxSummaryChars) warnings.push(`El resumen profesional es muy largo (más de ${DOCUMENT_LIMITS.resume.maxSummaryChars} caracteres).`);

  if (data.sections.length > DOCUMENT_LIMITS.resume.maxSections) errors.push(`Demasiadas secciones (máximo ${DOCUMENT_LIMITS.resume.maxSections}).`);

  for (const section of data.sections) {
    if (section.entries.length > DOCUMENT_LIMITS.resume.maxEntriesPerSection) {
      errors.push(`La sección "${section.title}" tiene demasiadas entradas (máximo ${DOCUMENT_LIMITS.resume.maxEntriesPerSection}).`);
    }
    for (const entry of section.entries) {
      if (entry.bullets.length > DOCUMENT_LIMITS.resume.maxBulletsPerEntry) {
        warnings.push(`Una entrada de "${section.title}" tiene demasiadas viñetas (máximo ${DOCUMENT_LIMITS.resume.maxBulletsPerEntry}).`);
      }
      if (!entry.current && entry.startDate && entry.endDate && entry.startDate === entry.endDate) {
        // Free-text dates: only warn on an exact identical match (a real, if unusual, possibility), never block.
        warnings.push(`Una entrada de "${section.title}" tiene la misma fecha de inicio y fin.`);
      }
    }
  }

  const estimatedPages = estimateResumePages(data);
  if (estimatedPages > DOCUMENT_LIMITS.resume.maxPages) warnings.push(`El currículum ocupa aproximadamente ${estimatedPages} páginas; considera acortar el contenido.`);

  return { errors, warnings };
}

const CHARS_PER_PAGE_ESTIMATE = 3200;

export function estimateResumePages(data: ResumeData): number {
  let totalChars = data.contact.summary.length;
  for (const section of data.sections) {
    if (section.hidden) continue;
    for (const entry of section.entries) {
      if (entry.hidden) continue;
      totalChars += entry.title.length + entry.organization.length + entry.description.length;
      totalChars += entry.bullets.reduce((sum, b) => sum + b.length, 0);
    }
  }
  return Math.max(1, Math.ceil(totalChars / CHARS_PER_PAGE_ESTIMATE));
}

/** Plain-text export — a real, independent rendering of the same data used by the "copiar versión de texto" action and the PDF's underlying reading order. */
export function resumeToPlainText(data: ResumeData): string {
  const lines: string[] = [];
  const c = data.contact;
  if (c.fullName) lines.push(c.fullName);
  if (c.jobTitle) lines.push(c.jobTitle);
  const contactLine = [c.city && c.region ? `${c.city}, ${c.region}` : c.city || c.region, c.phone, c.email, c.website, c.linkedin, c.portfolio].filter(Boolean).join(" · ");
  if (contactLine) lines.push(contactLine);
  if (c.summary) {
    lines.push("");
    lines.push(c.summary);
  }
  for (const section of data.sections) {
    if (section.hidden || section.entries.every((e) => e.hidden)) continue;
    lines.push("");
    lines.push(section.title.toUpperCase());
    for (const entry of section.entries) {
      if (entry.hidden) continue;
      const dateRange = entry.current ? `${entry.startDate} - Actualidad` : [entry.startDate, entry.endDate].filter(Boolean).join(" - ");
      const header = [entry.title, entry.organization].filter(Boolean).join(", ");
      lines.push([header, dateRange].filter(Boolean).join(" | "));
      if (entry.location) lines.push(entry.location);
      if (entry.description) lines.push(entry.description);
      for (const bullet of entry.bullets) lines.push(`- ${bullet}`);
    }
  }
  return lines.join("\n");
}
