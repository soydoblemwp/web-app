"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requireProjectAccess } from "@/lib/permissions";
import { campaignBriefingSchema, createCampaignTemplateSchema, type CampaignBriefingInput } from "@/lib/validation/campaign-studio";
import { shiftDate } from "@/lib/campaign-studio/date-shift";
import type { ParsedCampaignStrategy } from "@/lib/campaign-studio/strategy-ai";

async function getOwnedCampaign(campaignId: string, projectId: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.projectId !== projectId) return null;
  return campaign;
}

/** Starts the wizard — a minimal Campaign row (status DRAFT) the wizard then autosaves into via updateCampaignBriefingAction. */
export async function createCampaignDraftAction(projectId: string): Promise<{ id: string } | { error: string }> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const campaign = await prisma.campaign.create({
    data: { projectId, ownerId: user.id, name: "Nueva campaña sin título", status: "DRAFT" },
  });
  revalidatePath(`/dashboard/${projectId}/campaign-studio`);
  return { id: campaign.id };
}

/**
 * Debounced autosave for every wizard field (steps 1-5) — never creates a
 * version, mirrors autosaveContentItemAction's reasoning (see
 * src/server/actions/content.ts). Accepts a PARTIAL patch: the wizard sends
 * the full briefing object on every change, while Settings only ever sends
 * the handful of fields it edits — every field not present is left
 * untouched (not reset to empty/default).
 */
export async function updateCampaignBriefingAction(
  projectId: string,
  campaignId: string,
  patch: Partial<CampaignBriefingInput>
): Promise<{ error?: string }> {
  const parsed = campaignBriefingSchema.partial().safeParse(patch);
  if (!parsed.success) return { error: "No se pudo guardar el borrador." };

  await requireProjectAccess(projectId, "EDITOR");
  const campaign = await getOwnedCampaign(campaignId, projectId);
  if (!campaign) return { error: "Campaña no encontrada." };

  // True partial patch: only fields actually present in `patch` are
  // written — anything omitted (e.g. Settings sending just {name, status})
  // is left untouched rather than reset to empty/default.
  const d = parsed.data;
  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.status !== undefined ? { status: d.status } : {}),
      ...(d.description !== undefined ? { description: d.description || null } : {}),
      ...(d.productOrService !== undefined ? { productOrService: d.productOrService || null } : {}),
      ...(d.objective !== undefined ? { objective: d.objective || null } : {}),
      ...(d.startDate !== undefined ? { startDate: d.startDate ? new Date(d.startDate) : null } : {}),
      ...(d.endDate !== undefined ? { endDate: d.endDate ? new Date(d.endDate) : null } : {}),
      ...(d.timezone !== undefined ? { timezone: d.timezone || "UTC" } : {}),
      ...(d.budget !== undefined ? { budget: d.budget } : {}),
      ...(d.brandProfileId !== undefined ? { brandProfileId: d.brandProfileId } : {}),

      ...(d.audience !== undefined ? { audience: d.audience || null } : {}),
      ...(d.audienceLocation !== undefined ? { audienceLocation: d.audienceLocation || null } : {}),
      ...(d.audienceAgeRange !== undefined ? { audienceAgeRange: d.audienceAgeRange || null } : {}),
      ...(d.audienceInterests !== undefined ? { audienceInterests: d.audienceInterests } : {}),
      ...(d.audiencePainPoints !== undefined ? { audiencePainPoints: d.audiencePainPoints } : {}),
      ...(d.audienceNeeds !== undefined ? { audienceNeeds: d.audienceNeeds } : {}),
      ...(d.audienceObjections !== undefined ? { audienceObjections: d.audienceObjections } : {}),
      ...(d.audienceAwareness !== undefined ? { audienceAwareness: d.audienceAwareness || null } : {}),

      ...(d.valueProposition !== undefined ? { valueProposition: d.valueProposition || null } : {}),
      ...(d.mainMessage !== undefined ? { mainMessage: d.mainMessage || null } : {}),
      ...(d.offer !== undefined ? { offer: d.offer || null } : {}),
      ...(d.primaryCTA !== undefined ? { primaryCTA: d.primaryCTA || null } : {}),
      ...(d.tone !== undefined ? { tone: d.tone || null } : {}),
      ...(d.forbiddenWords !== undefined ? { forbiddenWords: d.forbiddenWords } : {}),
      ...(d.differentiators !== undefined ? { differentiators: d.differentiators } : {}),

      ...(d.channels !== undefined ? { channels: d.channels } : {}),

      ...(d.contentCount !== undefined ? { contentCount: d.contentCount } : {}),
      ...(d.frequencyPerWeek !== undefined ? { frequencyPerWeek: d.frequencyPerWeek } : {}),
      ...(d.preferredDays !== undefined ? { preferredDays: d.preferredDays } : {}),
      ...(d.preferredHours !== undefined ? { preferredHours: d.preferredHours } : {}),
      ...(d.desiredFormats !== undefined ? { desiredFormats: d.desiredFormats } : {}),
    },
  });

  revalidatePath(`/dashboard/${projectId}/campaign-studio/${campaignId}`);
  return {};
}

