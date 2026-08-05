import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { MarketingBrainRun, MarketingBrainStep } from "@/generated/prisma/client";
import { buildBrandProfileContext } from "@/lib/brand-profiles/context";
import {
  buildCampaignStrategySystemPrompt,
  buildCampaignStrategyUserPrompt,
  parseCampaignStrategyText,
} from "@/lib/campaign-studio/strategy-ai";
import { buildCampaignPillarSystemPrompt, buildCampaignPillarUserPrompt, parseCampaignPillarsText } from "@/lib/campaign-studio/pillar-ai";
import { buildCampaignPlanSystemPrompt, buildCampaignPlanUserPrompt, parseCampaignPlanText } from "@/lib/campaign-studio/plan-ai";
import { buildContentGenerationSystemPrompt, buildContentGenerationPrompt } from "@/lib/ai/prompts/content";
import { findRepurposeChannel } from "@/lib/editor/repurpose-platforms";
import { findSchedulingConflicts } from "@/lib/publishing/scheduling";
import { canSchedule } from "@/lib/publishing/status";
import { CAMPAIGN_CHANNELS } from "@/lib/campaign-studio/channels";
import { aiStrategyOutputSchema, aiPillarsOutputSchema, aiContentPlanOutputSchema } from "@/lib/validation/marketing-brain";
import type { NormalizedBriefing, MarketingBrainErrorCategoryValue } from "@/lib/marketing-brain/types";
import type { AIResultKind, MarketingBrainResourceType, SocialPlatform } from "@/generated/prisma/enums";

const PILLAR_COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#0ea5e9", "#8b5cf6", "#ef4444", "#14b8a6"];

export interface StageContext {
  projectId: string;
  userId: string;
  run: MarketingBrainRun;
  step: MarketingBrainStep;
  normalized: NormalizedBriefing;
}

export type StageOutcome =
  | { kind: "completed"; output: Record<string, unknown>; campaignId?: string }
  | { kind: "failed"; errorMessage: string; errorCategory: MarketingBrainErrorCategoryValue; itemKey?: string }
  | {
      kind: "ai";
      systemPrompt: string;
      userPrompt: string;
      itemIndex: number;
      itemsTotal: number;
      itemLabel: string;
      aiKind: AIResultKind;
    };

/** Idempotent — a unique-constraint violation (already recorded by an earlier attempt of this same step) is treated as a no-op, never an error. Pillars have no per-row unique constraint (many are created per step) so they always insert fresh. */
async function recordResource(params: {
  runId: string;
  stepId: string;
  type: MarketingBrainResourceType;
  action: "CREATED" | "REUSED";
  campaignId?: string;
  campaignPillarId?: string;
  campaignContentPieceId?: string;
  contentItemId?: string;
  socialPostId?: string;
}) {
  try {
    await prisma.marketingBrainResource.create({
      data: {
        runId: params.runId,
        stepId: params.stepId,
        type: params.type,
        action: params.action,
        campaignId: params.campaignId,
        campaignPillarId: params.campaignPillarId,
        campaignContentPieceId: params.campaignContentPieceId,
        contentItemId: params.contentItemId,
        socialPostId: params.socialPostId,
      },
    });
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") throw err;
  }
}

async function resolveBrandContext(brandProfileId: string | null): Promise<string> {
  if (!brandProfileId) return "";
  const profile = await prisma.brandProfile.findUnique({ where: { id: brandProfileId } });
  return profile ? buildBrandProfileContext(profile) : "";
}

// ---------------------------------------------------------------------------
// 1. INTERPRET_BRIEFING — deterministic, no AI, no resources.
// ---------------------------------------------------------------------------
export async function runInterpretBriefingStage(ctx: StageContext): Promise<StageOutcome> {
  if (ctx.normalized.errors.length > 0) {
    return { kind: "failed", errorMessage: ctx.normalized.errors[0], errorCategory: "VALIDATION" };
  }
  return {
    kind: "completed",
    output: { inferredFields: ctx.normalized.inferredFields, warnings: ctx.normalized.warnings },
  };
}

