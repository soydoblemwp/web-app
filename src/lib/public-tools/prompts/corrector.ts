import { buildGrammarSystemPrompt, buildGrammarPrompt } from "@/lib/ai-capabilities/grammar/prompt";

/**
 * Fase 41 correction: this file no longer defines its own "grammar
 * correction" prompt — it calls the shared
 * `src/lib/ai-capabilities/grammar/prompt.ts` core directly, the same one
 * AI Center's Document AI grammar-style checker calls. The always-on
 * deterministic pass (spacing, punctuation, capitalization) remains this
 * tool's own, genuinely new logic — see
 * src/lib/public-tools/deterministic-corrections.ts.
 */
export function buildCorrectorSystemPrompt(): string {
  return buildGrammarSystemPrompt("");
}

export function buildCorrectorPrompt(sourceText: string): string {
  return buildGrammarPrompt({ documento: sourceText, idioma: "es" });
}
