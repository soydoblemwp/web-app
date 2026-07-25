import { z } from "zod";

export const createAiTemplateSchema = z.object({
  projectId: z.string().cuid().nullable().default(null),
  title: z.string().trim().min(1, "El título es obligatorio.").max(200),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  content: z.string().trim().min(1, "El contenido del template es obligatorio.").max(20_000),
  category: z.string().trim().max(100).optional().or(z.literal("")),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  sourceTool: z.string().trim().max(120).optional().or(z.literal("")),
});

export const updateAiTemplateSchema = z.object({
  id: z.string().cuid(),
  title: z.string().trim().min(1, "El título es obligatorio.").max(200).optional(),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  content: z.string().trim().min(1, "El contenido del template es obligatorio.").max(20_000).optional(),
  category: z.string().trim().max(100).optional().or(z.literal("")),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
});
