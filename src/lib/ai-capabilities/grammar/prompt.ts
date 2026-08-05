import { NO_INVENTED_CONTENT_RULE, PRESERVE_KEY_DATA_RULE, TEXT_ONLY_NOTE } from "@/lib/ai-capabilities/shared-rules";

/**
 * The single "grammar/style correction" capability, shared by AI Center's
 * Document AI grammar-style checker (re-exported under its original
 * `buildGrammarStyleCheckerSystemPrompt`/`buildGrammarStyleCheckerPrompt`
 * names) and the public `/herramientas/corrector-de-textos` tool's optional
 * advanced-AI pass (its always-on deterministic pass — spacing, punctuation,
 * capitalization — remains its own, genuinely new logic; see
 * src/lib/public-tools/deterministic-corrections.ts).
 */
export function buildGrammarSystemPrompt(context: string): string {
  return [
    "Eres el corrector de gramática y estilo de AI Content Hub.",
    NO_INVENTED_CONTENT_RULE,
    PRESERVE_KEY_DATA_RULE,
    TEXT_ONLY_NOTE,
    "Corrige ortografía, gramática, puntuación y estilo del documento sin cambiar su significado, su estructura de ideas ni ningún dato factual. No añadas contenido nuevo ni elimines información.",
    "Devuelve únicamente el texto corregido, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export interface GrammarValues {
  documento: string;
  idioma: string;
}

export function buildGrammarPrompt(values: GrammarValues): string {
  return [
    `Idioma del texto: ${values.idioma}.`,
    "Documento a corregir (usa solo este texto):",
    `"""${values.documento}"""`,
  ].join("\n");
}
