import { z } from "zod";
import { PLATFORM_VALUES } from "@/lib/publishing/platform-specs";

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));
const stringArray = (maxItems = 30, maxLen = 100) => z.array(z.string().trim().max(maxLen)).max(maxItems).default([]);

export const publicationPlatformValues = PLATFORM_VALUES;
export const publicationStatusValues = [
  "IDEA",
  "DRAFT",
  "IN_REVIEW",
  "CHANGES_REQUESTED",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHING",
  "PUBLISHED",
  "FAILED",
  "ARCHIVED",
  "CANCELLED",
] as const;
export const publicationPriorityValues = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

/** Every field optional — the composer autosaves a partial patch, same convention as Fase 27/28's briefing/metadata patch actions. */
export const publicationPatchSchema = z.object({
  internalTitle: z.string().trim().max(300).optional(),
  platform: z.enum(publicationPlatformValues).optional(),
  format: optionalText(60),
  text: z.string().max(50_000).optional(),
  firstComment: optionalText(10_000),
  hashtags: stringArray(50, 60),
  cta: optionalText(300),
  link: optionalText(2000),
  altText: optionalText(1000),
  scheduledAt: optionalText(40),
  timezone: optionalText(100),
  assigneeId: z.string().cuid().nullable().optional(),
  approverId: z.string().cuid().nullable().optional(),
  status: z.enum(publicationStatusValues).optional(),
  priority: z.enum(publicationPriorityValues).optional(),
  campaignId: z.string().cuid().nullable().optional(),
  brandProfileId: z.string().cuid().nullable().optional(),
  notes: optionalText(4000),
});
export type PublicationPatchInput = z.infer<typeof publicationPatchSchema>;

export const createPublicationSchema = z.object({
  platform: z.enum(publicationPlatformValues),
  internalTitle: z.string().trim().min(1, "El título interno es obligatorio.").max(300),
  text: z.string().max(50_000).default(""),
  sourceContentId: z.string().cuid().optional(),
  sourcePieceId: z.string().cuid().optional(),
  campaignId: z.string().cuid().optional(),
  templateId: z.string().cuid().optional(),
  duplicateFromId: z.string().cuid().optional(),
});

export const createPublicationCommentSchema = z.object({
  action: z.enum(["SUBMITTED", "APPROVED", "CHANGES_REQUESTED", "COMMENTED", "CANCELLED"]),
  comment: z.string().trim().max(4000).optional().or(z.literal("")),
});

export const createPublicationTemplateSchema = z.object({
  postId: z.string().cuid(),
  name: z.string().trim().min(1, "El nombre es obligatorio.").max(200),
  description: optionalText(1000),
});

export const createPublicationSeriesSchema = z.object({
  frequency: z.enum(["DAILY", "WEEKLY", "SPECIFIC_DAYS", "MONTHLY", "CUSTOM_INTERVAL"]),
  daysOfWeek: stringArray(7, 10),
  intervalDays: z.number().int().min(1).max(365).optional().nullable(),
  startDate: z.string().trim().min(1),
  endDate: optionalText(40),
  platform: z.enum(publicationPlatformValues),
  internalTitle: z.string().trim().min(1).max(300),
  text: z.string().max(50_000).default(""),
  maxInstances: z.number().int().min(1).max(52).default(12),
});

export const checklistTemplateItemsSchema = z.array(z.object({ id: z.string().min(1).max(60), label: z.string().min(1).max(200) })).max(30);
