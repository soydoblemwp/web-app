import type { AiToolDefinition } from "@/lib/ai-center/tools/types";
import {
  buildDocumentSummarizerSystemPrompt,
  buildDocumentSummarizerPrompt,
  buildDocumentTranslatorSystemPrompt,
  buildDocumentTranslatorPrompt,
  buildGrammarStyleCheckerSystemPrompt,
  buildGrammarStyleCheckerPrompt,
  buildDocumentRewriterSystemPrompt,
  buildDocumentRewriterPrompt,
  buildContractSimplifierSystemPrompt,
  buildContractSimplifierPrompt,
  buildMeetingNotesGeneratorSystemPrompt,
  buildMeetingNotesGeneratorPrompt,
  buildExecutiveSummarySystemPrompt,
  buildExecutiveSummaryPrompt,
  buildBulletPointGeneratorSystemPrompt,
  buildBulletPointGeneratorPrompt,
  buildFormalDocumentGeneratorSystemPrompt,
  buildFormalDocumentGeneratorPrompt,
  buildDocumentAnalyzerSystemPrompt,
  buildDocumentAnalyzerPrompt,
} from "@/lib/ai-center/tools/document-ai-prompts";

/**
 * Every fully-implemented Document AI tool, as a declarative definition the
 * generic AiGenerationForm engine can render — same pattern as every other
 * category (youtube.ts, instagram.ts, social-media.ts, blog-seo.ts,
 * email-marketing.ts, tiktok.ts, facebook.ts, linkedin.ts, image-ai.ts).
 *
 * These tools only ever process the plain text the user pastes into the
 * form. There is no OCR, no PDF/Word/Google Docs parsing and no external
 * document API of any kind — they use the exact same local text engine as
 * every other tool, reading and writing text only.
 */