/** Step 6 confirmation — moves the campaign out of DRAFT once the wizard is finished. */
export async function finalizeCampaignWizardAction(projectId: string, campaignId: string): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  const campaign = await getOwnedCampaign(campaignId, projectId);
  if (!campaign) return { error: "Campaña no encontrada." };
  if (campaign.status === "DRAFT") {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: "PLANNED" } });
  }
  revalidatePath(`/dashboard/${projectId}/campaign-studio`);
  revalidatePath(`/dashboard/${projectId}/campaign-studio/${campaignId}`);
  return {};
}

export async function deleteCampaignDraftAction(projectId: string, campaignId: string): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  const campaign = await getOwnedCampaign(campaignId, projectId);
  if (!campaign) return { error: "Campaña no encontrada." };
  await prisma.campaign.delete({ where: { id: campaignId } });
  revalidatePath(`/dashboard/${projectId}/campaign-studio`);
  return {};
}

export interface SaveCampaignStrategyInput {
  sections: Partial<ParsedCampaignStrategy>;
  createVersion?: boolean;
  note?: string;
}

/**
 * Persists the AI-generated (or manually edited) strategy — each section is
 * its own column, never a single text blob (see prisma/schema.prisma's
 * CampaignStrategy). Optionally snapshots a CampaignStrategyVersion first,
 * same "version = point-in-time snapshot" pattern as ContentVersion.
 */
export async function saveCampaignStrategyAction(
  projectId: string,
  campaignId: string,
  input: SaveCampaignStrategyInput
): Promise<{ error?: string }> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const campaign = await getOwnedCampaign(campaignId, projectId);
  if (!campaign) return { error: "Campaña no encontrada." };

  const existing = await prisma.campaignStrategy.findUnique({ where: { campaignId } });

  if (existing && input.createVersion) {
    await prisma.campaignStrategyVersion.create({
      data: {
        strategyId: existing.id,
        authorId: user.id,
        snapshot: existing as unknown as Prisma.InputJsonValue,
        note: input.note || null,
      },
    });
  }

  const s = input.sections;
  const data = {
    ...(s.summary !== undefined ? { summary: s.summary } : {}),
    ...(s.audienceProfile !== undefined ? { audienceProfile: s.audienceProfile } : {}),
    ...(s.valueProposition !== undefined ? { valueProposition: s.valueProposition } : {}),
    ...(s.mainMessage !== undefined ? { mainMessage: s.mainMessage } : {}),
    ...(s.objectives !== undefined ? { objectives: s.objectives } : {}),
    ...(s.themes !== undefined ? { themes: s.themes } : {}),
    ...(s.creativeAngles !== undefined ? { creativeAngles: s.creativeAngles } : {}),
    ...(s.cta !== undefined ? { cta: s.cta } : {}),
    ...(s.risks !== undefined ? { risks: s.risks } : {}),
    ...(s.recommendations !== undefined ? { recommendations: s.recommendations } : {}),
    ...(s.suggestedMetrics !== undefined ? { suggestedMetrics: s.suggestedMetrics } : {}),
    generatedAt: new Date(),
  };

  if (existing) {
    await prisma.campaignStrategy.update({ where: { campaignId }, data });
  } else {
    await prisma.campaignStrategy.create({ data: { campaignId, ...data } });
  }

  revalidatePath(`/dashboard/${projectId}/campaign-studio/${campaignId}`);
  return {};
}

