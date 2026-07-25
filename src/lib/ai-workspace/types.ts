import { findAiTool } from "@/lib/ai-center/registry";

export type WorkspaceFilter = "all" | "favorites" | "recent";

export interface WorkspaceResult {
  id: string;
  title: string;
  body: string;
  language: string;
  contentType: string;
  isFavorite: boolean;
  createdAt: Date;
  updatedAt: Date;
  sourceTool: string | null;
  toolLabel: string | null;
  categoryLabel: string | null;
}

/** Structural subset of a Prisma ContentItem — kept minimal so this stays decoupled from the generated client's include-shape. */
export interface ContentItemLike {
  id: string;
  title: string;
  body: string;
  language: string;
  type: string;
  isFavorite: boolean;
  sourceTool: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Resolves the human label/category for a result from its stored tool slug
 * via the existing AI Center registry (read-only reuse — no AI Center file
 * is modified by this). Items without a recognized sourceTool (older rows,
 * or content created outside a registered tool) simply show as uncategorized.
 */
/**
 * Resolves the "?result=<id>" query param against the project's own,
 * already project-scoped results list — never the raw param. An id for
 * another project (or one that never existed) simply won't be found here,
 * so it's silently ignored instead of trusted or reported as an error.
 */
export function resolveHighlightId(results: WorkspaceResult[], requestedId: string | undefined | null): string | null {
  if (!requestedId) return null;
  return results.some((result) => result.id === requestedId) ? requestedId : null;
}

export function mapContentItemToWorkspaceResult(item: ContentItemLike): WorkspaceResult {
  const tool = item.sourceTool ? findAiTool(item.sourceTool) : undefined;
  return {
    id: item.id,
    title: item.title,
    body: item.body,
    language: item.language,
    contentType: item.type,
    isFavorite: item.isFavorite,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    sourceTool: item.sourceTool,
    toolLabel: tool?.label ?? null,
    categoryLabel: tool?.categoryLabel ?? null,
  };
}
