import type { SavedPromptLike } from "@/lib/prompt-library/types";

/** How many saved prompts get embedded in the assistant's context — bounded so the local model's context stays small and fast. */
export const ASSISTANT_CONTEXT_PROMPT_LIMIT = 8;
const CONTENT_PREVIEW_LENGTH = 500;

/**
 * Renders a bounded set of the user's saved prompts into a text block Chat
 * IA's general assistant prompt can read. This is the entire mechanism by
 * which "usa mi prompt favorito"/"abre el prompt SEO" works: the local model
 * already sees titles, categories, tags and a content preview for each
 * prompt in its own context on every turn, so it can quote/apply one when
 * asked — no orchestrator or intent-router change, no live tool call, just
 * more context text (same plumbing as buildBrandContext already uses).
 *
 * Pure by design so it's directly testable without a database: callers
 * (src/server/services/prompt-library.ts) fetch and pre-sort/limit the rows,
 * this only ever formats what it's given.
 */
export function buildPromptLibraryAssistantContext(prompts: SavedPromptLike[]): string {
  if (prompts.length === 0) return "";

  const lines = prompts.map((prompt) => {
    const meta = [prompt.category, ...prompt.tags].filter(Boolean).join(", ");
    const preview =
      prompt.content.length > CONTENT_PREVIEW_LENGTH
        ? `${prompt.content.slice(0, CONTENT_PREVIEW_LENGTH)}...`
        : prompt.content;
    return [
      `- "${prompt.title}"${prompt.isFavorite ? " (favorito)" : ""}${meta ? ` [${meta}]` : ""}:`,
      `  """${preview}"""`,
    ].join("\n");
  });

  return [
    "Prompts guardados en la biblioteca personal del usuario (Prompt Library). Si el usuario pide usar, abrir o aplicar uno de ellos — por ejemplo \"usa mi prompt favorito\", \"abre el prompt SEO\" o \"utiliza mi prompt para YouTube\" — identifícalo por título, categoría o etiquetas y aplica su contenido directamente en tu respuesta. Nunca inventes un prompt guardado que no aparezca en esta lista.",
    "",
    ...lines,
  ].join("\n");
}