export async function saveCampaignAsTemplateAction(
  projectId: string,
  input: { campaignId: string; name: string; description?: string }
): Promise<{ error?: string; id?: string }> {
  const parsed = createCampaignTemplateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };

  const user = await requireProjectAccess(projectId, "EDITOR");
  const campaign = await getOwnedCampaign(parsed.data.campaignId, projectId);
  if (!campaign) return { error: "Campaña no encontrada." };

  const [pillars, strategy] = await Promise.all([
    prisma.campaignPillar.findMany({ where: { campaignId: campaign.id }, orderBy: { order: "asc" } }),
    prisma.campaignStrategy.findUnique({ where: { campaignId: campaign.id } }),
  ]);

  const structure = {
    objective: campaign.objective,
    audience: campaign.audience,
    channels: campaign.channels,
    frequency: campaign.frequency,
    frequencyPerWeek: campaign.frequencyPerWeek,
    contentCount: campaign.contentCount,
    preferredDays: campaign.preferredDays,
    preferredHours: campaign.preferredHours,
    desiredFormats: campaign.desiredFormats,
    tone: campaign.tone,
    valueProposition: campaign.valueProposition,
    mainMessage: campaign.mainMessage,
    primaryCTA: campaign.primaryCTA,
    pillars: pillars.map((p) => ({
      name: p.name,
      description: p.description,
      objective: p.objective,
      color: p.color,
      percentage: p.percentage,
      formats: p.formats,
      platforms: p.platforms,
      topics: p.topics,
    })),
    strategy: strategy
      ? {
          summary: strategy.summary,
          audienceProfile: strategy.audienceProfile,
          valueProposition: strategy.valueProposition,
          mainMessage: strategy.mainMessage,
          objectives: strategy.objectives,
          themes: strategy.themes,
          creativeAngles: strategy.creativeAngles,
          cta: strategy.cta,
        }
      : null,
    checklist: ["title-reviewed", "content-reviewed", "cta-included", "seo-completed"],
  };

  const template = await prisma.campaignTemplate.create({
    data: {
      projectId,
      createdById: user.id,
      name: parsed.data.name,
      description: parsed.data.description || null,
      structure: structure as unknown as Prisma.InputJsonValue,
    },
  });

  revalidatePath(`/dashboard/${projectId}/campaign-studio`);
  return { id: template.id };
}

interface TemplateStructure {
  objective?: string | null;
  audience?: string | null;
  channels?: string[];
  frequency?: string | null;
  frequencyPerWeek?: number | null;
  contentCount?: number | null;
  preferredDays?: string[];
  preferredHours?: string[];
  desiredFormats?: string[];
  tone?: string | null;
  valueProposition?: string | null;
  mainMessage?: string | null;
  primaryCTA?: string | null;
  pillars?: {
    name: string;
    description: string | null;
    objective: string | null;
    color: string | null;
    percentage: number | null;
    formats: string[];
    platforms: string[];
    topics: string[];
  }[];
}

export async function createCampaignFromTemplateAction(
  projectId: string,
  input: { templateId: string; name: string; startDate?: string }
): Promise<{ error?: string; id?: string }> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const template = await prisma.campaignTemplate.findUnique({ where: { id: input.templateId } });
  if (!template || template.projectId !== projectId) return { error: "Plantilla no encontrada." };

  const s = template.structure as unknown as TemplateStructure;

  const campaign = await prisma.campaign.create({
    data: {
      projectId,
      ownerId: user.id,
      name: input.name || `${template.name} (nueva)`,
      status: "DRAFT",
      objective: s.objective ?? null,
      audience: s.audience ?? null,
      channels: s.channels ?? [],
      frequency: s.frequency ?? null,
      frequencyPerWeek: s.frequencyPerWeek ?? null,
      contentCount: s.contentCount ?? null,
      preferredDays: s.preferredDays ?? [],
      preferredHours: s.preferredHours ?? [],
      desiredFormats: s.desiredFormats ?? [],
      tone: s.tone ?? null,
      valueProposition: s.valueProposition ?? null,
      mainMessage: s.mainMessage ?? null,
      primaryCTA: s.primaryCTA ?? null,
      startDate: input.startDate ? new Date(input.startDate) : null,
      templateSourceId: template.id,
    },
  });

  if (s.pillars?.length) {
    await prisma.campaignPillar.createMany({
      data: s.pillars.map((p, index) => ({
        campaignId: campaign.id,
        name: p.name,
        description: p.description,
        objective: p.objective,
        color: p.color,
        percentage: p.percentage,
        formats: p.formats,
        platforms: p.platforms,
        topics: p.topics,
        order: index,
      })),
    });
  }

  revalidatePath(`/dashboard/${projectId}/campaign-studio`);
  redirect(`/dashboard/${projectId}/campaign-studio/${campaign.id}`);
}

