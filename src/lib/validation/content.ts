import { z } from "zod";

export const contentTypeValues = [
  "ARTICLE",
  "BLOG_POST",
  "PRODUCT_DESCRIPTION",
  "EMAIL",
  "NEWSLETTER",
  "VIDEO_SCRIPT",
  "AD",
  "LANDING_PAGE",
  "SERVICE_DESCRIPTION",
  "FAQ",
  "CALL_TO_ACTION",
  "SOCIAL_TEXT",
  "TITLE",
  "INTRO",
  "CONCLUSION",
  "SUMMARY",
  "OTHER",
] as const;

export const createContentItemSchema = z.object({
  projectId: z.string().cuid(),
  type: z.enum(contentTypeValues),
  title: z.string().trim().min(1, "El título es obligatorio.").max(300),
  body: z.string().max(50_000).default(""),
  language: z.string().trim().min(2).max(10).default("es"),
  targetAudience: z.string().trim().max(300).optional().or(z.literal("")),
  tone: z.string().trim().max(200).optional().or(z.literal("")),
  keywords: z.array(z.string().trim().max(60)).max(30).default([]),
  cta: z.string().trim().max(300).optional().or(z.literal("")),
});

export const contentStatusValues = [
  "IDEA",
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHED",
  "ARCHIVED",
] as const;

export const updateContentItemSchema = z.object({
  id: z.string().cuid(),
  title: z.string().trim().min(1).max(300).optional(),
  body: z.string().max(50_000).optional(),
  status: z.enum(contentStatusValues).optional(),
  isFavorite: z.boolean().optional(),
  /** Optional label for the ContentVersion snapshot this update creates (see updateContentItemAction). */
  note: z.string().trim().max(300).optional().or(z.literal("")),
});

/** Sidebar "Resumen"/"SEO" tabs — metadata-only update, never touches title/body/versions (see updateContentMetadataAction). */
export const updateContentMetadataSchema = z.object({
  id: z.string().cuid(),
  status: z.enum(contentStatusValues).optional(),
  channel: z.string().trim().max(100).optional().or(z.literal("")),
  objective: z.string().trim().max(500).optional().or(z.literal("")),
  tone: z.string().trim().max(200).optional().or(z.literal("")),
  targetAudience: z.string().trim().max(300).optional().or(z.literal("")),
  cta: z.string().trim().max(300).optional().or(z.literal("")),
  seoKeyword: z.string().trim().max(200).optional().or(z.literal("")),
  seoTitle: z.string().trim().max(200).optional().or(z.literal("")),
  seoDescription: z.string().trim().max(400).optional().or(z.literal("")),
  slug: z.string().trim().max(200).optional().or(z.literal("")),
  searchIntent: z.string().trim().max(200).optional().or(z.literal("")),
  brandProfileId: z.string().cuid().nullable().optional(),
});

export const generateContentSchema = z.object({
  projectId: z.string().cuid(),
  type: z.enum(contentTypeValues),
  topic: z.string().trim().min(3, "Describe el tema del contenido.").max(2000),
  objective: z.string().trim().max(500).optional().or(z.literal("")),
  audience: z.string().trim().max(300).optional().or(z.literal("")),
  tone: z.string().trim().max(200).optional().or(z.literal("")),
  language: z.string().trim().min(2).max(10).default("es"),
  keywords: z.string().trim().max(500).optional().or(z.literal("")),
  forbiddenWords: z.string().trim().max(500).optional().or(z.literal("")),
  cta: z.string().trim().max(300).optional().or(z.literal("")),
  useBrandKit: z.boolean().default(true),
});
