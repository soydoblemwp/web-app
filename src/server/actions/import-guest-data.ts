"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser, ForbiddenError } from "@/lib/permissions";
import { prisma } from "@/lib/db/prisma";
import { ensureWorkspaceForUser } from "@/server/services/workspace";
import { createProject } from "@/server/services/project";

/**
 * Imports data exported from guest-mode IndexedDB (src/lib/guest-storage/)
 * into the signed-in user's account. Only ever called explicitly by the
 * user via "Importar mis datos locales" — never automatic, and the local
 * IndexedDB data is never deleted as a side effect of this action.
 *
 * Scope: projects, brand kits, library items (as ContentItem) and
 * campaigns. Calendar entries, automations and monitors stay local-only —
 * their registered-account equivalents have different scheduling/validation
 * requirements (e.g. SSRF-checked monitor URLs) that a blind import
 * shouldn't bypass.
 */

const importLibraryItemSchema = z.object({
  projectId: z.string(),
  kind: z.enum(["CONTENT", "SOCIAL_IDEAS", "ADAPTATION", "REPLY", "OTHER"]),
  title: z.string().max(300),
  body: z.string().max(50_000),
  isDeleted: z.boolean(),
});

const importCampaignSchema = z.object({
  projectId: z.string(),
  name: z.string().max(200),
  description: z.string().max(2000).optional().default(""),
  objective: z.string().max(500).optional().default(""),
  audience: z.string().max(300).optional().default(""),
  primaryCTA: z.string().max(300).optional().default(""),
});

const importBrandKitSchema = z.object({
  projectId: z.string(),
  isActiveForAI: z.boolean(),
  name: z.string().max(200).optional().default(""),
  tagline: z.string().max(300).optional().default(""),
  tone: z.string().max(200).optional().default(""),
  personality: z.string().max(300).optional().default(""),
  valueProposition: z.string().max(500).optional().default(""),
  commonCTAs: z.string().max(300).optional().default(""),
  additionalNotes: z.string().max(1000).optional().default(""),
  terms: z.array(z.object({ term: z.string().max(60), isForbidden: z.boolean() })).max(200),
});

const importProjectSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional().default(""),
  primaryLanguage: z.string().min(2).max(10).optional().default("es"),
  tone: z.string().max(200).optional().default(""),
  targetAudience: z.string().max(300).optional().default(""),
  market: z.string().max(200).optional().default(""),
});

const importGuestDataSchema = z.object({
  projects: z.array(importProjectSchema).max(50),
  library: z.array(importLibraryItemSchema).max(2000),
  campaigns: z.array(importCampaignSchema).max(500),
  brandKits: z.array(importBrandKitSchema).max(50),
});

export type ImportGuestDataInput = z.infer<typeof importGuestDataSchema>;

export interface ImportGuestDataResult {
  projectsImported: number;
  projectsSkipped: number;
  contentItemsImported: number;
  campaignsImported: number;
  error?: string;
}

const CONTENT_TYPE_BY_KIND: Record<string, "SOCIAL_TEXT" | "OTHER"> = {
  CONTENT: "OTHER",
  SOCIAL_IDEAS: "SOCIAL_TEXT",
  ADAPTATION: "OTHER",
  REPLY: "OTHER",
  OTHER: "OTHER",
};

export async function importGuestDataAction(rawInput: unknown): Promise<ImportGuestDataResult> {
  const parsed = importGuestDataSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { projectsImported: 0, projectsSkipped: 0, contentItemsImported: 0, campaignsImported: 0, error: "Los datos locales no tienen un formato válido." };
  }
  const data = parsed.data;

  const user = await requireUser();
  const workspace = await ensureWorkspaceForUser(user.id, user.name);

  const result: ImportGuestDataResult = {
    projectsImported: 0,
    projectsSkipped: 0,
    contentItemsImported: 0,
    campaignsImported: 0,
  };

  const newProjectIdByLocalId = new Map<string, string>();

  for (const localProject of data.projects) {
    try {
      const project = await createProject(user.id, workspace.id, {
        name: `${localProject.name} (importado)`,
        description: localProject.description,
        website: "",
        industry: "",
        targetAudience: localProject.targetAudience,
        primaryLanguage: localProject.primaryLanguage,
        market: localProject.market,
        timezone: "UTC",
        tone: localProject.tone,
        goals: "",
      });
      newProjectIdByLocalId.set(localProject.id, project.id);
      result.projectsImported += 1;
    } catch (error) {
      if (error instanceof ForbiddenError) {
        result.projectsSkipped += 1;
        continue;
      }
      throw error;
    }
  }

  for (const brandKit of data.brandKits) {
    const projectId = newProjectIdByLocalId.get(brandKit.projectId);
    if (!projectId) continue;
    await prisma.brandKit.update({
      where: { projectId },
      data: {
        isActiveForAI: brandKit.isActiveForAI,
        name: brandKit.name || null,
        tagline: brandKit.tagline || null,
        tone: brandKit.tone || null,
        personality: brandKit.personality || null,
        valueProposition: brandKit.valueProposition || null,
        commonCTAs: brandKit.commonCTAs || null,
        additionalNotes: brandKit.additionalNotes || null,
        terms: brandKit.terms.length
          ? { create: brandKit.terms.map((t) => ({ term: t.term, isForbidden: t.isForbidden })) }
          : undefined,
      },
    });
  }

  for (const item of data.library) {
    if (item.isDeleted) continue;
    const projectId = newProjectIdByLocalId.get(item.projectId);
    if (!projectId) continue;
    await prisma.contentItem.create({
      data: {
        projectId,
        authorId: user.id,
        type: CONTENT_TYPE_BY_KIND[item.kind] ?? "OTHER",
        title: item.title || "Sin título",
        body: item.body,
        language: "es",
      },
    });
    result.contentItemsImported += 1;
  }

  for (const campaign of data.campaigns) {
    const projectId = newProjectIdByLocalId.get(campaign.projectId);
    if (!projectId) continue;
    await prisma.campaign.create({
      data: {
        projectId,
        ownerId: user.id,
        name: campaign.name,
        description: campaign.description || null,
        objective: campaign.objective || null,
        audience: campaign.audience || null,
        primaryCTA: campaign.primaryCTA || null,
      },
    });
    result.campaignsImported += 1;
  }

  revalidatePath("/dashboard");
  return result;
}
