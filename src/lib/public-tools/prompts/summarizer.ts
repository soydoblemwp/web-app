import { buildSummarizeSystemPrompt, buildSummarizePrompt } from "@/lib/ai-capabilities/summarize/prompt";

/**
 * Fase 41 correction: this file no longer defines its own "summarize"
 * prompt — it composes the shared `src/lib/ai-capabilities/summarize/prompt.ts`
 * core (the same one AI Center's Document AI summarizer calls) by mapping
 * this tool's summary modes onto that core's `longitud` field, and folding
 * the extra preserve/conclusion options into the `context` argument. The
 * extractive fallback (used when local AI is unavailable) remains this
 * tool's own, genuinely new logic — see
 * src/lib/public-tools/extractive-summary.ts.
 */
export type SummaryMode = "breve" | "detallado" | "puntos" | "ejecutivo" | "acciones" | "estudio";

export const SUMMARY_MODES: { id: SummaryMode; label: string }[] = [
  { id: "breve", label: "Resumen breve" },
  { id: "detallado", label: "Resumen detallado" },
  { id: "puntos", label: "Puntos principales" },
  { id: "ejecutivo", label: "Resumen ejecutivo" },
  { id: "acciones", label: "Acciones pendientes" },
  { id: "estudio", label: "Resumen para estudiar" },
];

function buildLongitud(mode: SummaryMode, maxPoints?: number): string {
  switch (mode) {
    case "breve":
      return "Resumen breve, de 2 a 4 frases, con las ideas esenciales";
    case "detallado":
      return "Resumen detallado que conserve los puntos importantes y su contexto";
    case "puntos":
      return `Lista numerada de los puntos principales, uno por línea${maxPoints ? `, máximo ${maxPoints} puntos` : ""}`;
    case "ejecutivo":
      return "Resumen ejecutivo breve orientado a la toma de decisiones, destacando conclusiones clave";
    case "acciones":
      return `Lista numerada únicamente con las acciones pendientes o tareas mencionadas o implícitas en el texto${maxPoints ? `, máximo ${maxPoints} puntos` : ""}`;
    case "estudio":
      return "Resumen orientado a estudiar el tema, organizando las ideas por bloques claros";
  }
}

export interface SummarizerOptions {
  mode: SummaryMode;
  maxPoints?: number;
  preserveNumbers: boolean;
  preserveNames: boolean;
  includeConclusion: boolean;
}

function buildSummarizerContext(options: SummarizerOptions): string {
  const lines: string[] = [];
  if (options.preserveNumbers) lines.push("Conserva las cifras y fechas relevantes del texto original.");
  if (options.preserveNames) lines.push("Conserva los nombres propios relevantes del texto original.");
  if (options.includeConclusion) lines.push("Termina con una conclusión breve.");
  return lines.join(" ");
}

export function buildSummarizerSystemPrompt(options: SummarizerOptions): string {
  return buildSummarizeSystemPrompt(buildSummarizerContext(options));
}

export function buildSummarizerPrompt(sourceText: string, mode: SummaryMode, maxPoints?: number): string {
  return buildSummarizePrompt({ documento: sourceText, longitud: buildLongitud(mode, maxPoints), idioma: "es" });
}
