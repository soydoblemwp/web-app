import type { CampaignMetricType } from "@/generated/prisma/enums";

export const CAMPAIGN_METRIC_TYPE_VALUES: CampaignMetricType[] = [
  "REACH",
  "IMPRESSIONS",
  "CLICKS",
  "CONVERSIONS",
  "LEADS",
  "SALES",
  "ENGAGEMENT",
  "FOLLOWERS",
  "PLAYS",
  "OPEN_RATE",
  "CTR",
];

export const CAMPAIGN_METRIC_TYPE_LABELS: Record<CampaignMetricType, string> = {
  REACH: "Alcance",
  IMPRESSIONS: "Impresiones",
  CLICKS: "Clics",
  CONVERSIONS: "Conversiones",
  LEADS: "Leads",
  SALES: "Ventas",
  ENGAGEMENT: "Interacción",
  FOLLOWERS: "Seguidores",
  PLAYS: "Reproducciones",
  OPEN_RATE: "Tasa de apertura",
  CTR: "CTR",
};

/** Metrics expressed as a percentage — display/parsing hint only, no computation depends on it. */
export const CAMPAIGN_METRIC_IS_PERCENT: Record<CampaignMetricType, boolean> = {
  REACH: false,
  IMPRESSIONS: false,
  CLICKS: false,
  CONVERSIONS: false,
  LEADS: false,
  SALES: false,
  ENGAGEMENT: false,
  FOLLOWERS: false,
  PLAYS: false,
  OPEN_RATE: true,
  CTR: true,
};

export interface MetricProgress {
  percent: number;
  status: "on-track" | "behind" | "achieved" | "no-target";
}

/** Deterministic — never AI-derived, matches the same "computed live, never AI-scored" philosophy as the editor's SEO score. */
export function computeMetricProgress(target: number, current: number): MetricProgress {
  if (!Number.isFinite(target) || target <= 0) return { percent: 0, status: "no-target" };
  const percent = Math.round((current / target) * 100);
  if (percent >= 100) return { percent, status: "achieved" };
  if (percent >= 60) return { percent, status: "on-track" };
  return { percent, status: "behind" };
}