// ---------------------------------------------------------------------------
// 2. PREPARE_CAMPAIGN — deterministic, creates or reuses the Campaign.
// ---------------------------------------------------------------------------
export async function runPrepareCampaignStage(ctx: StageContext): Promise<StageOutcome> {
  const { run, normalized, userId, projectId, step } = ctx;

  if (run.campaignId) {
    await recordResource({ runId: run.id, stepId: step.id, type: "CAMPAIGN", action: "REUSED", campaignId: run.campaignId });
    return { kind: "completed", output: { campaignId: run.campaignId, action: "reused" }, campaignId: run.campaignId };
  }

  const name = normalized.productOrService ? `${normalized.productOrService} — ${normalized.objective}`.slice(0, 200) : normalized.objective.slice(0, 200) || "Campaña generada por AI Marketing Brain";

  if (normalized.campaignMode === "existing") {
    const source = await prisma.campaign.findUnique({ where: { id: normalized.existingCampaignId ?? "" } });
    if (!source || source.projectId !== projectId) {
      return { kind: "failed", errorMessage: "La campaña seleccionada no existe en este proyecto.", errorCategory: "VALIDATION" };
    }
    await recordResource({ runId: run.id, stepId: step.id, type: "CAMPAIGN", action: "REUSED", campaignId: source.id });
    return { kind: "completed", output: { campaignId: source.id, action: "reused" }, campaignId: source.id };
  }

  let baseData: Record<string, unknown> = {};
  if (normalized.campaignMode === "duplicate") {
    const source = await prisma.campaign.findUnique({ where: { id: normalized.existingCampaignId ?? "" } });
    if (!source || source.projectId !== projectId) {
      return { kind: "failed", errorMessage: "La campaña a duplicar no existe en este proyecto.", errorCategory: "VALIDATION" };
    }
    baseData = { description: source.description, links: source.links, tags: source.tags };
  }

  const campaign = await prisma.campaign.create({
    data: {
      ...baseData,
      project: { connect: { id: projectId } },
      owner: { connect: { id: userId } },
      name,
      status: "DRAFT",
      objective: normalized.objective,
      productOrService: normalized.productOrService || null,
      audience: normalized.audience || null,
      startDate: new Date(normalized.startDate),
      endDate: new Date(normalized.endDate),
      timezone: normalized.timezone,
      platforms: [],
      channels: normalized.platforms,
      frequency: null,
      frequencyPerWeek: normalized.frequencyPerWeek,
      contentCount: normalized.maxPieces,
      preferredDays: normalized.preferredDays,
      preferredHours: normalized.preferredHours,
      desiredFormats: normalized.desiredFormats,
      budget: normalized.budget,
      primaryCTA: normalized.primaryCTA || null,
      tone: normalized.tone || null,
      valueProposition: normalized.valueProposition || null,
      offer: normalized.offer || null,
      forbiddenWords: normalized.forbiddenWords,
      differentiators: normalized.competitors,
      audienceLocation: normalized.audienceLocation || null,
      audienceAgeRange: normalized.audienceAgeRange || null,
      audienceInterests: normalized.audienceInterests,
      audiencePainPoints: normalized.audiencePainPoints,
      audienceNeeds: normalized.audienceNeeds,
      audienceObjections: normalized.audienceObjections,
      audienceAwareness: normalized.audienceAwareness || null,
      ...(normalized.brandProfileId ? { brandProfile: { connect: { id: normalized.brandProfileId } } } : {}),
    },
  });

  await recordResource({ runId: run.id, stepId: step.id, type: "CAMPAIGN", action: "CREATED", campaignId: campaign.id });
  return { kind: "completed", output: { campaignId: campaign.id, action: "created" }, campaignId: campaign.id };
}

// ---------------------------------------------------------------------------
// 3. GENERATE_STRATEGY — AI, single item.
// ---------------------------------------------------------------------------
export async function prepareGenerateStrategyStage(ctx: StageContext): Promise<StageOutcome> {
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: ctx.run.campaignId! } });
  const brandContext = await resolveBrandContext(ctx.normalized.brandProfileId);
  const systemPrompt = buildCampaignStrategySystemPrompt(brandContext);
  const userPrompt = buildCampaignStrategyUserPrompt({
    name: campaign.name,
    description: ctx.normalized.description,
    productOrService: ctx.normalized.productOrService,
    objective: ctx.normalized.objective,
    audience: ctx.normalized.audience,
    valueProposition: ctx.normalized.valueProposition,
    mainMessage: "",
    offer: ctx.normalized.offer,
    tone: ctx.normalized.tone,
    channels: ctx.normalized.platforms,
  });
  return { kind: "ai", systemPrompt, userPrompt, itemIndex: 0, itemsTotal: 1, itemLabel: "Estrategia de campaña", aiKind: "CAMPAIGN_PLAN" };
}

