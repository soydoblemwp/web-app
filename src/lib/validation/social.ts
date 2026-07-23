import { z } from "zod";

export const socialPlatformValues = [
  "INSTAGRAM",
  "FACEBOOK",
  "TIKTOK",
  "YOUTUBE",
  "YOUTUBE_SHORTS",
  "X",
  "LINKEDIN",
  "PINTEREST",
] as const;

export const socialPostStatusValues = [
  "IDEA",
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHED",
  "FAILED",
  "ARCHIVED",
] as const;

export const createSocialPostSchema = z.object({
  projectId: z.string().cuid(),
  platform: z.enum(socialPlatformValues),
  postType: z.string().trim().min(1).max(60),
  internalTitle: z.string().trim().max(200).optional().or(z.literal("")),
  text: z.string().trim().min(1, "El texto de la publicación es obligatorio.").max(10_000),
  scheduledAt: z.string().datetime().optional().or(z.literal("")),
  campaignId: z.string().cuid().optional().or(z.literal("")),
  hashtags: z.array(z.string().trim().max(60)).max(30).default([]),
  cta: z.string().trim().max(300).optional().or(z.literal("")),
  link: z.string().trim().url().optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const updateSocialPostSchema = z.object({
  id: z.string().cuid(),
  text: z.string().trim().min(1).max(10_000).optional(),
  status: z.enum(socialPostStatusValues).optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
});

export const campaignStatusValues = [
  "DRAFT",
  "PLANNED",
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "ARCHIVED",
] as const;

export const createCampaignSchema = z.object({
  projectId: z.string().cuid(),
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  objective: z.string().trim().max(500).optional().or(z.literal("")),
  audience: z.string().trim().max(300).optional().or(z.literal("")),
  startDate: z.string().datetime().optional().or(z.literal("")),
  endDate: z.string().datetime().optional().or(z.literal("")),
  primaryCTA: z.string().trim().max(300).optional().or(z.literal("")),
});
