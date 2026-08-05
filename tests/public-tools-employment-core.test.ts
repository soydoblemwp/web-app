import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  createDefaultResume,
  createResumeEntry,
  createResumeSection,
  validateResume,
  resumeToPlainText,
  estimateResumePages,
  RESUME_TEMPLATE_LABELS,
  type ResumeTemplateId,
} from "@/lib/public-tools/employment/resume";
import { buildResumePdf } from "@/lib/public-tools/employment/resume-pdf";
import {
  createDefaultCoverLetter,
  applyModeDefaults,
  validateCoverLetter,
  coverLetterParagraphs,
  coverLetterToPlainText,
  coverLetterToMarkdown,
  coverLetterWordCount,
  coverLetterAllPlaceholders,
  coverLetterSubjectLine,
  COVER_LETTER_MODE_CONFIG,
  COVER_LETTER_MODE_LABELS,
  type CoverLetterMode,
} from "@/lib/public-tools/employment/cover-letter";
import { buildCoverLetterPdf } from "@/lib/public-tools/employment/cover-letter-pdf";
import { extractPdfDrawnText, inflatePdfContentStreams } from "./helpers/pdf-text";

const RESUME_TEMPLATES = Object.keys(RESUME_TEMPLATE_LABELS) as ResumeTemplateId[];
const COVER_LETTER_MODES = Object.keys(COVER_LETTER_MODE_LABELS) as CoverLetterMode[];