export async function completeGenerateStrategyStage(ctx: StageContext, rawOutput: string): Promise<StageOutcome> {
  const parsed = parseCampaignStrategyText(rawOutput);
  if (!parsed.summary.trim() && parsed.objectives.length === 0) {
    return { kind: "failed", errorMessage: "La IA no devolvió una estrategia utilizable. Puedes reintentar.", errorCategory: "AI" };
  }
  const validated = aiStrategyOutputSchema.safeParse(parsed);
  const s = validated.success
    ? validated.data
    : {
        ...parsed,
        summary: parsed.summary.slice(0, 4000),
        audienceProfile: parsed.audienceProfile.slice(0, 4000),
        objectives: parsed.objectives.slice(0, 30),
        themes: parsed.themes.slice(0, 30),
        creativeAngles: parsed.creativeAngles.slice(0, 30),
        risks: parsed.risks.slice(0, 30),
        recommendations: parsed.recommendations.slice(0, 30),
        suggestedMetrics: parsed.suggestedMetrics.slice(0, 30),
      };

  const existing = await prisma.campaignStrategy.findUnique({ where: { campaignId: ctx.run.campaignId! } });
  const data = {
    summary: s.summary,
    audienceProfile: s.audienceProfile,
    valueProposition: s.valueProposition,
    mainMessage: s.mainMessage,
    objectives: s.objectives,
    themes: s.themes,
    creativeAngles: s.creativeAngles,
    cta: s.cta,
    risks: s.risks,
    recommendations: s.recommendations,
    suggestedMetrics: s.suggestedMetrics,
    generatedAt: new Date(),
  };
  const strategy = existing
    ? await prisma.campaignStrategy.update({ where: { campaignId: ctx.run.campaignId! }, data })
    : await prisma.campaignStrategy.create({ data: { campaignId: ctx.run.campaignId!, ...data } });

  await recordResource({ runId: ctx.run.id, stepId: ctx.step.id, type: "CAMPAIGN_STRATEGY", action: existing ? "REUSED" : "CREATED", campaignId: ctx.run.campaignId! });
  return { kind: "completed", output: { strategyId: strategy.id, summary: s.summary.slice(0, 500) } };
}

// ---------------------------------------------------------------------------
// 4. CREATE_PILLARS — AI, single item (batch of pillars).
// ---------------------------------------------------------------------------
export async function preparePillarsStage(ctx: StageContext): Promise<StageOutcome> {
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: ctx.run.campaignId! } });
  const brandContext = await resolveBrandContext(ctx.normalized.brandProfileId);
  const pillarCount = Math.min(6, Math.max(2, Math.ceil(ctx.normalized.maxPieces / 6)));
  const systemPrompt = buildCampaignPillarSystemPrompt(brandContext);
  const userPrompt = buildCampaignPillarUserPrompt({
    campaignName: campaign.name,
    objective: ctx.normalized.objective,
    audience: ctx.normalized.audience,
    channels: ctx.normalized.platforms,
    count: pillarCount,
  });
  return { kind: "ai", systemPrompt, userPrompt, itemIndex: 0, itemsTotal: 1, itemLabel: `${pillarCount} pilares de contenido`, aiKind: "CAMPAIGN_PLAN" };
}

