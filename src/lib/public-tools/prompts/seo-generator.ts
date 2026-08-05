import {
  buildSeoTitlesSystemPrompt as buildSharedSeoTitlesSystemPrompt,
  buildSeoTitlesPrompt as buildSharedSeoTitlesPrompt,
} from "@/lib/ai-capabilities/seo-titles/prompt";
import {
  buildSeoMetaDescriptionSystemPrompt as buildSharedSeoMetaDescriptionSystemPrompt,
  buildSeoMetaDescriptionPrompt as buildSharedSeoMetaDescriptionPrompt,
} from "@/lib/ai-capabilities/seo-meta-description/prompt";
import { NO_REAL_METRICS_RULE } from "@/lib/ai-capabilities/shared-rules";

/**
 * Fase 41 correction: this file no longer defines its own "SEO titles" /
 * "meta description" prompts — it composes the shared
 * `src/lib/ai-capabilities/seo-titles` and `seo-meta-description` cores
 * (the same ones AI Center's Blog & SEO title/meta-description generators
 * call) by folding this tool's extra intent/audience/tone/brand fields into
 * the `context` argument those cores already accept. External function
 * names (`buildSeoTitlesSystemPrompt`, etc.) are unchanged so
 * `seo-generator-tool.tsx` needed no changes beyond this file.
 */
export interface SeoGeneratorInput {
  topic: string;
  keyword: string;
  intent: string;
  audience: string;
  tone: string;
  brand?: string;
}

function buildExtraContext(input: SeoGeneratorInput): string {
  return [
    NO_REAL_METRICS_RULE,
    `Intención de búsqueda: ${input.intent}.`,
    `Audiencia: ${input.audience}.`,
    `Tono: ${input.tone}.`,
    input.brand ? `Marca: ${input.brand}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildSeoTitlesSystemPrompt(input: SeoGeneratorInput): string {
  return buildSharedSeoTitlesSystemPrompt(buildExtraContext(input));
}

export function buildSeoMetaDescriptionsSystemPrompt(input: SeoGeneratorInput): string {
  return buildSharedSeoMetaDescriptionSystemPrompt(buildExtraContext(input));
}

export function buildSeoTitlesPrompt(input: SeoGeneratorInput): string {
  return buildSharedSeoTitlesPrompt({ tema: input.topic, palabraClave: input.keyword, idioma: "es", cantidad: "5" });
}

export function buildSeoMetaDescriptionsPrompt(input: SeoGeneratorInput): string {
  return buildSharedSeoMetaDescriptionPrompt({ tema: input.topic, palabraClave: input.keyword, idioma: "es", cantidad: "5" });
}

/** Matches Unicode combining diacritical marks (U+0300-U+036F) left behind by NFD normalization — built from char codes rather than a literal-character regex to keep the source legible. */
const COMBINING_DIACRITICS_PATTERN = new RegExp(`[\\u0300-\\u036f]`, "g");

/** Deterministic, AI-free slug suggestion — the slug never depends on the model, so it's always available even before generating. */
export function slugifyTopic(topic: string, keyword?: string): string {
  const base = `${keyword?.trim() ? keyword : topic}`
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS_PATTERN, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  return base.slice(0, 60).replace(/-$/, "");
}