export const DOCUMENT_AI_TOOLS: AiToolDefinition[] = [
  {
    slug: "document-summarizer",
    routeSegment: "summarizer",
    label: "Document Summarizer",
    description: "Resume un documento largo conservando fielmente sus ideas y datos.",
    fields: [
      { name: "documento", label: "Documento a resumir", type: "textarea", required: true, maxLength: 8000 },
      { name: "longitud", label: "Longitud deseada del resumen", type: "text", defaultValue: "Resumen medio (3-5 párrafos)", maxLength: 200, required: true },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildDocumentSummarizerSystemPrompt,
    buildUserPrompt: (v) => buildDocumentSummarizerPrompt({ documento: v.documento, longitud: v.longitud, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: () => "Resumen de documento",
    contentType: "SUMMARY",
    resultKind: "SUMMARY",
  },
  {
    slug: "document-translator",
    routeSegment: "translator",
    label: "Document Translator",
    description: "Traduce un documento de forma fiel, sin alterar cifras, nombres ni fechas.",
    fields: [
      { name: "documento", label: "Documento a traducir", type: "textarea", required: true, maxLength: 8000 },
      { name: "idiomaDestino", label: "Idioma de destino", type: "text", required: true, maxLength: 50 },
      { name: "idiomaOrigen", label: "Idioma de origen (opcional)", type: "text", maxLength: 50, placeholder: "Detectar automáticamente" },
    ],
    buildSystemPrompt: buildDocumentTranslatorSystemPrompt,
    buildUserPrompt: (v) =>
      buildDocumentTranslatorPrompt({ documento: v.documento, idiomaDestino: v.idiomaDestino, idiomaOrigen: v.idiomaOrigen }),
    outputMode: "text",
    buildItemTitle: (v) => `Traducción a ${v.idiomaDestino}`,
    contentType: "OTHER",
    resultKind: "ADAPTATION",
  },
  {
    slug: "grammar-style-checker",
    routeSegment: "grammar-style",
    label: "Grammar & Style Checker",
    description: "Corrige ortografía, gramática y estilo sin cambiar el significado del documento.",
    fields: [
      { name: "documento", label: "Documento a corregir", type: "textarea", required: true, maxLength: 8000 },
      { name: "idioma", label: "Idioma del texto", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildGrammarStyleCheckerSystemPrompt,
    buildUserPrompt: (v) => buildGrammarStyleCheckerPrompt({ documento: v.documento, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: () => "Documento corregido",
    contentType: "OTHER",
    resultKind: "REWRITE",
  },
  {
    slug: "document-rewriter",
    routeSegment: "rewriter",
    label: "Document Rewriter",
    description: "Reescribe un documento con un tono distinto, conservando el significado y los datos originales.",
    fields: [
      { name: "documento", label: "Documento a reescribir", type: "textarea", required: true, maxLength: 8000 },
      { name: "tono", label: "Tono deseado", type: "text", required: true, maxLength: 150, placeholder: "ej. formal, cercano, técnico" },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildDocumentRewriterSystemPrompt,
    buildUserPrompt: (v) => buildDocumentRewriterPrompt({ documento: v.documento, tono: v.tono, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: () => "Documento reescrito",
    contentType: "OTHER",
    resultKind: "REWRITE",
  },
  {
    slug: "contract-simplifier",
    routeSegment: "contract-simplifier",
    label: "Contract Simplifier",
    description: "Reescribe un contrato o documento legal en lenguaje sencillo, sin alterar sus condiciones.",
    fields: [
      { name: "documento", label: "Texto del contrato o documento legal", type: "textarea", required: true, maxLength: 8000 },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildContractSimplifierSystemPrompt,
    buildUserPrompt: (v) => buildContractSimplifierPrompt({ documento: v.documento, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: () => "Contrato simplificado",
    contentType: "OTHER",
    resultKind: "REWRITE",
  },
  {
    slug: "meeting-notes-generator",
    routeSegment: "meeting-notes",
    label: "Meeting Notes Generator",
    description: "Organiza notas o una transcripción de reunión en un acta clara con decisiones y próximos pasos.",
    fields: [
      { name: "notas", label: "Notas o transcripción de la reunión", type: "textarea", required: true, maxLength: 8000 },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildMeetingNotesGeneratorSystemPrompt,
    buildUserPrompt: (v) => buildMeetingNotesGeneratorPrompt({ notas: v.notas, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: () => "Notas de reunión",
    contentType: "OTHER",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "executive-summary-generator",
    routeSegment: "executive-summary",
    label: "Executive Summary Generator",
    description: "Condensa un documento en un resumen ejecutivo orientado a la audiencia indicada.",
    fields: [
      { name: "documento", label: "Documento a resumir", type: "textarea", required: true, maxLength: 8000 },
      { name: "audiencia", label: "Audiencia del resumen", type: "text", defaultValue: "Dirección / alta gerencia", maxLength: 200, required: true },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildExecutiveSummarySystemPrompt,
    buildUserPrompt: (v) => buildExecutiveSummaryPrompt({ documento: v.documento, audiencia: v.audiencia, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: () => "Resumen ejecutivo",
    contentType: "SUMMARY",
    resultKind: "SUMMARY",
  },
  {
    slug: "bullet-point-generator",
    routeSegment: "bullet-points",
    label: "Bullet Point Generator",
    description: "Convierte un documento en una lista de puntos clave clara y escaneable.",
    fields: [
      { name: "documento", label: "Documento a convertir en puntos clave", type: "textarea", required: true, maxLength: 8000 },
      { name: "cantidadPuntos", label: "Cantidad de puntos deseada", type: "text", defaultValue: "Los necesarios para cubrir las ideas clave", maxLength: 200 },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildBulletPointGeneratorSystemPrompt,
    buildUserPrompt: (v) =>
      buildBulletPointGeneratorPrompt({ documento: v.documento, cantidadPuntos: v.cantidadPuntos, idioma: v.idioma }),
    outputMode: "list",
    buildItemTitle: () => "Puntos clave del documento",
    contentType: "OTHER",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "formal-document-generator",
    routeSegment: "formal-document",
    label: "Formal Document Generator",
    description: "Redacta un documento formal (carta, memorándum, comunicado) a partir del propósito que indiques.",
    fields: [
      { name: "proposito", label: "Propósito y contenido a incluir", type: "textarea", required: true, maxLength: 8000 },
      { name: "tipoDocumento", label: "Tipo de documento", type: "text", required: true, maxLength: 200, placeholder: "ej. carta formal, memorándum, comunicado" },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildFormalDocumentGeneratorSystemPrompt,
    buildUserPrompt: (v) =>
      buildFormalDocumentGeneratorPrompt({ proposito: v.proposito, tipoDocumento: v.tipoDocumento, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: (v) => `${v.tipoDocumento}`,
    contentType: "OTHER",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "document-analyzer",
    routeSegment: "analyzer",
    label: "Document Analyzer",
    description: "Analiza estructura, claridad y coherencia de un documento usando solo evidencia del propio texto.",
    fields: [
      { name: "documento", label: "Documento a analizar", type: "textarea", required: true, maxLength: 8000 },
      { name: "enfoqueAnalisis", label: "Enfoque del análisis", type: "text", defaultValue: "Estructura, claridad y coherencia general", maxLength: 300, required: true },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildDocumentAnalyzerSystemPrompt,
    buildUserPrompt: (v) =>
      buildDocumentAnalyzerPrompt({ documento: v.documento, enfoqueAnalisis: v.enfoqueAnalisis, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: () => "Análisis de documento",
    contentType: "OTHER",
    resultKind: "ANALYSIS",
  },
];

export function getDocumentAiTool(routeSegment: string): AiToolDefinition | undefined {
  return DOCUMENT_AI_TOOLS.find((tool) => tool.routeSegment === routeSegment);
}
