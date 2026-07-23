import { z } from "zod";

export const updateBrandKitSchema = z.object({
  name: z.string().trim().max(200).optional().or(z.literal("")),
  tagline: z.string().trim().max(300).optional().or(z.literal("")),
  description: z.string().trim().max(3000).optional().or(z.literal("")),
  personality: z.string().trim().max(1000).optional().or(z.literal("")),
  tone: z.string().trim().max(500).optional().or(z.literal("")),
  valueProposition: z.string().trim().max(1000).optional().or(z.literal("")),
  commonCTAs: z.string().trim().max(1000).optional().or(z.literal("")),
  primaryLinks: z.string().trim().max(1000).optional().or(z.literal("")),
  colors: z.array(z.string().trim().max(20)).max(10).default([]),
  fontReferences: z.string().trim().max(500).optional().or(z.literal("")),
  competitors: z.string().trim().max(1000).optional().or(z.literal("")),
  additionalNotes: z.string().trim().max(3000).optional().or(z.literal("")),
  approvedExamples: z.string().trim().max(3000).optional().or(z.literal("")),
  isActiveForAI: z.boolean().default(true),
});

export const brandTermSchema = z.object({
  term: z.string().trim().min(1).max(100),
  isForbidden: z.boolean().default(false),
});
