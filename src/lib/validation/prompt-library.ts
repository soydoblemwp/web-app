import { z } from "zod";

export const createSavedPromptSchema = z.object({
  projectId: z.string().cuid().nullable().default(null),
  title: z.string().trim().min(1, "El título es obligatorio.").max(200),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  content: z.string().trim().min(1, "El contenido del prompt es obligatorio.").max(20_000),
  category: z.string().trim().max(100).optional().or(z.literal("")),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  sourceTool: z.string().trim().max(120).optional().or(z.literal("")),
  /** When true, "Usar" composes this prompt together with the user's default Brand Kit context — see src/lib/brand-profiles/context.ts. */
  useBrandKit: z.boolean().default(false),
});

export const updateSavedPromptSchema = z.object({
  id: z.string().cuid(),
  title: z.string().trim().min(1, "El título es obligatorio.").max(200).optional(),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  content: z.string().trim().min(1, "El contenido del prompt es obligatorio.").max(20_000).optional(),
  category: z.string().trim().max(100).optional().or(z.literal("")),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  useBrandKit: z.boolean().optional(),
});

/** Splits a free-text, comma-separated tags field into a clean array — shared by every form that edits tags. */
export function parseTagsInput(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  ).slice(0, 20);
}