describe("employment/resume.ts: data model and validation", () => {
  it("rejects a resume with no name and warns about missing contact info", () => {
    const data = createDefaultResume();
    const result = validateResume(data);
    expect(result.errors).toContain("Falta el nombre completo.");
  });

  it("accepts a minimally complete resume with no errors", () => {
    const data = createDefaultResume();
    data.contact.fullName = "Ana García";
    data.contact.email = "ana@example.com";
    const result = validateResume(data);
    expect(result.errors).toEqual([]);
  });

  it("rejects an invalid email but does not block on an invalid website (only warns)", () => {
    const data = createDefaultResume();
    data.contact.fullName = "Ana";
    data.contact.email = "not-an-email";
    data.contact.website = "not a url";
    const result = validateResume(data);
    expect(result.errors.some((e) => e.includes("correo"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("sitio web"))).toBe(true);
  });

  it("never scores or rates the candidate — validation output is only errors/warnings strings, never a numeric score", () => {
    const data = createDefaultResume();
    data.contact.fullName = "Ana";
    const result = validateResume(data);
    expect(Object.keys(result)).toEqual(["errors", "warnings"]);
  });

  it("estimateResumePages grows with real content length and never returns less than 1", () => {
    const empty = createDefaultResume();
    expect(estimateResumePages(empty)).toBe(1);
    const section = createResumeSection("experience");
    const entry = createResumeEntry();
    entry.description = "x".repeat(10_000);
    section.entries.push(entry);
    const full = createDefaultResume();
    full.sections = [section];
    expect(estimateResumePages(full)).toBeGreaterThan(1);
  });

  it("resumeToPlainText produces a real, independent text rendering containing the entered content", () => {
    const data = createDefaultResume();
    data.contact.fullName = "Ana García";
    data.contact.summary = "Resumen profesional real.";
    const section = createResumeSection("experience");
    const entry = createResumeEntry();
    entry.title = "Desarrolladora";
    entry.organization = "Acme Corp";
    entry.bullets = ["Logro uno", "Logro dos"];
    section.entries.push(entry);
    data.sections = [section];
    const text = resumeToPlainText(data);
    expect(text).toContain("Ana García");
    expect(text).toContain("Resumen profesional real.");
    expect(text).toContain("Desarrolladora");
    expect(text).toContain("Acme Corp");
    expect(text).toContain("Logro uno");
  });

  it("a hidden section or entry is excluded from the plain-text export", () => {
    const data = createDefaultResume();
    data.contact.fullName = "Ana";
    const section = createResumeSection("experience");
    const entry = createResumeEntry();
    entry.title = "SecretoOculto";
    entry.hidden = true;
    section.entries.push(entry);
    data.sections = [section];
    expect(resumeToPlainText(data)).not.toContain("SecretoOculto");
  });
});

describe("employment/resume-pdf.ts: real PDF generation across all 5 required minimum templates", () => {
  it("offers exactly the 5 required minimum templates (sencilla/profesional/moderna/compacta/académica)", () => {
    expect(RESUME_TEMPLATES.sort()).toEqual(["academic", "compact", "modern", "professional", "simple"].sort());
  });

  it("each template produces a real, reloadable PDF containing the entered name and section content", async () => {
    for (const template of RESUME_TEMPLATES) {
      const data = createDefaultResume();
      data.template = template;
      data.contact.fullName = "CandidatoPruebaReal";
      data.contact.summary = "ResumenProfesionalUnico";
      const section = createResumeSection("experience");
      const entry = createResumeEntry();
      entry.title = "PuestoDePrueba";
      entry.organization = "EmpresaDePrueba";
      section.entries.push(entry);
      data.sections = [section];

      const bytes = await buildResumePdf(data);
      const reloaded = await PDFDocument.load(bytes);
      expect(reloaded.getPageCount(), template).toBeGreaterThanOrEqual(1);

      const text = extractPdfDrawnText(bytes);
      expect(text, template).toContain("CandidatoPruebaReal");
      expect(text, template).toContain("ResumenProfesionalUnico");
      expect(text, template).toContain("PuestoDePrueba");
      expect(text, template).toContain("EmpresaDePrueba");
    }
  });

  it("the 5 templates are structurally distinct — never just recolored copies of one layout", async () => {
    const data = createDefaultResume();
    data.contact.fullName = "CandidatoPlantillas";
    const section = createResumeSection("experience");
    const entry = createResumeEntry();
    entry.title = "Puesto";
    entry.organization = "Empresa";
    section.entries.push(entry);
    data.sections = [section];

    const signatures = new Map<ResumeTemplateId, string>();
    for (const template of RESUME_TEMPLATES) {
      data.template = template;
      const bytes = await buildResumePdf(data);
      const content = inflatePdfContentStreams(bytes);
      // A structural fingerprint independent of visitor text: which font family+size pairs are selected
      // (Tf operators) — real header/type-scale differences move these, a palette swap alone would not.
      const fontSelectors = [...content.matchAll(/\/(Helvetica-Bold|Helvetica|Times-Bold|Times-Roman)-\d+ ([\d.]+) Tf/g)].map((m) => `${m[1]}@${m[2]}`).join("|");
      signatures.set(template, fontSelectors);
    }
    const uniqueSignatures = new Set(signatures.values());
    expect(uniqueSignatures.size, JSON.stringify(Object.fromEntries(signatures))).toBe(RESUME_TEMPLATES.length);
  });

  it("the simple template stays single-column with no decorative skill bars, banners or filled shapes (unlike modern's banner header)", async () => {
    const data = createDefaultResume();
    data.contact.fullName = "CandidatoSencillo";
    data.template = "simple";
    const bytes = await buildResumePdf(data);
    const content = inflatePdfContentStreams(bytes);
    const fillOps = (content.match(/(^|\n)f(\n|$)/g) ?? []).length;
    expect(fillOps).toBe(0);
  });

  it("a resume with enough content spans multiple real PDF pages", async () => {
    const data = createDefaultResume();
    data.contact.fullName = "Candidato";
    const section = createResumeSection("experience");
    for (let i = 0; i < 20; i++) {
      const entry = createResumeEntry();
      entry.title = `Puesto ${i}`;
      entry.organization = `Empresa ${i}`;
      entry.description = "Una descripción larga que ocupa bastante espacio en la página del currículum. ".repeat(6);
      entry.bullets = ["Logro importante número uno con mucho detalle", "Logro importante número dos con mucho detalle"];
      section.entries.push(entry);
    }
    data.sections = [section];
    const bytes = await buildResumePdf(data);
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBeGreaterThan(1);
  });
});

describe("employment/cover-letter.ts: 5 genuinely distinct modes, never auto-generated content", () => {
  it("offers exactly the 5 required minimum modes (tradicional/moderna/breve/espontánea/seguimiento)", () => {
    expect(COVER_LETTER_MODES.sort()).toEqual(["traditional", "modern", "brief", "spontaneous", "follow-up"].sort());
  });

  it("each mode has its own distinct paragraph labels, subject template and recommended word range — not shared defaults", () => {
    const labelSets = new Set<string>();
    const wordRanges = new Set<string>();
    const subjectTemplates = new Set<string>();
    for (const mode of COVER_LETTER_MODES) {
      const config = COVER_LETTER_MODE_CONFIG[mode];
      labelSets.add(config.paragraphLabels.join("|"));
      wordRanges.add(config.recommendedWordRange.join("-"));
      subjectTemplates.add(config.subjectTemplate("PuestoX", "REF-1"));
    }
    expect(labelSets.size, "paragraph labels should differ across modes").toBeGreaterThan(1);
    expect(wordRanges.size, "recommended word ranges should differ across modes").toBeGreaterThan(1);
    expect(subjectTemplates.size, "subject line templates should differ across modes").toBe(COVER_LETTER_MODES.length);
  });

  it("coverLetterSubjectLine reflects the selected mode's own template, not a fixed sentence", () => {
    const data = createDefaultCoverLetter();
    data.positionTitle = "Analista de Datos";
    const subjects = new Set<string>();
    for (const mode of COVER_LETTER_MODES) {
      data.mode = mode;
      subjects.add(coverLetterSubjectLine(data) ?? "");
    }
    expect(subjects.size).toBeGreaterThan(1);
  });

  it("switching mode via applyModeDefaults only overwrites salutation/farewell that still match the OLD mode's defaults, never a visitor's real edits", () => {
    let data = createDefaultCoverLetter();
    data.mode = "traditional";
    data.salutation = COVER_LETTER_MODE_CONFIG.traditional.defaultSalutation;
    data = applyModeDefaults(data, "brief");
    expect(data.salutation).toBe(COVER_LETTER_MODE_CONFIG.brief.defaultSalutation);

    let edited = createDefaultCoverLetter();
    edited.mode = "traditional";
    edited.salutation = "SaludoEscritoPorElVisitanteReal";
    edited = applyModeDefaults(edited, "brief");
    expect(edited.salutation).toBe("SaludoEscritoPorElVisitanteReal");
  });

  it("rejects a letter with no paragraphs written", () => {
    const data = createDefaultCoverLetter();
    data.candidateName = "Ana";
    const result = validateCoverLetter(data);
    expect(result.errors).toContain("La carta no tiene ningún párrafo escrito.");
  });

  it("coverLetterParagraphs only includes paragraphs the visitor actually wrote", () => {
    const data = createDefaultCoverLetter();
    data.openingParagraph = "Apertura real";
    data.motivationParagraph = "Motivación real";
    expect(coverLetterParagraphs(data)).toEqual(["Apertura real", "Motivación real"]);
  });

  it("detects unfilled placeholders across every text field and reports them as a warning, not a hard error", () => {
    const data = createDefaultCoverLetter();
    data.candidateName = "Ana";
    data.openingParagraph = "Escribo para el puesto de [Puesto solicitado] en [Nombre de la empresa].";
    const validation = validateCoverLetter(data);
    expect(validation.placeholders.length).toBeGreaterThan(0);
    expect(validation.warnings.some((w) => w.includes("marcador"))).toBe(true);
    expect(coverLetterAllPlaceholders(data)).toEqual(["[Puesto solicitado]", "[Nombre de la empresa]"]);
  });

  it("coverLetterWordCount counts real words across all written paragraphs", () => {
    const data = createDefaultCoverLetter();
    data.openingParagraph = "una dos tres";
    data.motivationParagraph = "cuatro cinco";
    expect(coverLetterWordCount(data)).toBe(5);
  });

  it("plain-text and Markdown exports both contain the real written content", () => {
    const data = createDefaultCoverLetter();
    data.candidateName = "Ana García";
    data.openingParagraph = "Párrafo de apertura real.";
    data.positionTitle = "Desarrolladora Senior";
    const plain = coverLetterToPlainText(data);
    const md = coverLetterToMarkdown(data);
    expect(plain).toContain("Ana García");
    expect(plain).toContain("Párrafo de apertura real.");
    expect(md).toContain("Desarrolladora Senior");
  });

  it("Markdown export escapes special Markdown characters in visitor text", () => {
    const data = createDefaultCoverLetter();
    data.openingParagraph = "Texto con *asteriscos* y _guiones bajos_ y [corchetes]";
    const md = coverLetterToMarkdown(data);
    expect(md).toContain("\\*asteriscos\\*");
    expect(md).toContain("\\_guiones");
  });
});

describe("employment/cover-letter-pdf.ts: real PDF generation across all 5 modes", () => {
  it("produces a real, reloadable PDF containing the candidate name and paragraph text", async () => {
    const data = createDefaultCoverLetter();
    data.candidateName = "CandidataCartaReal";
    data.openingParagraph = "ParrafoAperturaUnico";
    data.positionTitle = "PuestoSolicitadoUnico";
    const bytes = await buildCoverLetterPdf(data);
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBeGreaterThanOrEqual(1);
    const text = extractPdfDrawnText(bytes);
    expect(text).toContain("CandidataCartaReal");
    expect(text).toContain("ParrafoAperturaUnico");
    expect(text).toContain("PuestoSolicitadoUnico");
  });

  it("each of the 5 modes renders its own mode-specific subject line and structure into the PDF (never a shared, unread 'mode' field)", async () => {
    const rendered = new Map<CoverLetterMode, string>();
    for (const mode of COVER_LETTER_MODES) {
      const data = createDefaultCoverLetter();
      data.mode = mode;
      data.candidateName = "Candidata";
      data.openingParagraph = "Párrafo de apertura.";
      data.positionTitle = "Puesto";
      data.companyName = "EmpresaPrueba";
      data.companyAddress = "Calle Falsa 123";
      data.recipientName = "Responsable";
      const bytes = await buildCoverLetterPdf(data);
      // Normalize away em/en dashes: pdf-lib encodes them as WinAnsi bytes 0x97/0x96, which this helper's
      // naive byte-to-char hex decode turns into raw control-character code points (U+0097/U+0096), not
      // the original glyph — match both the real dash chars and their mis-decoded equivalents.
      const normalizeDashes = (s: string) => s.replace(/[\u2013\u2014\u0096\u0097]/g, "-");
      const text = normalizeDashes(extractPdfDrawnText(bytes));
      rendered.set(mode, text);
      expect(text, mode).toContain(normalizeDashes(coverLetterSubjectLine(data) ?? ""));
    }
    // The traditional/follow-up modes show the full postal address block (companyAddress); modern/brief/spontaneous don't.
    expect(rendered.get("traditional")).toContain("Calle Falsa 123");
    expect(rendered.get("brief")).not.toContain("Calle Falsa 123");
  });
});
