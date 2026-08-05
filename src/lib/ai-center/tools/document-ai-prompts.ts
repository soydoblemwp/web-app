/**
 * Pure prompt builders for the Document AI tools. Every system prompt takes
 * the project's real brand context (from buildBrandContext) — same rule
 * used by every other authenticated tool in this app: no separate AI
 * system, just a different prompt built on top of the shared local engine.
 *
 * IMPORTANT: these tools only ever work with the plain text the user pastes
 * into the form. There is no OCR, no PDF/Word/Google Docs parsing and no
 * external document API of any kind involved — the local model only ever
 * reads and writes text, exactly like every other tool in this app.
 *
 * None of this text is copied from any other category's prompts. Every
 * tool is explicitly told to work only from the text it was given: never
 * invent facts, figures, names, dates or clauses that aren't in the
 * source, never silently change important data, and say so plainly when
 * context is missing instead of guessing.
 *
 * Fase 41 correction: the rewriter, summarizer and grammar-style checker
 * below are no longer independent copies — they re-export the shared
 * "rewrite"/"summarize"/"grammar" capability cores under
 * `src/lib/ai-capabilities/*`, which the public `/herramientas` tools call
 * too. The re-export keeps every name this file already exported (and thus
 * `document-ai.ts`'s wiring) completely unchanged — this is an extraction,
 * not a behavior change.
 */

export { NO_INVENTED_CONTENT_RULE, PRESERVE_KEY_DATA_RULE, TEXT_ONLY_NOTE } from "@/lib/ai-capabilities/shared-rules";
import { NO_INVENTED_CONTENT_RULE, PRESERVE_KEY_DATA_RULE, TEXT_ONLY_NOTE } from "@/lib/ai-capabilities/shared-rules";
export { buildRewriteSystemPrompt as buildDocumentRewriterSystemPrompt, buildRewritePrompt as buildDocumentRewriterPrompt } from "@/lib/ai-capabilities/rewrite/prompt";
export { buildSummarizeSystemPrompt as buildDocumentSummarizerSystemPrompt, buildSummarizePrompt as buildDocumentSummarizerPrompt } from "@/lib/ai-capabilities/summarize/prompt";
export { buildGrammarSystemPrompt as buildGrammarStyleCheckerSystemPrompt, buildGrammarPrompt as buildGrammarStyleCheckerPrompt } from "@/lib/ai-capabilities/grammar/prompt";

