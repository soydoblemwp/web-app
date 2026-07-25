import type { WorkflowStep } from "@/lib/ai-workflows/engine";

/**
 * Structural subset of a Prisma Workflow — kept minimal so this stays
 * decoupled from the generated client's include-shape, same convention as
 * SavedPromptLike/AiTemplateLike/BrandProfileLike. `steps` is typed here as
 * the engine's own WorkflowStep[] (the JSON column's real shape), not
 * Prisma's generic JsonValue.
 */
export interface WorkflowLike {
  id: string;
  projectId: string | null;
  name: string;
  description: string | null;
  category: string | null;
  tags: string[];
  isFavorite: boolean;
  isActive: boolean;
  steps: WorkflowStep[];
  variables: string[];
  /** Legacy/frozen — see Workflow.version in prisma/schema.prisma. publishedVersion is authoritative for the lifecycle UI. */
  version: number;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  publishedVersion: number | null;
  activeRevisionId: string | null;
  editVersion: number;
  hasUnpublishedChanges: boolean;
  lastPublishedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
