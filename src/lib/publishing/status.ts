import type { SocialPostStatus } from "@/generated/prisma/enums";

/** The 9 editorial-flow states from the spec, in pipeline order. IDEA/ARCHIVED (pre-existing enum values used elsewhere, e.g. src/app/.../social/) are valid but sit outside this Publishing Hub flow. */
export const EDITORIAL_STATUS_VALUES: SocialPostStatus[] = [
  "DRAFT",
  "IN_REVIEW",
  "CHANGES_REQUESTED",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHING",
  "PUBLISHED",
  "FAILED",
  "CANCELLED",
];

export const STATUS_LABELS: Record<SocialPostStatus, string> = {
  IDEA: "Idea",
  DRAFT: "Borrador",
  IN_REVIEW: "Listo para revisión",
  CHANGES_REQUESTED: "Cambios solicitados",
  APPROVED: "Aprobado",
  SCHEDULED: "Programado",
  PUBLISHING: "Publicando",
  PUBLISHED: "Publicado",
  FAILED: "Fallido",
  CANCELLED: "Cancelado",
  ARCHIVED: "Archivado",
};

export function isTerminalStatus(status: SocialPostStatus): boolean {
  return status === "PUBLISHED" || status === "CANCELLED" || status === "ARCHIVED";
}

/** A post can only ever be scheduled once it's approved — or approval isn't required at all for this project. Pure, deterministic gate (spec section 7: "impedir programación si requiere aprobación y no está aprobada"). */
export function canSchedule(status: SocialPostStatus, requireApproval: boolean): boolean {
  if (isTerminalStatus(status)) return false;
  if (!requireApproval) return true;
  return status === "APPROVED" || status === "SCHEDULED";
}

/** Same-user-approves-own-post guard (spec section 7). */
export function canApprove(params: { actorId: string; authorId: string; allowSelfApproval: boolean }): boolean {
  if (params.allowSelfApproval) return true;
  return params.actorId !== params.authorId;
}
