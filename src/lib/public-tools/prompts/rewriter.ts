import { buildRewriteSystemPrompt, buildRewritePrompt } from "@/lib/ai-capabilities/rewrite/prompt";

/**
 * Fase 41 correction: this file no longer defines its own "rewrite" prompt
 * — it composes the shared `src/lib/ai-capabilities/rewrite/prompt.ts` core
 * (the same one AI Center's Document AI rewriter calls) with the public
 * tool's extra tone/preserve options folded into the `tono`/`context`
 * arguments that core already accepts. "Naturalizar texto" (spec section 7
 * of the correction) replaces the old standalone "natural" tone instead of
 * existing alongside it, since both meant the same thing — keeping both
 * would have reintroduced exactly the kind of duplicate capability this
 * correction is about.
 */
export type RewriterTone = "claridad" | "profesional" | "sencillo" | "persuasivo" | "educativo" | "mas-corto" | "mas-detallado" | "naturalizar";

export const REWRITER_TONES: { id: RewriterTone; label: string }[] = [
  { id: "claridad", label: "Más claro" },
  { id: "profesional", label: "Profesional" },
  { id: "naturalizar", label: "Naturalizar texto" },
  { id: "sencillo", label: "Sencillo" },
  { id: "persuasivo", label: "Persuasivo" },
  { id: "educativo", label: "Educativo" },
  { id: "mas-corto", label: "Más corto" },
  { id: "mas-detallado", label: "Más detallado" },
];

/** Honest, required disclaimer shown in the UI whenever "naturalizar" is selected — never claims detector evasion (spec section 7). */
export const NATURALIZE_DISCLAIMER =
  "Esta función mejora la naturalidad y la legibilidad. No garantiza resultados frente a detectores automáticos.";

const TONE_DESCRIPTIONS: Record<RewriterTone, string> = {
  claridad: "más claro y fácil de entender, sin perder matices importantes",
  profesional: "profesional y cuidado, adecuado para un contexto de negocio",
  naturalizar:
    "más natural: mejora el ritmo, las transiciones entre ideas, la claridad, reduce repeticiones y varía la estructura de las oraciones, sin cambiar el significado",
  sencillo: "sencillo, con palabras y frases simples, evitando tecnicismos innecesarios",
  persuasivo: "persuasivo, resaltando los beneficios de forma honesta, sin exagerar ni inventar datos",
  educativo: "educativo, explicando los conceptos paso a paso",
  "mas-corto": "notablemente más breve, conservando solo las ideas esenciales",
  "mas-detallado": "con más contexto y detalle sobre las ideas ya presentes, sin inventar hechos nuevos que no estén implícitos en el original",
};

export interface RewriterOptions {
  tone: RewriterTone;
  preserveNames: boolean;
  preserveNumbers: boolean;
  preserveLinks: boolean;
}

function buildPreserveContext(options: RewriterOptions): string {
  const lines: string[] = [];
  if (options.preserveNames) lines.push("Conserva exactamente los nombres propios que aparezcan en el texto.");
  if (options.preserveNumbers) lines.push("Conserva exactamente todas las cifras, fechas y cantidades del texto original.");
  if (options.preserveLinks) lines.push("Conserva exactamente cualquier URL o enlace que aparezca en el texto.");
  if (options.tone === "naturalizar") {
    lines.push("No prometas ni afirmes que el resultado evade detectores automáticos ni que es indistinguible de un texto humano — solo mejora naturalidad y legibilidad.");
  }
  return lines.join(" ");
}

export function buildRewriterSystemPrompt(options: RewriterOptions): string {
  return buildRewriteSystemPrompt(buildPreserveContext(options));
}

export function buildRewriterPrompt(sourceText: string, tone: RewriterTone): string {
  return buildRewritePrompt({ documento: sourceText, tono: TONE_DESCRIPTIONS[tone], idioma: "es" });
}
