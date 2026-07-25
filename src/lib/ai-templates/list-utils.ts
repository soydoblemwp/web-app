import type { AiTemplateLike } from "@/lib/ai-templates/types";

export type AiTemplateSort = "recent" | "alphabetical";

export const AI_TEMPLATE_SORT_LABELS: Record<AiTemplateSort, string> = {
  recent: "Más recientes",
  alphabetical: "Alfabético (A-Z)",
};

export interface AiTemplateFilters {
  query?: string;
  category?: string | null;
  tag?: string | null;
  favoritesOnly?: boolean;
}

/** Client-side search/filter over an already user+project-scoped template list — same shape as filterSavedPrompts in src/lib/prompt-library/list-utils.ts. */
export function filterAiTemplates<T extends AiTemplateLike>(
  templates: T[],
  { query, category, tag, favoritesOnly }: AiTemplateFilters
): T[] {
  let list = templates;

  if (favoritesOnly) list = list.filter((template) => template.isFavorite);
  if (category) list = list.filter((template) => template.category === category);
  if (tag) list = list.filter((template) => template.tags.includes(tag));

  const q = query?.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (template) =>
        template.title.toLowerCase().includes(q) ||
        (template.description ?? "").toLowerCase().includes(q) ||
        template.content.toLowerCase().includes(q) ||
        (template.category ?? "").toLowerCase().includes(q) ||
        template.tags.some((t) => t.toLowerCase().includes(q)) ||
        template.variables.some((v) => v.toLowerCase().includes(q))
    );
  }

  return list;
}

/** Pure — never mutates the input array. */
export function sortAiTemplates<T extends AiTemplateLike>(templates: T[], sort: AiTemplateSort): T[] {
  const list = [...templates];
  if (sort === "alphabetical") return list.sort((a, b) => a.title.localeCompare(b.title));
  return list.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

export function getDistinctCategories(templates: AiTemplateLike[]): string[] {
  return Array.from(new Set(templates.map((t) => t.category).filter((c): c is string => Boolean(c)))).sort((a, b) =>
    a.localeCompare(b)
  );
}

export function getDistinctTags(templates: AiTemplateLike[]): string[] {
  return Array.from(new Set(templates.flatMap((t) => t.tags))).sort((a, b) => a.localeCompare(b));
}