export async function completePillarsStage(ctx: StageContext, rawOutput: string): Promise<StageOutcome> {
  const drafts = parseCampaignPillarsText(rawOutput);
  if (drafts.length === 0) {
    return { kind: "failed", errorMessage: "La IA no devolvió ningún pilar utilizable. Puedes reintentar.", errorCategory: "AI" };
  }
  const validated = aiPillarsOutputSchema.safeParse(drafts);
  const usable = validated.success ? validated.data : drafts.filter((d) => d.name.trim().length > 0);
  if (usable.length === 0) {
    return { kind: "failed", errorMessage: "Los pilares generados no tienen el formato esperado.", errorCategory: "AI" };
  }

  // Deduplicate obvious semantic repeats (same normalized name) before saving.
  const seen = new Set<string>();
  const deduped = usable.filter((d) => {
    const key = d.name.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const maxOrder = await prisma.campaignPillar.aggregate({ where: { campaignId: ctx.run.campaignId! }, _max: { order: true } });
  let order = (maxOrder._max.order ?? -1) + 1;
  const created: { id: string; percentage: number | null }[] = [];

  for (const draft of deduped) {
    const pillar = await prisma.campaignPillar.create({
      data: {
        campaignId: ctx.run.campaignId!,
        name: draft.name.slice(0, 200),
        description: draft.description || null,
        objective: draft.objective || null,
        color: PILLAR_COLORS[order % PILLAR_COLORS.length],
        percentage: draft.percentage,
        formats: draft.formats,
        platforms: draft.platforms,
        topics: draft.topics,
        order: order++,
      },
    });
    await recordResource({ runId: ctx.run.id, stepId: ctx.step.id, type: "CAMPAIGN_PILLAR", action: "CREATED", campaignPillarId: pillar.id });
    created.push({ id: pillar.id, percentage: pillar.percentage });
  }

  const percentageSum = created.reduce((sum, p) => sum + (p.percentage ?? 0), 0);
  const warnings: string[] = [];
  if (Math.abs(percentageSum - 100) > 5) {
    warnings.push(`Los porcentajes de los pilares suman ${percentageSum}%, no 100% — revísalos manualmente si lo consideras necesario.`);
  }

  return { kind: "completed", output: { pillarIds: created.map((p) => p.id), percentageSum, warnings } };
}

// ---------------------------------------------------------------------------
// 5. CREATE_CONTENT_PLAN — AI, single item; output is a REVIEWABLE plan, not
// yet persisted as real pieces (that happens in CREATE_PIECES, so an
// approval gate configured on CREATE_PIECES can review this plan first).
// ---------------------------------------------------------------------------
export async function prepareContentPlanStage(ctx: StageContext): Promise<StageOutcome> {
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: ctx.run.campaignId! } });
  const pillars = await prisma.campaignPillar.findMany({ where: { campaignId: ctx.run.campaignId! }, select: { name: true } });
  const brandContext = await resolveBrandContext(ctx.normalized.brandProfileId);
  const systemPrompt = buildCampaignPlanSystemPrompt(brandContext);
  const userPrompt = buildCampaignPlanUserPrompt({
    campaignName: campaign.name,
    objective: ctx.normalized.objective,
    audience: ctx.normalized.audience,
    channels: ctx.normalized.platforms,
    pillarNames: pillars.map((p) => p.name),
    contentCount: ctx.normalized.maxPieces,
    startDate: ctx.normalized.startDate,
    endDate: ctx.normalized.endDate,
  });
  return { kind: "ai", systemPrompt, userPrompt, itemIndex: 0, itemsTotal: 1, itemLabel: `Plan de ${ctx.normalized.maxPieces} piezas`, aiKind: "CAMPAIGN_PLAN" };
}

export async function completeContentPlanStage(ctx: StageContext, rawOutput: string): Promise<StageOutcome> {
  const drafts = parseCampaignPlanText(rawOutput);
  if (drafts.length === 0) {
    return { kind: "failed", errorMessage: "La IA no devolvió ninguna pieza utilizable. Puedes reintentar.", errorCategory: "AI" };
  }
  const validated = aiContentPlanOutputSchema.safeParse(drafts);
  const usable = (validated.success ? validated.data : drafts).slice(0, ctx.normalized.maxPieces);

  const warnings: string[] = [];
  if (usable.length < ctx.normalized.maxPieces) {
    warnings.push(`Se solicitaron ${ctx.normalized.maxPieces} piezas y la IA generó ${usable.length}.`);
  }

  return { kind: "completed", output: { drafts: usable, warnings } };
}

// ---------------------------------------------------------------------------
// 6. CREATE_PIECES — deterministic, converts the reviewed plan into real
// CampaignContentPiece rows. Never deletes/overwrites existing pieces.
// ---------------------------------------------------------------------------
export async function runCreatePiecesStage(ctx: StageContext, planDrafts: unknown): Promise<StageOutcome> {
  const parsed = aiContentPlanOutputSchema.safeParse(planDrafts);
  if (!parsed.success || parsed.data.length === 0) {
    return { kind: "failed", errorMessage: "No hay un plan de contenidos válido para convertir en piezas.", errorCategory: "DEPENDENCY" };
  }

  const pillars = await prisma.campaignPillar.findMany({ where: { campaignId: ctx.run.campaignId! }, select: { id: true, name: true } });
  const pillarByName = new Map(pillars.map((p) => [p.name.toLowerCase().trim(), p.id]));

  const maxOrder = await prisma.campaignContentPiece.aggregate({ where: { campaignId: ctx.run.campaignId!, status: "IDEA" }, _max: { order: true } });
  let order = (maxOrder._max.order ?? -1) + 1;

  const createdIds: string[] = [];
  for (const draft of parsed.data) {
    const parsedDate = draft.date && !Number.isNaN(Date.parse(draft.date)) ? new Date(draft.date) : null;
    const piece = await prisma.campaignContentPiece.create({
      data: {
        campaignId: ctx.run.campaignId!,
        pillarId: pillarByName.get(draft.pillarName.toLowerCase().trim()) ?? null,
        title: draft.title.slice(0, 300),
        idea: draft.idea || null,
        platform: draft.platform,
        format: draft.format || null,
        objective: draft.objective || null,
        cta: draft.cta || null,
        scheduledDate: parsedDate,
        scheduledTime: draft.time || null,
        status: "IDEA",
        priority: "MEDIUM",
        keywords: draft.keywords,
        notes: draft.notes || null,
        assigneeId: ctx.normalized.assigneeId,
        authorId: ctx.userId,
        order: order++,
      },
    });
    await recordResource({ runId: ctx.run.id, stepId: ctx.step.id, type: "CAMPAIGN_CONTENT_PIECE", action: "CREATED", campaignContentPieceId: piece.id });
    createdIds.push(piece.id);
  }

  return { kind: "completed", output: { pieceIds: createdIds, created: createdIds.length } };
}

