import "server-only";
import { prisma } from "@/lib/db/prisma";
import { CAMPAIGN_CHANNELS } from "@/lib/campaign-studio/channels";
import type { SocialPlatform } from "@/generated/prisma/enums";

/**
 * Result actions (spec sections 17-20) — always user-triggered from the
 * results screen, never automatic during step execution. Every save
 * verifies the step belongs to this run/project, records an
 * AiAgentResource for traceability, and reuses the EXACT existing models
 * (ContentItem, ContentVersion, CampaignPillar, SocialPost) — never a
 * parallel one.
 */

async function getOwnedStep(projectId: string, runId: string, stepOrder: number) {
  const run = await prisma.aiAgentRun.findUnique({ where: { id: runId } });
  if (!run || run.projectId !== projectId) return null;
  const step = await prisma.aiAgentRunStep.findUnique({ where: { runId_order: { runId, order: stepOrder } } });
  if (!step || step.status !== "COMPLETED" || !step.output) return null;
  return { run, step };
}

export interface SaveAsContentItemOptions {
  mode: "create" | "update-empty" | "new-version" | "copy";
  brandProfileId?: string | null;
  channel?: string | null;
  objective?: string | null;
}

export async function saveStepOutputAsContentItem(projectId: string, userId: string, runId: string, stepOrder: number, options: SaveAsContentItemOptions) {
  const owned = await getOwnedStep(projectId, runId, stepOrder);
  if (!owned) return { error: "Paso no encontrado o sin resultado válido." };
  const output = owned.step.output as Record<string, unknown>;
  if (Array.isArray(output)) return { error: "Este resultado tiene varios elementos — guárdalos como publicaciones en su lugar." };

  const title = (output.title as string | undefined) || (output.name as string | undefined) || "Resultado de agente";
  const body = (output.body as string | undefined) || (output.correctedBody as string | undefined) || (output.text as string | undefined) || "";
  const cta = (output.cta as string | undefined) ?? null;

  const existingResource = await prisma.aiAgentResource.findFirst({ where: { runId, stepId: owned.step.id, type: "CONTENT_ITEM" } });

  if (existingResource?.contentItemId && options.mode !== "copy") {
    const existing = await prisma.contentItem.findUnique({ where: { id: existingResource.contentItemId } });
    if (!existing) return { error: "El ContentItem vinculado ya no existe." };

    if (options.mode === "update-empty") {
      await prisma.contentItem.update({
        where: { id: existing.id },
        data: { title: existing.title || title, body: existing.body || body, cta: existing.cta ?? cta },
      });
      return { id: existing.id };
    }
    if (options.mode === "new-version") {
      await prisma.$transaction([
        prisma.contentVersion.create({ data: { contentItemId: existing.id, authorId: userId, title: existing.title, body: existing.body, note: "Antes de aplicar el resultado del agente" } }),
        prisma.contentItem.update({ where: { id: existing.id }, data: { title, body, cta } }),
      ]);
      return { id: existing.id };
    }
    return { id: existing.id, alreadyLinked: true };
  }

  const created = await prisma.contentItem.create({
    data: {
      projectId,
      authorId: userId,
      type: "OTHER",
      title: title.slice(0, 300),
      body,
      cta,
      channel: options.channel ?? null,
      objective: options.objective ?? null,
      brandProfileId: options.brandProfileId ?? null,
      sourceTool: "agent-studio",
    },
  });
  await prisma.aiAgentResource.create({ data: { runId, stepId: owned.step.id, type: "CONTENT_ITEM", action: "CREATED", contentItemId: created.id } });
  return { id: created.id };
}

