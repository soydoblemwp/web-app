import {
  buildStructuredSystemPrompt,
  parseStructuredText,
  buildStructuredZodSchema,
  repairStructuredOutput,
  isStructuredOutputEmpty,
  type StructuredRecord,
} from "@/lib/agents/structured-output";
import type { OutputFieldSpec } from "@/lib/agents/types";
import type { KnowledgeQueryMode } from "@/lib/knowledge/types";

/**
 * The controlled RAG answer prompt (spec sections 16/17/19) — reuses the
 * SAME structured-output engine every AI Agent Studio agent uses (never a
 * second parser). The AI only ever sees chunks the caller already
 * authorized/retrieved; it never receives full documents, never IDs beyond
 * the numbered [n] labels needed to cite them.
 */
export const KNOWLEDGE_ANSWER_FIELDS: OutputFieldSpec[] = [
  { marker: "RESPUESTA", field: "answer", kind: "text", maxLength: 4000 },
  { marker: "HECHOS_RESPALDADOS", field: "supportedFacts", kind: "list", maxItems: 20, maxLength: 500 },
  { marker: "INFERENCIAS", field: "inferences", kind: "list", maxItems: 15, maxLength: 500 },
  { marker: "RECOMENDACIONES", field: "recommendations", kind: "list", maxItems: 15, maxLength: 500 },
  { marker: "INFO_FALTANTE", field: "missingInfo", kind: "list", maxItems: 15, maxLength: 500 },
];

export interface KnowledgeAnswerChunk {
  label: number;
  sourceTitle: string;
  locationLabel?: string;
  text: string;
}

export interface KnowledgeAnswerPromptInput {
  question: string;
  mode: KnowledgeQueryMode;
  language?: string;
  chunks: KnowledgeAnswerChunk[];
  brandContext?: string;
}

const ROLE = "Eres el asistente de la base de conocimiento de un proyecto en AI Content Hub. Respondes preguntas usando ÚNICAMENTE los fragmentos de fuentes numerados que se te proporcionan.";

export function buildKnowledgeAnswerPrompt(input: KnowledgeAnswerPromptInput): { systemPrompt: string; userPrompt: string } {
  const extra: string[] = [
    "Cada fragmento de contexto está numerado como [n]. Cuando una afirmación de tu respuesta se apoye en un fragmento, referencia su número entre corchetes, ej. \"...como se indica en [2].\"",
    "NUNCA inventes hechos, cifras ni fuentes que no estén en los fragmentos proporcionados.",
    "En HECHOS_RESPALDADOS lista afirmaciones que los fragmentos dicen literalmente, cada una con su [n]. En INFERENCIAS lista deducciones razonables tuyas, nunca presentadas como hechos literales. En RECOMENDACIONES, sugerencias de acción. En INFO_FALTANTE, qué información necesitarías y no está disponible en los fragmentos.",
    input.mode === "SOURCES_ONLY"
      ? "Responde ÚNICAMENTE con lo que dicen los fragmentos. Si no hay evidencia suficiente para responder, dilo explícitamente en RESPUESTA y dejalo reflejado en INFO_FALTANTE — no completes con conocimiento general."
      : "Puedes complementar con conocimiento general SOLO cuando los fragmentos no alcancen, pero debes escribir literalmente \"[conocimiento general]\" justo antes de cualquier parte de RESPUESTA que no esté respaldada por un fragmento numerado — nunca le asignes un número [n] falso a algo que no viene de los fragmentos.",
    input.language ? `Responde en idioma: ${input.language}.` : "",
  ].filter(Boolean);

  const systemPrompt = buildStructuredSystemPrompt(ROLE, KNOWLEDGE_ANSWER_FIELDS, input.brandContext ?? "", extra);

  const userPromptLines = [`Pregunta: ${input.question}`, ""];
  if (input.chunks.length > 0) {
    userPromptLines.push("Fragmentos disponibles:");
    for (const chunk of input.chunks) {
      userPromptLines.push(`[${chunk.label}] (${chunk.sourceTitle}${chunk.locationLabel ? ` — ${chunk.locationLabel}` : ""}):\n${chunk.text}`);
    }
  } else {
    userPromptLines.push("No se encontraron fragmentos relevantes en las fuentes seleccionadas.");
  }

  return { systemPrompt, userPrompt: userPromptLines.join("\n") };
}

export interface KnowledgeAnswerOutcome {
  status: "completed" | "failed";
  output?: StructuredRecord;
  errorMessage?: string;
}

export function parseKnowledgeAnswer(rawOutput: string): KnowledgeAnswerOutcome {
  const parsed = parseStructuredText(rawOutput, KNOWLEDGE_ANSWER_FIELDS);
  if (isStructuredOutputEmpty(parsed)) {
    return { status: "failed", errorMessage: "La IA no devolvió una respuesta utilizable. Puedes reintentar." };
  }
  const schema = buildStructuredZodSchema(KNOWLEDGE_ANSWER_FIELDS);
  const validated = schema.safeParse(parsed);
  if (validated.success) return { status: "completed", output: validated.data };
  const { repaired } = repairStructuredOutput(parsed, KNOWLEDGE_ANSWER_FIELDS);
  return { status: "completed", output: repaired };
}
