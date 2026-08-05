import { NO_INVENTED_CONTENT_RULE, PRESERVE_KEY_DATA_RULE, TEXT_ONLY_NOTE } from "@/lib/ai-capabilities/shared-rules";

/**
 * The single "summarize arbitrary text" capability, shared by AI Center's
 * Document AI summarizer (re-exported under its original
 * `buildDocumentSummarizerSystemPrompt`/`buildDocumentSummarizerPrompt`
 * names) and the public `/herramientas/resumidor-de-textos` tool's local-AI
 * path (its extractive fallback remains its own, genuinely new, deterministic
 * logic — see src/lib/public-tools/extractive-summary.ts).
 */
export function buildSummarizeSystemPrompt(context: string): string {
  return [
    "Eres el resumidor de documentos de AI Content Hub.",
    NO_INVENTED_CONTENT_RULE,
    PRESERVE_KEY_DATA_RULE,
    TEXT_ONLY_NOTE,
    "Produce un resumen fiel al documento original, con la extensión indicada, cubriendo únicamente las ideas que realmente aparecen en el texto.",
    "Devuelve únicamente el resumen final, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export interface SummarizeValues {
  documento: string;
  longitud: string;
  idioma: string;
}

export function buildSummarizePrompt(values: SummarizeValues): string {
  return [
    `Longitud deseada del resumen: ${values.longitud}.`,
    `Idioma: ${values.idioma}.`,
    "Documento a resumir (usa solo este texto):",
    `"""${values.documento}"""`,
  ].join("\n");
}
