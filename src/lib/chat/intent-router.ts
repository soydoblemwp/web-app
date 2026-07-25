import { findToolDefinition, listToolDefinitions } from "@/lib/ai-center/tools/registry";

/**
 * Chat IA's internal tool router. There is no keyword list here — routing
 * is a decision made by the same local model every other tool already
 * uses (see chat-panel.tsx), via one extra, invisible classification
 * generation before the real reply. This module only builds that
 * classifier's prompt and parses/validates its answer; it never calls the
 * model itself and never duplicates a single tool's prompt — it only reads
 * the label/description already declared on each AiToolDefinition.
 *
 * Adding a routable tool for a future platform requires zero changes here:
 * once it's registered in src/lib/ai-center/tools/registry.ts, it
 * automatically appears in the classifier's option list.
 */

export const NO_TOOL_INTENT = "NONE";

export interface RoutableTool {
  slug: string;
  label: string;
  description: string;
}

export function listRoutableTools(): RoutableTool[] {
  return listToolDefinitions().map(({ slug, label, description }) => ({ slug, label, description }));
}

export function buildIntentClassifierSystemPrompt(): string {
  const tools = listRoutableTools();
  return [
    "Eres el clasificador de intención interno del Chat IA de AI Content Hub.",
    "No conversas con el usuario ni explicas nada — tu única salida es una palabra.",
    "Decide si el último mensaje del usuario coincide con alguna de estas herramientas especializadas:",
    "",
    ...tools.map((tool) => `- ${tool.slug}: ${tool.description}`),
    "",
    "Reglas:",
    `1. Si el mensaje coincide claramente con una herramienta, responde solo con su slug exacto (ej: "${tools[0]?.slug ?? "youtube-titulos"}").`,
    "2. Si el mensaje pide refinar, repetir, acortar, alargar, cambiar el tono o traducir algo generado en un turno anterior (por ejemplo \"haz otros\", \"más cortos\", \"tradúcelos\"), y ese turno anterior usó una de estas herramientas, responde con el slug de esa misma herramienta.",
    `3. Si es conversación general o no coincide con ninguna herramienta, responde solo: ${NO_TOOL_INTENT}`,
    "Responde con una única palabra: el slug exacto o NONE. Nunca añadas explicaciones ni puntuación extra.",
  ].join("\n");
}

/**
 * Validates the classifier's raw answer against the real, current tool
 * registry — the model's output is never trusted blindly. Anything that
 * isn't an exact, currently-registered slug resolves to `null` (general
 * chat), the same safe fallback used when the model says NONE outright.
 */
export function parseIntentClassifierResponse(raw: string): string | null {
  const firstLine = raw.trim().split("\n")[0] ?? "";
  const cleaned = firstLine
    .trim()
    .toLowerCase()
    .replace(/^[.,;:!?"'`]+/g, "")
    .replace(/[.,;:!?"'`]+$/g, "");

  if (!cleaned || cleaned === NO_TOOL_INTENT.toLowerCase()) return null;
  return findToolDefinition(cleaned) ? cleaned : null;
}