// ---------------------------------------------------------------------------
// 7. GENERATE_DRAFTS — AI, one item per piece created by this run that still
// lacks a ContentItem. Partial failure never blocks the other pieces (spec
// section 21) — the caller loops item-by-item and records failures per item.
// ---------------------------------------------------------------------------
export interface StepFailure {
  itemKey: string;
  label: string;
  message: string;
}

export function readStepFailures(step: MarketingBrainStep): StepFailure[] {
  const output = step.output as { failures?: StepFailure[] } | null;
  return output?.failures ?? [];
}

/** Steps that process many independent items — a single item failing must never fail the whole step (spec section 21); the orchestrator records it via appendStepFailure and moves on to the next item instead. */
export const MULTI_ITEM_TOLERANT_STEP_KEYS = ["GENERATE_DRAFTS", "ADAPT_PLATFORMS"] as const;

async function pendingPiecesForDrafts(runId: string, step: MarketingBrainStep) {
  const pieceResources = await prisma.marketingBrainResource.findMany({
    where: { runId, type: "CAMPAIGN_CONTENT_PIECE" },
    select: { campaignContentPieceId: true },
  });
  const pieceIds = pieceResources.map((r) => r.campaignContentPieceId).filter((id): id is string => Boolean(id));
  const doneResources = await prisma.marketingBrainResource.findMany({ where: { runId, type: "CONTENT_ITEM" }, select: { campaignContentPieceId: true } });
  const done = new Set(doneResources.map((r) => r.campaignContentPieceId));
  const failedIds = new Set(readStepFailures(step).map((f) => f.itemKey));
  const pieces = await prisma.campaignContentPiece.findMany({
    where: { id: { in: pieceIds } },
    orderBy: { order: "asc" },
  });
  return pieces.filter((p) => !done.has(p.id) && !failedIds.has(p.id) && !p.contentItemId);
}

export async function prepareGenerateDraftsStage(ctx: StageContext): Promise<StageOutcome> {
  const pending = await pendingPiecesForDrafts(ctx.run.id, ctx.step);
  if (pending.length === 0) return { kind: "completed", output: { failures: readStepFailures(ctx.step) } };

  const piece = pending[0];
  const brandContext = await resolveBrandContext(ctx.normalized.brandProfileId);
  const systemPrompt = buildContentGenerationSystemPrompt(brandContext);
  const userPrompt = buildContentGenerationPrompt({
    type: "OTHER",
    topic: piece.idea || piece.title,
    objective: piece.objective ?? "",
    audience: ctx.normalized.audience,
    tone: ctx.normalized.tone,
    language: ctx.normalized.language,
    keywords: piece.keywords.join(", "),
    forbiddenWords: ctx.normalized.forbiddenWords.join(", "),
    cta: piece.cta ?? "",
  } as Parameters<typeof buildContentGenerationPrompt>[0]);

  const totalPieceResources = await prisma.marketingBrainResource.count({ where: { runId: ctx.run.id, type: "CAMPAIGN_CONTENT_PIECE" } });
  return {
    kind: "ai",
    systemPrompt,
    userPrompt,
    itemIndex: totalPieceResources - pending.length,
    itemsTotal: totalPieceResources,
    itemLabel: piece.title,
    aiKind: "CONTENT_GENERATION",
  };
}

