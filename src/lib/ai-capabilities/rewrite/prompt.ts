import { NO_INVENTED_CONTENT_RULE, PRESERVE_KEY_DATA_RULE, TEXT_ONLY_NOTE } from "@/lib/ai-capabilities/shared-rules";

/**
 * The single "rewrite arbitrary text" capability, shared by AI Center's
 * Document AI rewriter (`src/lib/ai-center/tools/document-ai-prompts.ts`,
 * which re-exports these two functions under their original
 * `buildDocumentRewriterSystemPrompt`/`buildDocumentRewriterPrompt` names so
 * its wiring in `document-ai.ts` never changed) and the public
 * `/herramientas/reescritor-de-textos` tool. Text is identical to what
 * shipped as Document AI's rewriter before this correction — this is an
 * extraction, not a rewording.
 */
export function buildRewriteSystemPrompt(context: string): string {
  return [
    "Eres el reescritor de documentos de AI Content Hub.",
    NO_INVENTED_CONTENT_RULE,
    PRESERVE_KEY_DATA_RULE,
    TEXT_ONLY_NOTE,
    "Reescribe el documento con el tono indicado, conservando el significado original y todos los datos importantes — solo cambia la redacción, nunca los hechos.",
    "Devuelve únicamente el texto reescrito, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export interface RewriteValues {
  documento: string;
  tono: string;
  idioma: string;
}

export function buildRewritePrompt(values: RewriteValues): string {
  return [
    `Tono deseado: ${values.tono}.`,
    `Idioma: ${values.idioma}.`,
    "Documento a reescribir (usa solo este texto):",
    `"""${values.documento}"""`,
  ].join("\n");
}