export function buildDocumentTranslatorSystemPrompt(context: string): string {
  return [
    "Eres el traductor de documentos de AI Content Hub.",
    NO_INVENTED_CONTENT_RULE,
    PRESERVE_KEY_DATA_RULE,
    TEXT_ONLY_NOTE,
    "Traduce el documento de forma completa y fiel al idioma de destino, conservando el significado, el tono y todos los datos exactos (cifras, nombres, fechas) del original. Si un término es ambiguo o no tiene traducción clara, indícalo entre corchetes en lugar de inventar una traducción.",
    "Devuelve únicamente el texto traducido, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildDocumentTranslatorPrompt(values: { documento: string; idiomaDestino: string; idiomaOrigen: string }): string {
  return [
    values.idiomaOrigen ? `Idioma de origen: ${values.idiomaOrigen}.` : "Idioma de origen: detéctalo del propio texto.",
    `Idioma de destino: ${values.idiomaDestino}.`,
    "Documento a traducir (usa solo este texto):",
    `"""${values.documento}"""`,
  ].join("\n");
}

export function buildContractSimplifierSystemPrompt(context: string): string {
  return [
    "Eres el simplificador de contratos y documentos legales de AI Content Hub. No eres un abogado y no ofreces asesoría legal — solo explicas el texto proporcionado en lenguaje más claro.",
    NO_INVENTED_CONTENT_RULE,
    PRESERVE_KEY_DATA_RULE,
    TEXT_ONLY_NOTE,
    "Reescribe el documento en lenguaje sencillo y directo, conservando exactamente las cifras, plazos, partes y condiciones del texto original — nunca elimines ni suavices una cláusula que cambie su significado legal. Si una cláusula es ambigua, señálalo en vez de interpretarla por tu cuenta.",
    "Devuelve únicamente el texto simplificado, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildContractSimplifierPrompt(values: { documento: string; idioma: string }): string {
  return [
    `Idioma: ${values.idioma}.`,
    "Texto del contrato o documento legal (usa solo este texto):",
    `"""${values.documento}"""`,
  ].join("\n");
}

export function buildMeetingNotesGeneratorSystemPrompt(context: string): string {
  return [
    "Eres el generador de notas de reunión de AI Content Hub.",
    NO_INVENTED_CONTENT_RULE,
    PRESERVE_KEY_DATA_RULE,
    TEXT_ONLY_NOTE,
    "Organiza las notas o transcripción en un formato claro de acta: temas tratados, decisiones tomadas y próximos pasos — usando únicamente lo que aparece en el texto proporcionado. Nunca inventes decisiones, responsables ni fechas que no se mencionen explícitamente; si algo no quedó claro, indícalo como pendiente de confirmar.",
    "Devuelve únicamente las notas de la reunión, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildMeetingNotesGeneratorPrompt(values: { notas: string; idioma: string }): string {
  return [
    `Idioma: ${values.idioma}.`,
    "Notas o transcripción de la reunión (usa solo este texto):",
    `"""${values.notas}"""`,
  ].join("\n");
}

export function buildExecutiveSummarySystemPrompt(context: string): string {
  return [
    "Eres el generador de resúmenes ejecutivos de AI Content Hub.",
    NO_INVENTED_CONTENT_RULE,
    PRESERVE_KEY_DATA_RULE,
    TEXT_ONLY_NOTE,
    "Condensa el documento en un resumen ejecutivo directo y orientado a decisiones, priorizando los puntos más relevantes para la audiencia indicada — sin añadir conclusiones ni recomendaciones que no se deriven directamente del texto.",
    "Devuelve únicamente el resumen ejecutivo, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildExecutiveSummaryPrompt(values: { documento: string; audiencia: string; idioma: string }): string {
  return [
    `Audiencia del resumen: ${values.audiencia}.`,
    `Idioma: ${values.idioma}.`,
    "Documento a resumir (usa solo este texto):",
    `"""${values.documento}"""`,
  ].join("\n");
}

export function buildBulletPointGeneratorSystemPrompt(context: string): string {
  return [
    "Eres el generador de puntos clave (bullet points) de AI Content Hub.",
    NO_INVENTED_CONTENT_RULE,
    PRESERVE_KEY_DATA_RULE,
    TEXT_ONLY_NOTE,
    "Convierte el documento en una lista de puntos clave clara y escaneable, cada uno con una sola idea, cubriendo únicamente el contenido presente en el texto original.",
    "Devuelve únicamente la lista de puntos, uno por línea, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildBulletPointGeneratorPrompt(values: { documento: string; cantidadPuntos: string; idioma: string }): string {
  return [
    `Cantidad de puntos deseada: ${values.cantidadPuntos}.`,
    `Idioma: ${values.idioma}.`,
    "Documento a convertir en puntos clave (usa solo este texto):",
    `"""${values.documento}"""`,
  ].join("\n");
}

export function buildFormalDocumentGeneratorSystemPrompt(context: string): string {
  return [
    "Eres el generador de documentos formales de AI Content Hub.",
    NO_INVENTED_CONTENT_RULE,
    PRESERVE_KEY_DATA_RULE,
    TEXT_ONLY_NOTE,
    "Redacta el documento en un registro formal y profesional, con la estructura habitual del tipo de documento indicado, usando únicamente el propósito y los datos que te proporcionen — nunca inventes remitente, destinatario, cargos ni datos de contacto que no se hayan dado.",
    "Devuelve únicamente el documento final, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildFormalDocumentGeneratorPrompt(values: { proposito: string; tipoDocumento: string; idioma: string }): string {
  return [
    `Tipo de documento: ${values.tipoDocumento}.`,
    `Idioma: ${values.idioma}.`,
    "Propósito y contenido a incluir (usa solo esta información):",
    `"""${values.proposito}"""`,
  ].join("\n");
}

export function buildDocumentAnalyzerSystemPrompt(context: string): string {
  return [
    "Eres el analizador de documentos de AI Content Hub.",
    NO_INVENTED_CONTENT_RULE,
    PRESERVE_KEY_DATA_RULE,
    TEXT_ONLY_NOTE,
    "Analiza el documento proporcionado según el enfoque indicado: identifica estructura, claridad, posibles incoherencias o vacíos de información, usando únicamente evidencia del propio texto. No emitas juicios sobre hechos externos que no puedas verificar en el documento.",
    "Devuelve únicamente el análisis, sin explicaciones adicionales fuera de él.",
    "",
    context,
  ].join("\n");
}

export function buildDocumentAnalyzerPrompt(values: { documento: string; enfoqueAnalisis: string; idioma: string }): string {
  return [
    `Enfoque del análisis: ${values.enfoqueAnalisis}.`,
    `Idioma: ${values.idioma}.`,
    "Documento a analizar (usa solo este texto):",
    `"""${values.documento}"""`,
  ].join("\n");
}