export async function completeGenerateDraftsStage(ctx: StageContext, rawOutput: string): Promise<StageOutcome> {
  const pending = await pendingPiecesForDrafts(ctx.run.id, ctx.step);
  const piece = pending[0];
  if (!piece) return { kind: "completed", output: { failures: readStepFailures(ctx.step) } };

  const body = rawOutput.trim();
  if (!body) {
    return { kind: "failed", errorMessage: `La IA no generó texto para "${piece.title}".`, errorCategory: "AI", itemKey: piece.id };
  }

  const contentItem = await prisma.contentItem.create({
    data: {
      projectId: ctx.projectId,
      authorId: ctx.userId,
      type: "OTHER",
      title: piece.title,
      body,
      channel: piece.platform,
      objective: piece.objective,
      cta: piece.cta,
      keywords: piece.keywords,
      brandProfileId: ctx.normalized.brandProfileId,
      sourceTool: "marketing-brain",
      tone: ctx.normalized.tone || null,
      language: ctx.normalized.language,
    },
  });

  await prisma.$transaction([
    prisma.campaignContent.create({ data: { campaignId: ctx.run.campaignId!, contentItemId: contentItem.id } }),
    prisma.campaignContentPiece.update({ where: { id: piece.id }, data: { contentItemId: contentItem.id, status: "PENDING" } }),
  ]);
  await recordResource({ runId: ctx.run.id, stepId: ctx.step.id, type: "CONTENT_ITEM", action: "CREATED", campaignContentPieceId: piece.id, contentItemId: contentItem.id });

  const remaining = await pendingPiecesForDrafts(ctx.run.id, ctx.step);
  return { kind: "completed", output: { justCreated: contentItem.id, remaining: remaining.length, failures: readStepFailures(ctx.step) } };
}

// ---------------------------------------------------------------------------
// 8. ADAPT_PLATFORMS — AI, one item per (ContentItem × additional platform).
// Adaptations are staged in the step's own output (small text snippets) —
// CREATE_PUBLICATIONS is what turns them into real SocialPost rows, so no
// second ContentItem/document model is ever created for an adaptation.
// ---------------------------------------------------------------------------
export interface StagedAdaptation {
  pieceId: string;
  contentItemId: string;
  platform: string;
  text: string;
}

async function adaptationTargets(ctx: StageContext): Promise<{ pieceId: string; contentItemId: string; platform: string; title: string; originalPlatform: string }[]> {
  const itemResources = await prisma.marketingBrainResource.findMany({
    where: { runId: ctx.run.id, type: "CONTENT_ITEM" },
    select: { campaignContentPieceId: true, contentItemId: true },
  });
  const pieces = await prisma.campaignContentPiece.findMany({
    where: { id: { in: itemResources.map((r) => r.campaignContentPieceId).filter((id): id is string => Boolean(id)) } },
  });
  const pieceById = new Map(pieces.map((p) => [p.id, p]));

  const targets: { pieceId: string; contentItemId: string; platform: string; title: string; originalPlatform: string }[] = [];
  for (const r of itemResources) {
    const piece = r.campaignContentPieceId ? pieceById.get(r.campaignContentPieceId) : null;
    if (!piece || !r.contentItemId) continue;
    for (const platform of ctx.normalized.platforms) {
      if (platform === piece.platform) continue;
      if (!findRepurposeChannel(platform)) continue;
      targets.push({ pieceId: piece.id, contentItemId: r.contentItemId, platform, title: piece.title, originalPlatform: piece.platform });
    }
  }
  return targets;
}

export function readStagedAdaptations(step: MarketingBrainStep): StagedAdaptation[] {
  const output = step.output as { adaptations?: StagedAdaptation[] } | null;
  return output?.adaptations ?? [];
}

function pendingAdaptationTargets(
  targets: { pieceId: string; contentItemId: string; platform: string; title: string; originalPlatform: string }[],
  step: MarketingBrainStep
) {
  const already = readStagedAdaptations(step);
  const failedKeys = new Set(readStepFailures(step).map((f) => f.itemKey));
  const doneKeys = new Set(already.map((a) => `${a.contentItemId}:${a.platform}`));
  return targets.filter((t) => {
    const key = `${t.contentItemId}:${t.platform}`;
    return !doneKeys.has(key) && !failedKeys.has(key);
  });
}

export async function prepareAdaptPlatformsStage(ctx: StageContext): Promise<StageOutcome> {
  if (!ctx.normalized.autoAdaptPlatforms) return { kind: "completed", output: { adaptations: [], skipped: true } };

  const targets = await adaptationTargets(ctx);
  const already = readStagedAdaptations(ctx.step);
  const pending = pendingAdaptationTargets(targets, ctx.step);

  if (pending.length === 0) return { kind: "completed", output: { adaptations: already, failures: readStepFailures(ctx.step) } };

  const contentItem = await prisma.contentItem.findUniqueOrThrow({ where: { id: pending[0].contentItemId } });
  const channel = findRepurposeChannel(pending[0].platform)!;
  const brandContext = await resolveBrandContext(ctx.normalized.brandProfileId);
  const systemPrompt = `${channel.buildSystemPrompt(brandContext)}`;
  const userPrompt = channel.buildUserPrompt(contentItem.body);

  return {
    kind: "ai",
    systemPrompt,
    userPrompt,
    itemIndex: targets.length - pending.length,
    itemsTotal: targets.length,
    itemLabel: `${pending[0].title} → ${channel.label}`,
    aiKind: "ADAPTATION",
  };
}

