import type { CampaignPieceStatus, CampaignPiecePriority } from "@/generated/prisma/enums";

/** Kanban column order — matches the spec's exact sequence. */
export const CAMPAIGN_PIECE_STATUS_VALUES: CampaignPieceStatus[] = [
  "IDEA",
  "PENDING",
  "IN_PRODUCTION",
  "IN_REVIEW",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHED",
  "CANCELLED",
];

export const CAMPAIGN_PIECE_STATUS_LABELS: Record<CampaignPieceStatus, string> = {
  IDEA: "Idea",
  PENDING: "Pendiente",
  IN_PRODUCTION: "En producción",
  IN_REVIEW: "En revisión",
  APPROVED: "Aprobado",
  SCHEDULED: "Programado",
  PUBLISHED: "Publicado",
  CANCELLED: "Cancelado",
};

export const CAMPAIGN_PIECE_PRIORITY_VALUES: CampaignPiecePriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export const CAMPAIGN_PIECE_PRIORITY_LABELS: Record<CampaignPiecePriority, string> = {
  LOW: "Baja",
  MEDIUM: "Media",
  HIGH: "Alta",
  URGENT: "Urgente",
};

export function isTerminalPieceStatus(status: CampaignPieceStatus): boolean {
  return status === "PUBLISHED" || status === "CANCELLED";
}
