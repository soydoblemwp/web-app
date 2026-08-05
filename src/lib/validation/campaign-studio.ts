import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));
const stringArray = (maxItems = 30, maxLen = 100) => z.array(z.string().trim().max(maxLen)).max(maxItems).default([]);

export const campaignPieceStatusValues = [
  "IDEA",
  "PENDING",
  "IN_PRODUCTION",
  "IN_REVIEW",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHED",
  "CANCELLED",
] as const;

export const campaignPiecePriorityValues = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

export const campaignMetricTypeValues = [
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
] as const;

/** Wizard steps 1-5 — every field optional so the wizard can autosave a partial draft at any step. */
export const campaignStatusValues = ["DRAFT", "PLANNED", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"] as const;

export const campaignBriefingSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  status: z.enum(campaignStatusValues).optional(),
  description: optionalText(2000),
  productOrService: optionalText(300),
  objective: optionalText(500),
  startDate: optionalText(40),
  endDate: optionalText(40),
  timezone: optionalText(100),
  budget: z.number().nonnegative().optional().nullable(),
  brandProfileId: z.string().cuid().nullable().optional(),

  audience: optionalText(1000),
  audienceLocation: optionalText(300),
  audienceAgeRange: optionalText(100),
  audienceInterests: stringArray(),
  audiencePainPoints: stringArray(),
  audienceNeeds: stringArray(),
  audienceObjections: stringArray(),
  audienceAwareness: optionalText(300),

  valueProposition: optionalText(1000),
  mainMessage: optionalText(1000),
  offer: optionalText(500),
  primaryCTA: optionalText(300),
  tone: optionalText(200),
  forbiddenWords: stringArray(),
  differentiators: stringArray(),

  channels: stringArray(20, 40),

  contentCount: z.number().int().min(0).max(500).optional().nullable(),
  frequencyPerWeek: z.number().int().min(0).max(50).optional().nullable(),
  preferredDays: stringArray(7, 20),
  preferredHours: stringArray(24, 20),
  desiredFormats: stringArray(),
});
export type CampaignBriefingInput = z.infer<typeof campaignBriefingSchema>;

export const createCampaignPillarSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio.").max(200),
  description: optionalText(1000),
  objective: optionalText(500),
  color: optionalText(20),
  percentage: z.number().int().min(0).max(100).optional().nullable(),
  formats: stringArray(),
  platforms: stringArray(),
  topics: stringArray(),
});

export const updateCampaignPillarSchema = createCampaignPillarSchema.partial();

export const createCampaignPieceSchema = z.object({
  pillarId: z.string().cuid().optional().nullable(),
  title: z.string().trim().min(1, "El título es obligatorio.").max(300),
  idea: optionalText(2000),
  platform: z.string().trim().min(1).max(40),
  format: optionalText(60),
  objective: optionalText(500),
  cta: optionalText(300),
  scheduledDate: optionalText(40),
  scheduledTime: optionalText(20),
  status: z.enum(campaignPieceStatusValues).optional(),
  priority: z.enum(campaignPiecePriorityValues).optional(),
  assigneeId: z.string().cuid().optional().nullable(),
  keywords: stringArray(),
  notes: optionalText(2000),
});

export const updateCampaignPieceSchema = createCampaignPieceSchema.partial().extend({
  id: z.string().cuid(),
});

export const createCampaignCommentSchema = z.object({
  pieceId: z.string().cuid(),
  body: z.string().trim().min(1, "El comentario no puede estar vacío.").max(4000),
  mentionedUserIds: z.array(z.string().cuid()).max(20).default([]),
});

export const createCampaignMetricGoalSchema = z.object({
  metricType: z.enum(campaignMetricTypeValues),
  targetValue: z.number().nonnegative(),
});

export const updateCampaignMetricValueSchema = z.object({
  metricGoalId: z.string().cuid(),
  currentValue: z.number().nonnegative(),
});

export const createCampaignTemplateSchema = z.object({
  campaignId: z.string().cuid(),
  name: z.string().trim().min(1, "El nombre es obligatorio.").max(200),
  description: optionalText(1000),
});
