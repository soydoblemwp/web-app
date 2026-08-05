import type { ContentStatus } from "@/generated/prisma/enums";

/** Display order for every select/list showing content status — matches the sidebar's "Resumen" tab spec exactly. */
export const CONTENT_STATUS_VALUES: ContentStatus[] = [
  "IDEA",
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHED",
  "ARCHIVED",
];

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  IDEA: "Idea",
  DRAFT: "Borrador",
  IN_REVIEW: "En revisión",
  APPROVED: "Aprobado",
  SCHEDULED: "Programado",
  PUBLISHED: "Publicado",
  ARCHIVED: "Archivado",
};

/** Baseline "how far along is this piece" per status — blended with checklist completion in estimateContentProgress. */
const STATUS_PROGRESS_BASELINE: Record<ContentStatus, number> = {
  IDEA: 10,
  DRAFT: 30,
  IN_REVIEW: 55,
  APPROVED: 75,
  SCHEDULED: 90,
  PUBLISHED: 100,
  ARCHIVED: 100,
};

/**
 * Deterministic 0-100 "% avance" shown in the Resumen tab — 70% status
 * baseline (where is this in the editorial pipeline) + 30% publish
 * checklist completion (how ready is it), so two DRAFT items with
 * different checklist progress still look different.
 */
export function estimateContentProgress(status: ContentStatus, checklistProgressPercent: number): number {
  const baseline = STATUS_PROGRESS_BASELINE[status];
  return Math.round(baseline * 0.7 + checklistProgressPercent * 0.3);
}
