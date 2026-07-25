import type { WorkflowLike } from "@/lib/ai-workflows/types";

export type WorkflowSort = "recent" | "alphabetical";

export const WORKFLOW_SORT_LABELS: Record<WorkflowSort, string> = {
  recent: "Más recientes",
  alphabetical: "Alfabético (A-Z)",
};

export interface WorkflowFilters {
  query?: string;
  category?: string | null;
  tag?: string | null;
  favoritesOnly?: boolean;
  activeOnly?: boolean;
}

/** Client-side search/filter over an already user+project-scoped workflow list — same shape as filterSavedPrompts/filterAiTemplates. */
export function filterWorkflows<T extends WorkflowLike>(
  workflows: T[],
  { query, category, tag, favoritesOnly, activeOnly }: WorkflowFilters
): T[] {
  let list = workflows;

  if (favoritesOnly) list = list.filter((workflow) => workflow.isFavorite);
  if (activeOnly) list = list.filter((workflow) => workflow.isActive);
  if (category) list = list.filter((workflow) => workflow.category === category);
  if (tag) list = list.filter((workflow) => workflow.tags.includes(tag));

  const q = query?.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (workflow) =>
        workflow.name.toLowerCase().includes(q) ||
        (workflow.description ?? "").toLowerCase().includes(q) ||
        (workflow.category ?? "").toLowerCase().includes(q) ||
        workflow.tags.some((t) => t.toLowerCase().includes(q)) ||
        workflow.steps.some((step) => step.label.toLowerCase().includes(q))
    );
  }

  return list;
}

/** Pure — never mutates the input array. */
export function sortWorkflows<T extends WorkflowLike>(workflows: T[], sort: WorkflowSort): T[] {
  const list = [...workflows];
  if (sort === "alphabetical") return list.sort((a, b) => a.name.localeCompare(b.name));
  return list.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

export function getDistinctCategories(workflows: WorkflowLike[]): string[] {
  return Array.from(new Set(workflows.map((w) => w.category).filter((c): c is string => Boolean(c)))).sort((a, b) =>
    a.localeCompare(b)
  );
}

export function getDistinctTags(workflows: WorkflowLike[]): string[] {
  return Array.from(new Set(workflows.flatMap((w) => w.tags))).sort((a, b) => a.localeCompare(b));
}