export async function completeAdaptPlatformsStage(ctx: StageContext, rawOutput: string): Promise<StageOutcome> {
  const targets = await adaptationTargets(ctx);
  const already = readStagedAdaptations(ctx.step);
  const pending = pendingAdaptationTargets(targets, ctx.step);
  const target = pending[0];
  if (!target) return { kind: "completed", output: { adaptations: already, failures: readStepFailures(ctx.step) } };

  const text = rawOutput.trim().slice(0, 5000);
  const itemKey = `${target.contentItemId}:${target.platform}`;
  if (!text) {
    return { kind: "failed", errorMessage: `La IA no generó una adaptación para ${target.platform}.`, errorCategory: "AI", itemKey };
  }

  const next = [...already, { pieceId: target.pieceId, contentItemId: target.contentItemId, platform: target.platform, text }];
  return { kind: "completed", output: { adaptations: next, failures: readStepFailures(ctx.step) } };
}

// ---------------------------------------------------------------------------
// 9. CREATE_PUBLICATIONS — deterministic, creates real SocialPost rows for
// every ContentItem (primary platform) and staged adaptation.
// ---------------------------------------------------------------------------
export async function runCreatePublicationsStage(ctx: StageContext, stagedAdaptations: StagedAdaptation[]): Promise<StageOutcome> {
  const itemResources = await prisma.marketingBrainResource.findMany({
    where: { runId: ctx.run.id, type: "CONTENT_ITEM" },
    select: { campaignContentPieceId: true, contentItemId: true },
  });
  const alreadyPublished = await prisma.marketingBrainResource.findMany({ where: { runId: ctx.run.id, type: "SOCIAL_POST" }, select: { contentItemId: true } });
  const publishedContentItemIds = new Set(alreadyPublished.map((r) => r.contentItemId));

  const pieces = await prisma.campaignContentPiece.findMany({
    where: { id: { in: itemResources.map((r) => r.campaignContentPieceId).filter((id): id is string => Boolean(id)) } },
  });
  const pieceById = new Map(pieces.map((p) => [p.id, p]));
  const channelBySocialPlatform = new Map(
    CAMPAIGN_CHANNELS.filter((c) => c.socialPlatform).map((c) => [c.id, c.socialPlatform as SocialPlatform])
  );

  const status = ctx.normalized.requireApproval ? "IN_REVIEW" : "DRAFT";
  const created: string[] = [];
  const failures: { label: string; message: string }[] = [];

  for (const r of itemResources) {
    if (!r.contentItemId || publishedContentItemIds.has(r.contentItemId)) continue;
    const piece = r.campaignContentPieceId ? pieceById.get(r.campaignContentPieceId) : null;
    const contentItem = await prisma.contentItem.findUnique({ where: { id: r.contentItemId } });
    if (!contentItem) continue;
    const platform = channelBySocialPlatform.get(piece?.platform ?? "");
    if (!platform) {
      failures.push({ label: contentItem.title, message: `La plataforma "${piece?.platform}" no admite publicación en Publishing Hub.` });
      continue;
    }
    try {
      const post = await prisma.socialPost.create({
        data: {
          projectId: ctx.projectId,
          authorId: ctx.userId,
          platform,
          postType: platform.toLowerCase(),
          internalTitle: contentItem.title,
          text: contentItem.body,
          status,
          campaignId: ctx.run.campaignId!,
          sourceContentId: contentItem.id,
          sourcePieceId: piece?.id ?? null,
          brandProfileId: ctx.normalized.brandProfileId,
          cta: piece?.cta ?? null,
          scheduledAt: piece?.scheduledDate ?? null,
          timezone: ctx.normalized.timezone,
          assigneeId: ctx.normalized.assigneeId,
          approverId: ctx.normalized.requireApproval ? ctx.normalized.approverId : null,
        },
      });
      await recordResource({ runId: ctx.run.id, stepId: ctx.step.id, type: "SOCIAL_POST", action: "CREATED", contentItemId: contentItem.id, socialPostId: post.id });
      created.push(post.id);
    } catch (err) {
      failures.push({ label: contentItem.title, message: err instanceof Error ? err.message : "Error desconocido al crear la publicación." });
    }
  }

  for (const adaptation of stagedAdaptations) {
    const alreadyAdapted = await prisma.marketingBrainResource.findFirst({
      where: { runId: ctx.run.id, type: "SOCIAL_POST", contentItemId: adaptation.contentItemId, socialPost: { platform: channelBySocialPlatform.get(adaptation.platform) } },
    });
    if (alreadyAdapted) continue;
    const platform = channelBySocialPlatform.get(adaptation.platform);
    if (!platform) continue;
    const piece = pieceById.get(adaptation.pieceId);
    try {
      const post = await prisma.socialPost.create({
        data: {
          projectId: ctx.projectId,
          authorId: ctx.userId,
          platform,
          postType: platform.toLowerCase(),
          internalTitle: `${piece?.title ?? "Adaptación"} (${adaptation.platform})`,
          text: adaptation.text,
          status,
          campaignId: ctx.run.campaignId!,
          sourceContentId: adaptation.contentItemId,
          sourcePieceId: adaptation.pieceId,
          brandProfileId: ctx.normalized.brandProfileId,
          scheduledAt: piece?.scheduledDate ?? null,
          timezone: ctx.normalized.timezone,
          assigneeId: ctx.normalized.assigneeId,
          approverId: ctx.normalized.requireApproval ? ctx.normalized.approverId : null,
        },
      });
      // A given (runId, contentItemId) is only unique once per resource row — an adaptation shares the ORIGINAL contentItemId, so record it keyed by the new socialPostId only (never violates the runId+contentItemId uniqueness meant for the PRIMARY post).
      await prisma.marketingBrainResource.create({
        data: { runId: ctx.run.id, stepId: ctx.step.id, type: "SOCIAL_POST", action: "CREATED", socialPostId: post.id },
      });
      created.push(post.id);
    } catch (err) {
      failures.push({ label: `${piece?.title ?? "Adaptación"} (${adaptation.platform})`, message: err instanceof Error ? err.message : "Error desconocido." });
    }
  }

  return { kind: "completed", output: { created: created.length, failed: failures.length, failures } };
}

