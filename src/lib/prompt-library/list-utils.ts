import type { SavedPromptLike } from "@/lib/prompt-library/types";

export type PromptLibrarySort = "recent" | "most-used" | "alphabetical" | "last-used";

export const PROMPT_LIBRARY_SORT_LABELS: Record<PromptLibrarySort, string> = {
  recent: "Más recientes",
  "most-used": "Más usados",
  alphabetical: "Alfabético (A-Z)",
  "last-used": "Último uso",
};

export interface PromptLibraryFilters {
  query?: string;
  category?: string | null;
  tag?: string | null;
  favoritesOnly?: boolean;
}

/** Client-side search/filter over an already project+user-scoped prompt list — same pattern as AiWorkspaceHub's own filtering. */
export function filterSavedPrompts<T extends SavedPromptLike>(
  prompts: T[],
  { query, category, tag, favoritesOnly }: PromptLibraryFilters
): T[] {
  let list = prompts;

  if (favoritesOnly) list = list.filter((prompt) => prompt.isFavorite);
  if (category) list = list.filter((prompt) => prompt.category === category);
  if (tag) list = list.filter((prompt) => prompt.tags.includes(tag));

  const q = query?.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (prompt) =>
        prompt.title.toLowerCase().includes(q) ||
        (prompt.description ?? "").toLowerCase().includes(q) ||
        prompt.content.toLowerCase().includes(q) ||
        (prompt.category ?? "").toLowerCase().includes(q) ||
        prompt.tags.some((t) => t.toLowerCase().includes(q))
    );
  }

  return list;
}

/** Pure — never mutates the input array, so callers can safely reuse the original fetched list across re-sorts. */
export function sortSavedPrompts<T extends SavedPromptLike>(prompts: T[], sort: PromptLibrarySort): T[] {
  const list = [...prompts];

  if (sort === "most-used") return list.sort((a, b) => b.useCount - a.useCount);
  if (sort === "alphabetical") return list.sort((a, b) => a.title.localeCompare(b.title));
  if (sort === "last-used") {
    return list.sort((a, b) => {
      if (!a.lastUsedAt && !b.lastUsedAt) return 0;
      if (!a.lastUsedAt) return 1;
      if (!b.lastUsedAt) return -1;
      return b.lastUsedAt.getTime() - a.lastUsedAt.getTime();
    });
  }
  // "recent" (default): most recently edited first.
  return list.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

export function getDistinctCategories(prompts: SavedPromptLike[]): string[] {
  return Array.from(new Set(prompts.map((p) => p.category).filter((c): c is string => Boolean(c)))).sort((a, b) =>
    a.localeCompare(b)
  );
}

export function getDistinctTags(prompts: SavedPromptLike[]): string[] {
  return Array.from(new Set(prompts.flatMap((p) => p.tags))).sort((a, b) => a.localeCompare(b));
}
