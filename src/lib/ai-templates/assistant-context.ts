import type { AiTemplateLike } from "@/lib/ai-templates/types";

/** How many templates get embedded in the assistant's context — bounded so the local model's context stays small, same rationale as Prompt Library's ASSISTANT_CONTEXT_PROMPT_LIMIT. */
export const ASSISTANT_CONTEXT_TEMPLATE_LIMIT = 8;
const CONTENT_PREVIEW_LENGTH = 500;

/**
 * Renders a bounded set of the user's AI Templates into a text block Chat
 * IA's general assistant prompt can read — the same mechanism as
 * src/lib/prompt-library/assistant-context.ts, so "usa mi template
 * YouTube"/"abre el template SEO"/"completa mi template Email" work without
 * any orchestrator or intent-router change: the model already sees each
 * template's title, category, tags, variable names and a content preview on
 * every turn, and can fill {{variable}} placeholders directly in its reply
 * using whatever the user provides in the same message.
 */
export function buildAiTemplatesAssistantContext(templates: AiTemplateLike[]): string {
  if (templates.length === 0) return "";

  const lines = templates.map((template) => {
    const meta = [template.category, ...template.tags].filter(Boolean).join(", ");
    const preview =
      template.content.length > CONTENT_PREVIEW_LENGTH
        ? `${template.content.slice(0, CONTENT_PREVIEW_LENGTH)}...`
        : template.content;
    return [
      `- "${template.title}"${template.isFavorite ? " (favorito)" : ""}${meta ? ` [${meta}]` : ""}`,
      template.variables.length ? `  Variables: ${template.variables.map((v) => `{{${v}}}`).join(", ")}` : "  Variables: ninguna",
      `  """${preview}"""`,
    ].join("\n");
  });

  return [
    "Templates guardados en la biblioteca personal del usuario (AI Templates). Un template es una estructura reutilizable con variables {{como_esta}} — distinta de un prompt guardado. Si el usuario pide usar, abrir o completar uno — por ejemplo \"usa mi template YouTube\", \"abre el template SEO\" o \"completa mi template Email\" — identifícalo por título, categoría o etiquetas, y rellena sus variables con la información que el propio usuario te dé en el mensaje. Si falta el valor de alguna variable, pregúntalo en vez de inventarlo. Nunca inventes un template que no aparezca en esta lista.",
    "",
    ...lines,
  ].join("\n");
}
