import { z } from "zod";
import { KNOWLEDGE_COLLECTION_ICON_NAMES, KNOWLEDGE_COLLECTION_COLORS } from "@/lib/knowledge/collection-icons";
import { KNOWLEDGE_SOURCE_ORIGIN_TYPES, KNOWLEDGE_QUERY_MODES } from "@/lib/knowledge/types";

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

export const createCollectionSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio.").max(200),
  description: optionalText(1000),
  icon: z.enum(KNOWLEDGE_COLLECTION_ICON_NAMES).default("Folder"),
  color: z.enum(KNOWLEDGE_COLLECTION_COLORS).default("#6366f1"),
});
export const updateCollectionSchema = createCollectionSchema.partial();
export type CreateCollectionInput = z.infer<typeof createCollectionSchema>;

export const createPastedSourceSchema = z.object({
  title: z.string().trim().min(1, "El título es obligatorio.").max(300),
  description: optionalText(1000),
  text: z.string().trim().min(1, "El contenido no puede estar vacío.").max(400_000),
  format: z.enum(["TEXT", "MARKDOWN", "CSV", "JSON", "HTML"]).default("TEXT"),
  collectionIds: z.array(z.string().cuid()).max(20).default([]),
});
export type CreatePastedSourceInput = z.infer<typeof createPastedSourceSchema>;

export const createInternalSourceSchema = z.object({
  originType: z.enum(KNOWLEDGE_SOURCE_ORIGIN_TYPES),
  title: z.string().trim().min(1).max(300).optional(),
  contentItemId: z.string().cuid().optional(),
  campaignId: z.string().cuid().optional(),
  campaignStrategyId: z.string().cuid().optional(),
  campaignContentPieceId: z.string().cuid().optional(),
  socialPostId: z.string().cuid().optional(),
  savedPromptId: z.string().cuid().optional(),
  syncMode: z.enum(["MANUAL", "ON_SAVE", "DISABLED"]).default("MANUAL"),
  collectionIds: z.array(z.string().cuid()).max(20).default([]),
});
export type CreateInternalSourceInput = z.infer<typeof createInternalSourceSchema>;

export const updateSourceSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: optionalText(1000),
  syncMode: z.enum(["MANUAL", "ON_SAVE", "DISABLED"]).optional(),
});

export const knowledgeSearchSchema = z.object({
  query: z.string().trim().min(1, "Escribe algo para buscar.").max(500),
  collectionIds: z.array(z.string().cuid()).max(20).default([]),
  sourceIds: z.array(z.string().cuid()).max(50).default([]),
  formats: z.array(z.enum(["TEXT", "MARKDOWN", "CSV", "JSON", "PDF", "DOCX", "HTML"])).max(7).default([]),
  includeArchived: z.boolean().default(false),
  limit: z.number().int().min(1).max(50).default(20),
});

export const createKnowledgeQuerySchema = z.object({
  question: z.string().trim().min(3, "Escribe una pregunta.").max(2000),
  mode: z.enum(KNOWLEDGE_QUERY_MODES).default("SOURCES_ONLY"),
  collectionIds: z.array(z.string().cuid()).max(20).default([]),
  sourceIds: z.array(z.string().cuid()).max(50).default([]),
  brandProfileId: z.string().cuid().nullable().optional(),
  language: z.string().trim().max(10).optional(),
  maxSources: z.number().int().min(1).max(20).default(8),
});

export const saveQueryAsContentItemSchema = z.object({
  mode: z.enum(["create", "update-empty", "new-version", "copy"]).default("create"),
  contentItemId: z.string().cuid().optional(),
  title: z.string().trim().min(1).max(300).optional(),
});

export const insertContentCitationSchema = z.object({
  contentItemId: z.string().cuid(),
  chunkId: z.string().cuid(),
  citationType: z.enum(["DIRECT", "CONTEXTUAL"]).default("DIRECT"),
});

export const verifyContentSchema = z.object({
  contentItemId: z.string().cuid(),
  collectionIds: z.array(z.string().cuid()).max(20).default([]),
  sourceIds: z.array(z.string().cuid()).max(50).default([]),
});