/** Campaign Agent's block-shaped output (an array of pillar drafts) becomes real CampaignPillar rows — reuses the same field shape as Campaign Studio's own AI pillar generation, never a parallel structure. */
export async function saveStepOutputAsCampaignPillars(projectId: string, runId: string, stepOrder: number, campaignId: string) {
  const owned = await getOwnedStep(projectId, runId, stepOrder);
  if (!owned) return { error: "Paso no encontrado o sin resultado válido." };
  const output = owned.step.output;
  if (!Array.isArray(output) || output.length === 0) return { error: "Este resultado no contiene pilares para guardar." };

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.projectId !== projectId) return { error: "Campaña no encontrada." };

  const maxOrder = await prisma.campaignPillar.aggregate({ where: { campaignId }, _max: { order: true } });
  let order = (maxOrder._max.order ?? -1) + 1;
  const createdIds: string[] = [];

  for (const draft of output as Record<string, unknown>[]) {
    const pillar = await prisma.campaignPillar.create({
      data: {
        campaignId,
        name: ((draft.name as string) || "Pilar").slice(0, 200),
        description: (draft.description as string) || null,
        objective: (draft.objective as string) || null,
        percentage: typeof draft.percentage === "number" ? draft.percentage : null,
        formats: (draft.formats as string[]) ?? [],
        platforms: (draft.platforms as string[]) ?? [],
        topics: (draft.topics as string[]) ?? [],
        order: order++,
      },
    });
    await prisma.aiAgentResource.create({ data: { runId, stepId: owned.step.id, type: "CAMPAIGN_PILLAR", action: "CREATED", campaignPillarId: pillar.id } });
    createdIds.push(pillar.id);
  }

  return { created: createdIds.length };
}

export interface SaveAsSocialPostsOptions {
  sourceContentItemId?: string | null;
  campaignId?: string | null;
  brandProfileId?: string | null;
  requireApproval?: boolean;
}

const CHANNEL_TO_SOCIAL_PLATFORM = new Map(CAMPAIGN_CHANNELS.filter((c) => c.socialPlatform).map((c) => [c.id, c.socialPlatform as SocialPlatform]));
CHANNEL_TO_SOCIAL_PLATFORM.set("pinterest", "PINTEREST" as SocialPlatform);
CHANNEL_TO_SOCIAL_PLATFORM.set("blog", "BLOG" as SocialPlatform);

/** Social Media / Content Repurposing / Publishing agents all produce one or more platform-tagged text variants — each becomes a real SocialPost via Publishing Hub's own model, never a parallel one. */
export async function saveStepOutputAsSocialPosts(projectId: string, userId: string, runId: string, stepOrder: number, options: SaveAsSocialPostsOptions) {
  const owned = await getOwnedStep(projectId, runId, stepOrder);
  if (!owned) return { error: "Paso no encontrado o sin resultado válido." };
  const output = owned.step.output;
  const variants = Array.isArray(output) ? (output as Record<string, unknown>[]) : [output as Record<string, unknown>];

  const status = options.requireApproval ? "IN_REVIEW" : "DRAFT";
  const createdIds: string[] = [];
  const failures: string[] = [];

  for (const variant of variants) {
    const platformKey = ((variant.platform as string) || "").toLowerCase();
    const platform = CHANNEL_TO_SOCIAL_PLATFORM.get(platformKey);
    if (!platform) {
      failures.push(`Plataforma no reconocida: "${variant.platform}"`);
      continue;
    }
    const text = (variant.text as string | undefined) || "";
    if (!text.trim()) {
      failures.push(`Variante sin texto para ${platformKey}`);
      continue;
    }
    const post = await prisma.socialPost.create({
      data: {
        projectId,
        authorId: userId,
        platform,
        postType: platform.toLowerCase(),
        internalTitle: (variant.hook as string | undefined)?.slice(0, 200) || null,
        text,
        firstComment: (variant.firstComment as string | undefined) || null,
        hashtags: (variant.hashtags as string[] | undefined) ?? [],
        cta: (variant.cta as string | undefined) || null,
        status,
        campaignId: options.campaignId ?? null,
        sourceContentId: options.sourceContentItemId ?? null,
        brandProfileId: options.brandProfileId ?? null,
      },
    });
    await prisma.aiAgentResource.create({ data: { runId, stepId: owned.step.id, type: "SOCIAL_POST", action: "CREATED", socialPostId: post.id } });
    createdIds.push(post.id);
  }

  return { created: createdIds.length, failures };
}

export async function saveStepOutputAsPrompt(projectId: string, userId: string, runId: string, stepOrder: number, title: string) {
  const owned = await getOwnedStep(projectId, runId, stepOrder);
  if (!owned) return { error: "Paso no encontrado o sin resultado válido." };
  const output = owned.step.output;
  const content = Array.isArray(output) ? JSON.stringify(output, null, 2) : JSON.stringify(output, null, 2);

  const prompt = await prisma.savedPrompt.create({
    data: { userId, projectId, title: title.slice(0, 200), content, sourceTool: `agent-studio:${owned.step.agentRef}` },
  });
  return { id: prompt.id };
}