/**
 * Duplicates an existing campaign: briefing + pillars + pieces (as fresh
 * IDEA-status planning items, dates recalculated relative to the new start
 * date — never copies results/comments/published states/literal old dates,
 * per spec section 12).
 */
export async function duplicateCampaignStudioCampaignAction(
  projectId: string,
  input: { campaignId: string; name: string; startDate?: string }
): Promise<{ error?: string; id?: string }> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const original = await getOwnedCampaign(input.campaignId, projectId);
  if (!original) return { error: "Campaña no encontrada." };

  const [pillars, pieces] = await Promise.all([
    prisma.campaignPillar.findMany({ where: { campaignId: original.id }, orderBy: { order: "asc" } }),
    prisma.campaignContentPiece.findMany({ where: { campaignId: original.id } }),
  ]);

  const newStart = input.startDate ? new Date(input.startDate) : new Date();
  const oldStart = original.startDate ?? newStart;

  const campaign = await prisma.campaign.create({
    data: {
      projectId,
      ownerId: user.id,
      name: input.name,
      status: "DRAFT",
      description: original.description,
      objective: original.objective,
      audience: original.audience,
      productOrService: original.productOrService,
      startDate: newStart,
      endDate: original.endDate ? shiftDate(original.endDate, oldStart, newStart) : null,
      timezone: original.timezone,
      platforms: original.platforms,
      channels: original.channels,
      frequency: original.frequency,
      frequencyPerWeek: original.frequencyPerWeek,
      contentCount: original.contentCount,
      preferredDays: original.preferredDays,
      preferredHours: original.preferredHours,
      desiredFormats: original.desiredFormats,
      budget: original.budget,
      primaryCTA: original.primaryCTA,
      tone: original.tone,
      valueProposition: original.valueProposition,
      mainMessage: original.mainMessage,
      offer: original.offer,
      forbiddenWords: original.forbiddenWords,
      differentiators: original.differentiators,
      audienceLocation: original.audienceLocation,
      audienceAgeRange: original.audienceAgeRange,
      audienceInterests: original.audienceInterests,
      audiencePainPoints: original.audiencePainPoints,
      audienceNeeds: original.audienceNeeds,
      audienceObjections: original.audienceObjections,
      audienceAwareness: original.audienceAwareness,
      brandProfileId: original.brandProfileId,
      links: original.links,
      tags: original.tags,
    },
  });

  const pillarIdMap = new Map<string, string>();
  for (const [index, pillar] of pillars.entries()) {
    const created = await prisma.campaignPillar.create({
      data: {
        campaignId: campaign.id,
        name: pillar.name,
        description: pillar.description,
        objective: pillar.objective,
        color: pillar.color,
        percentage: pillar.percentage,
        formats: pillar.formats,
        platforms: pillar.platforms,
        topics: pillar.topics,
        order: index,
      },
    });
    pillarIdMap.set(pillar.id, created.id);
  }

  if (pieces.length > 0) {
    await prisma.campaignContentPiece.createMany({
      data: pieces.map((piece) => ({
        campaignId: campaign.id,
        pillarId: piece.pillarId ? (pillarIdMap.get(piece.pillarId) ?? null) : null,
        title: piece.title,
        idea: piece.idea,
        platform: piece.platform,
        format: piece.format,
        objective: piece.objective,
        cta: piece.cta,
        scheduledDate: piece.scheduledDate ? shiftDate(piece.scheduledDate, oldStart, newStart) : null,
        scheduledTime: piece.scheduledTime,
        status: "IDEA" as const,
        priority: piece.priority,
        keywords: piece.keywords,
        authorId: user.id,
        order: piece.order,
        // contentItemId, comments, assignee, results — deliberately never copied.
      })),
    });
  }

  revalidatePath(`/dashboard/${projectId}/campaign-studio`);
  redirect(`/dashboard/${projectId}/campaign-studio/${campaign.id}`);
}
