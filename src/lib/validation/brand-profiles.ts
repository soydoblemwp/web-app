import { z } from "zod";

const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const hexColorArray = z
  .array(z.string().trim().regex(HEX_COLOR_RE, "Cada color debe ser un código hexadecimal, ej. #1A2B3C."))
  .max(20)
  .default([]);

const stringArray = z.array(z.string().trim().min(1).max(80)).max(30).default([]);

export const createBrandProfileSchema = z.object({
  name: z.string().trim().min(1, "El nombre de la marca es obligatorio.").max(200),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  mission: z.string().trim().max(1000).optional().or(z.literal("")),
  vision: z.string().trim().max(1000).optional().or(z.literal("")),
  values: stringArray,
  targetAudience: z.string().trim().max(500).optional().or(z.literal("")),
  tone: z.string().trim().max(200).optional().or(z.literal("")),
  personality: z.string().trim().max(500).optional().or(z.literal("")),
  primaryLanguage: z.string().trim().max(50).optional().or(z.literal("")),
  country: z.string().trim().max(100).optional().or(z.literal("")),
  allowedWords: stringArray,
  forbiddenWords: stringArray,
  writingStyle: z.string().trim().max(500).optional().or(z.literal("")),
  preferredCTAs: stringArray,
  socialLinks: stringArray,
  website: z.string().trim().max(300).optional().or(z.literal("")),
  email: z.string().trim().max(200).optional().or(z.literal("")),
  colors: hexColorArray,
  typography: z.string().trim().max(200).optional().or(z.literal("")),
  logoUrl: z.string().trim().max(500).optional().or(z.literal("")),
  internalNotes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const updateBrandProfileSchema = createBrandProfileSchema.partial().extend({
  id: z.string().cuid(),
});