// ---------------------------------------------------------------------------
// 10. PREPARE_APPROVAL — deterministic, informational.
// ---------------------------------------------------------------------------
export async function runPrepareApprovalStage(ctx: StageContext): Promise<StageOutcome> {
  const posts = await prisma.socialPost.findMany({ where: { campaignId: ctx.run.campaignId!, sourceContentId: { not: null } } });
  const pendingApproval = posts.filter((p) => p.status === "IN_REVIEW").length;
  return { kind: "completed", output: { totalPublications: posts.length, pendingApproval, requiresApproval: ctx.normalized.requireApproval } };
}

// ---------------------------------------------------------------------------
// 11. PREPARE_CALENDAR — deterministic, conflict detection only (advisory).
// ---------------------------------------------------------------------------
export async function runPrepareCalendarStage(ctx: StageContext): Promise<StageOutcome> {
  const posts = await prisma.socialPost.findMany({
    where: { projectId: ctx.projectId, scheduledAt: { not: null } },
    select: { id: true, platform: true, scheduledAt: true, campaignId: true },
  });
  const runPosts = posts.filter((p) => p.campaignId === ctx.run.campaignId);
  const conflictIds = new Set<string>();
  for (const post of runPosts) {
    const found = findSchedulingConflicts(
      { platform: post.platform, scheduledAt: post.scheduledAt!, excludeId: post.id },
      posts.map((p) => ({ id: p.id, platform: p.platform, scheduledAt: p.scheduledAt! }))
    );
    if (found.length > 0) conflictIds.add(post.id);
  }
  return { kind: "completed", output: { scheduledCount: runPosts.length, conflicts: conflictIds.size } };
}

// ---------------------------------------------------------------------------
// 12. SCHEDULE — deterministic. Only moves posts that are actually
// schedulable (per canSchedule's approval-gate logic); never simulates a
// real external publish.
// ---------------------------------------------------------------------------
export async function runScheduleStage(ctx: StageContext): Promise<StageOutcome> {
  if (ctx.normalized.schedulingMode !== "automatic") {
    return { kind: "completed", output: { scheduled: 0, skipped: true } };
  }

  const posts = await prisma.socialPost.findMany({ where: { campaignId: ctx.run.campaignId!, scheduledAt: { not: null }, status: { notIn: ["SCHEDULED", "PUBLISHED", "CANCELLED"] } } });
  let scheduled = 0;
  for (const post of posts) {
    if (!canSchedule(post.status, ctx.normalized.requireApproval)) continue;
    await prisma.socialPost.update({ where: { id: post.id }, data: { status: "SCHEDULED" } });
    scheduled += 1;
  }
  return { kind: "completed", output: { scheduled, totalEligible: posts.length } };
}
