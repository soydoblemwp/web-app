import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().trim().min(2, "El nombre es obligatorio.").max(120),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  website: z.string().trim().url("Introduce una URL válida.").optional().or(z.literal("")),
  industry: z.string().trim().max(120).optional().or(z.literal("")),
  targetAudience: z.string().trim().max(500).optional().or(z.literal("")),
  primaryLanguage: z.string().trim().min(2).max(10).default("es"),
  market: z.string().trim().max(120).optional().or(z.literal("")),
  timezone: z.string().trim().min(1).max(100).default("UTC"),
  tone: z.string().trim().max(200).optional().or(z.literal("")),
  goals: z.string().trim().max(1000).optional().or(z.literal("")),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = createProjectSchema.partial().extend({
  status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED"]).optional(),
});
