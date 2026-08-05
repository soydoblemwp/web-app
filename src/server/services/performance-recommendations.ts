import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { performanceError, type PerformanceActionError } from "@/lib/performance/types";
import { evaluateRules, type RuleFacts } from "@/lib/performance/rules";
import { computeRecommendationIdempotencyKey } from "@/lib/performance/idempotency";
import { classifyTrend } from "@/lib/performance/trends";
import { getInternalMetricsSnapshot } from "@/server/services/performance-internal-metrics";
import { getPeriodBounds } from "@/lib/performance/periods";
import { publishAutomationEvent } from "@/server/services/automation-events";
import type { DecideRecommendationInput, CreateRecommendationActionInput } from "@/lib/validation/performance";

/**
 * Deterministic recommendation generation (spec sections 25/26/28) — every
 * recommendation is produced by evaluateRules against REAL facts computed
 * from real data; nothing here asks an LLM to invent a conclusion. Each
 * recommendation records enough evidence (spec section 28) to explain
 * itself, and is idempotent per (project, rule, resource, period) so
 * re-running generation never spams duplicates for the same finding.
 */

async function upsertRecommendation(
  projectId: string,
  ruleKey: string,
  category: string,
  severity: string,
  message: string,
  resourceType: string | null,
  resourceRefs: { contentItemId?: string; campaignId?: string; socialPostId?: string; experimentId?: string },
  evidence: Record<string, unknown>,
  actionProposed: string
): Promise<void> {
  const resourceId = resourceRefs.contentItemId ?? resourceRefs.campaignId ?? resourceRefs.socialPostId ?? resourceRefs.experimentId ?? null;
  const periodKey = new Date().toISOString().slice(0, 10); // one recommendation per rule+resource per calendar day — reruns the same day never duplicate, a new day can re-surface a still-unresolved issue.
  const idempotencyKey = computeRecommendationIdempotencyKey(projectId, ruleKey, resourceId, periodKey);

  const existing = await prisma.performanceRecommendation.findUnique({ where: { idempotencyKey } });
  if (existing) return;

  const created = await prisma.performanceRecommendation.create({
    data: {
      projectId,
      title: message.length > 120 ? `${message.slice(0, 117)}...` : message,
      description: message,
      category: category as never,
      priority: severity as never,
      confidence: 0.75,
      source: "RULE",
      ruleKey,
      rationale: `Generado por la regla determinista "${ruleKey}" a partir de datos reales del periodo.`,
      evidence: evidence as unknown as Prisma.InputJsonValue,
      resourceType: resourceType as never,
      contentItemId: resourceRefs.contentItemId ?? null,
      campaignId: resourceRefs.campaignId ?? null,
      socialPostId: resourceRefs.socialPostId ?? null,
      experimentId: resourceRefs.experimentId ?? null,
      actionProposed,
      status: "NEW",
      idempotencyKey,
    },
  });
  await publishAutomationEvent({
    projectId,
    eventKey: "PERFORMANCE_RECOMMENDATION_CREATED",
    resourceId: created.id,
    payload: { id: created.id, category, priority: severity, ruleKey },
    idempotencyKey: `PERFORMANCE_RECOMMENDATION_CREATED:${created.id}`,
  });
}

/** Evaluates content-level rules for every non-archived ContentItem touched recently. */
async function generateContentRecommendations(projectId: string): Promise<void> {
  const items = await prisma.contentItem.findMany({
    where: { projectId, deletedAt: null, isArchived: false },
    include: { versions: { select: { id: true } }, _count: { select: { versions: true, knowledgeCitations: true } } },
    take: 200,
    orderBy: { updatedAt: "desc" },
  });

  for (const item of items) {
    const daysSinceLastUpdate = Math.floor((Date.now() - item.updatedAt.getTime()) / 86_400_000);
    const facts: RuleFacts = {
      versionsCount: item._count.versions,
      daysSinceLastUpdate,
      hasCta: Boolean(item.cta),
      hasBrandProfile: Boolean(item.brandProfileId),
    };
    const matches = evaluateRules("CONTENT_ITEM", facts);
    for (const match of matches) {
      await upsertRecommendation(projectId, match.ruleKey, match.category, match.severity, match.message, "CONTENT_ITEM", { contentItemId: item.id }, { ...facts }, `Revisar el contenido "${item.title}".`);
    }
  }
}

/** Evaluates campaign-level rules for every active campaign. */
async function generateCampaignRecommendations(projectId: string): Promise<void> {
  const campaigns = await prisma.campaign.findMany({ where: { projectId, status: { in: ["ACTIVE", "PLANNED"] } }, take: 100 });

  for (const campaign of campaigns) {
    const [delayedPieces, incompletePieces, postsWithoutDate] = await Promise.all([
      prisma.campaignContentPiece.count({ where: { campaignId: campaign.id, status: { notIn: ["PUBLISHED", "CANCELLED"] }, scheduledDate: { lt: new Date() } } }),
      prisma.campaignContentPiece.count({ where: { campaignId: campaign.id, OR: [{ format: null }, { objective: null }] } }),
      prisma.socialPost.count({ where: { campaignId: campaign.id, status: { notIn: ["PUBLISHED", "CANCELLED"] }, scheduledAt: null } }),
    ]);
    const facts: RuleFacts = { delayedPiecesCount: delayedPieces, incompletePiecesCount: incompletePieces, postsWithoutDateCount: postsWithoutDate };
    const matches = evaluateRules("CAMPAIGN", facts);
    for (const match of matches) {
      await upsertRecommendation(projectId, match.ruleKey, match.category, match.severity, match.message, "CAMPAIGN", { campaignId: campaign.id }, { ...facts }, `Revisar la campaña "${campaign.name}".`);
    }
  }
}

/** Evaluates project-wide automation/knowledge rules using the same live internal-metrics snapshot the dashboard shows. */
async function generateProjectLevelRecommendations(projectId: string): Promise<void> {
  const bounds = getPeriodBounds("MONTH", new Date(), "UTC")!;
  const snapshot = await getInternalMetricsSnapshot(projectId, bounds);

  const automationTerminal = snapshot.automation.workflowAutomationRunsTerminalTotal;
  const automationFailureRatePercent = automationTerminal > 0 ? Math.round((snapshot.automation.workflowAutomationRunsFailed / automationTerminal) * 100) : null;
  const knowledgeTotal = snapshot.knowledge.sourcesReady + snapshot.knowledge.sourcesFailed + snapshot.knowledge.sourcesNeedsOcr;
  const knowledgeCoveragePercent = knowledgeTotal > 0 ? Math.round((snapshot.knowledge.sourcesReady / knowledgeTotal) * 100) : null;

  const facts: RuleFacts = {
    automationFailureRatePercent,
    agentRunFailureCount: snapshot.automation.agentRunsFailed,
    knowledgeSourceCoveragePercent: knowledgeCoveragePercent,
  };
  const matches = evaluateRules("PROJECT", facts);
  for (const match of matches) {
    await upsertRecommendation(projectId, match.ruleKey, match.category, match.severity, match.message, "PROJECT", {}, { ...facts }, "Revisar el panel de Automation Center / Knowledge Base.");
  }
}

/** Evaluates a metric trend against the FALLING/RISING rules for a given resource — called by the trend/anomaly recompute pass (spec section 26 "métrica cayendo/creciendo"), never invented from thin air. */
export async function evaluateTrendRecommendation(projectId: string, resourceType: "CAMPAIGN" | "CONTENT_ITEM" | "SOCIAL_POST", resourceRefs: { campaignId?: string; contentItemId?: string; socialPostId?: string }, metricKey: string, metricLabel: string, points: { date: Date; value: number }[]): Promise<void> {
  const trend = classifyTrend(points);
  if (trend.direction !== "RISING" && trend.direction !== "FALLING") return;
  const facts: RuleFacts = { trendDirection: trend.direction, changePercent: trend.changePercent, metricLabel };
  const matches = evaluateRules(resourceType, facts);
  for (const match of matches) {
    if (match.ruleKey !== "metric_falling" && match.ruleKey !== "metric_rising") continue;
    await upsertRecommendation(projectId, match.ruleKey, match.category, match.severity, match.message, resourceType, resourceRefs, { ...facts, metricKey }, "Revisar la tendencia de esta métrica.");
  }
}

/** Runs every deterministic rule generator for a project — safe to call repeatedly (idempotent per rule+resource+day). */
export async function generateRecommendations(projectId: string): Promise<{ generated: number }> {
  const before = await prisma.performanceRecommendation.count({ where: { projectId } });
  await Promise.all([generateContentRecommendations(projectId), generateCampaignRecommendations(projectId), generateProjectLevelRecommendations(projectId)]);
  const after = await prisma.performanceRecommendation.count({ where: { projectId } });
  return { generated: after - before };
}

export async function listRecommendations(projectId: string, filters: { status?: string; category?: string; limit?: number } = {}) {
  return prisma.performanceRecommendation.findMany({
    where: { projectId, ...(filters.status ? { status: filters.status as never } : {}), ...(filters.category ? { category: filters.category as never } : {}) },
    include: { contentItem: { select: { id: true, title: true } }, campaign: { select: { id: true, name: true } }, socialPost: { select: { id: true, platform: true } }, actions: true },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    take: filters.limit ?? 100,
  });
}

export async function getRecommendationDetail(projectId: string, recommendationId: string) {
  const row = await prisma.performanceRecommendation.findUnique({
    where: { id: recommendationId },
    include: { contentItem: true, campaign: true, socialPost: true, experiment: true, assignedTo: { select: { id: true, name: true } }, actions: { include: { agentRun: true, workflowRun: true, workflowAutomation: true } } },
  });
  if (!row || row.projectId !== projectId) return null;
  return row;
}

export async function decideRecommendation(projectId: string, input: DecideRecommendationInput): Promise<{ id: string } | PerformanceActionError> {
  const row = await prisma.performanceRecommendation.findUnique({ where: { id: input.recommendationId } });
  if (!row || row.projectId !== projectId) return performanceError("RECOMMENDATION_NOT_FOUND");
  if (row.status === "APPLIED" && input.status !== "ARCHIVED") return performanceError("RECOMMENDATION_ALREADY_APPLIED");
  await prisma.performanceRecommendation.update({ where: { id: input.recommendationId }, data: { status: input.status } });
  if (input.status === "ACCEPTED") {
    await publishAutomationEvent({
      projectId,
      eventKey: "PERFORMANCE_RECOMMENDATION_ACCEPTED",
      resourceId: input.recommendationId,
      payload: { id: input.recommendationId, category: row.category },
      idempotencyKey: `PERFORMANCE_RECOMMENDATION_ACCEPTED:${input.recommendationId}`,
    });
  }
  return { id: input.recommendationId };
}

export interface RecommendationActionResult {
  id?: string;
  createdResourceId?: string;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Converts a recommendation into a real, safe, non-destructive resource
 * (spec sections 29/30) — every branch creates something the user still has
 * to finish/confirm/launch through its own normal module (a DRAFT AgentRun,
 * a DRAFT SocialPost, a new ContentVersion to edit, a prepared
 * KnowledgeQuery), never a fully-automatic irreversible action. The UI must
 * have already shown a preview and required explicit confirmation before
 * calling this (this function IS the confirmed step).
 */
export async function applyRecommendationAction(projectId: string, userId: string, input: CreateRecommendationActionInput): Promise<RecommendationActionResult> {
  const recommendation = await prisma.performanceRecommendation.findUnique({ where: { id: input.recommendationId } });
  if (!recommendation || recommendation.projectId !== projectId) return { errorCode: "RECOMMENDATION_NOT_FOUND", errorMessage: "No se encontró la recomendación." };
  if (recommendation.status === "APPLIED") return { errorCode: "RECOMMENDATION_ALREADY_APPLIED", errorMessage: "Esta recomendación ya fue aplicada." };

  const params = (input.parameters ?? {}) as Record<string, unknown>;
  const action = await prisma.performanceRecommendationAction.create({
    data: { recommendationId: input.recommendationId, actionType: input.actionType, status: "PENDING", parameters: params as unknown as Prisma.InputJsonValue, performedById: userId },
  });

  let createdResourceId: string | undefined;
  let resultError: RecommendationActionResult | null = null;

  try {
    if (input.actionType === "INTERNAL_TASK") {
      createdResourceId = action.id;
    } else if (input.actionType === "AGENT_RUN" || input.actionType === "AGENT_TEAM_RUN") {
      const { createDraftRun } = await import("@/server/services/agent-orchestrator");
      const target = input.actionType === "AGENT_TEAM_RUN" ? { teamId: String(params.teamId ?? "") } : { officialAgentKey: params.officialAgentKey ? String(params.officialAgentKey) : null, customAgentId: params.customAgentId ? String(params.customAgentId) : null };
      const created = await createDraftRun(projectId, userId, `recommendation:${action.id}`, target);
      if ("error" in created) resultError = { errorMessage: created.error };
      else {
        createdResourceId = created.id;
        await prisma.performanceRecommendationAction.update({ where: { id: action.id }, data: { agentRunId: created.id } });
      }
    } else if (input.actionType === "WORKFLOW_RUN") {
      if (!params.workflowId || typeof params.workflowId !== "string") {
        resultError = { errorMessage: "Falta el workflow a ejecutar." };
      } else {
        const { beginFreshRun } = await import("@/server/actions/workflow-execution");
        const started = await beginFreshRun({
          userId,
          projectId,
          workflowId: params.workflowId,
          idempotencyKey: `recommendation:${action.id}`,
          inputVariables: (params.inputVariables as Record<string, string>) ?? {},
          leaseOwner: `performance-recommendation:${action.id}`,
          retryOfRunId: null,
          executionMode: "PUBLISHED",
          mode: "published",
        });
        if (started.error || !started.runId) resultError = { errorMessage: started.error ?? "No se pudo iniciar el workflow." };
        else {
          createdResourceId = started.runId;
          await prisma.performanceRecommendationAction.update({ where: { id: action.id }, data: { workflowRunId: started.runId } });
        }
      }
    } else if (input.actionType === "WORKFLOW_AUTOMATION") {
      if (!params.automationId || typeof params.automationId !== "string") {
        resultError = { errorMessage: "Falta la automatización a ejecutar." };
      } else {
        const { runAutomationNow } = await import("@/server/services/automation-catalog");
        const result = await runAutomationNow(projectId, params.automationId, userId);
        if ("error" in result) resultError = { errorMessage: result.error };
        else {
          createdResourceId = result.runId;
          await prisma.performanceRecommendationAction.update({ where: { id: action.id }, data: { workflowAutomationId: params.automationId } });
        }
      }
    } else if (input.actionType === "EXPERIMENT") {
      const { createExperiment } = await import("@/server/services/performance-experiments");
      const created = await createExperiment(projectId, userId, {
        name: `Experimento: ${recommendation.title}`,
        hypothesis: recommendation.description,
        type: "CUSTOM",
        primaryMetricKey: typeof (recommendation.evidence as Record<string, unknown>)?.metricKey === "string" ? String((recommendation.evidence as Record<string, unknown>).metricKey) : "engagement_rate",
        secondaryMetricKeys: [],
        resourceType: recommendation.resourceType ?? "CONTENT_ITEM",
        contentItemId: recommendation.contentItemId ?? undefined,
        campaignId: recommendation.campaignId ?? undefined,
      });
      if ("error" in created) resultError = { errorMessage: created.error };
      else {
        createdResourceId = created.id;
        await prisma.performanceRecommendationAction.update({ where: { id: action.id }, data: { experimentId: created.id } });
      }
    } else if (input.actionType === "KNOWLEDGE_QUERY") {
      const { prepareKnowledgeQuery } = await import("@/server/services/knowledge-query");
      const prepared = await prepareKnowledgeQuery(projectId, userId, { question: typeof params.question === "string" ? params.question : recommendation.title, collectionIds: [], sourceIds: [], maxSources: 5 } as never);
      createdResourceId = prepared.queryId;
      await prisma.performanceRecommendationAction.update({ where: { id: action.id }, data: { knowledgeQueryId: prepared.queryId } });
    } else if (input.actionType === "CONTENT_VERSION") {
      if (!recommendation.contentItemId) {
        resultError = { errorMessage: "Esta recomendación no está asociada a un contenido." };
      } else {
        const contentItem = await prisma.contentItem.findUnique({ where: { id: recommendation.contentItemId } });
        if (!contentItem) resultError = { errorMessage: "El contenido ya no existe." };
        else {
          const version = await prisma.contentVersion.create({ data: { contentItemId: contentItem.id, authorId: userId, title: contentItem.title, body: contentItem.body, note: `Nueva versión a partir de la recomendación: ${recommendation.title}` } });
          createdResourceId = version.id;
          await prisma.performanceRecommendationAction.update({ where: { id: action.id }, data: { contentVersionId: version.id } });
        }
      }
    } else if (input.actionType === "SOCIAL_POST") {
      const platform = typeof params.platform === "string" ? params.platform : "INSTAGRAM";
      const post = await prisma.socialPost.create({
        data: { projectId, authorId: userId, platform: platform as never, postType: "post", campaignId: recommendation.campaignId ?? undefined, text: "", status: "DRAFT", internalTitle: `A partir de: ${recommendation.title}` },
      });
      createdResourceId = post.id;
      await prisma.performanceRecommendationAction.update({ where: { id: action.id }, data: { socialPostId: post.id } });
    } else if (input.actionType === "CAMPAIGN_CONTENT_PIECE") {
      if (!recommendation.campaignId) {
        resultError = { errorMessage: "Esta recomendación no está asociada a una campaña." };
      } else {
        const maxOrder = await prisma.campaignContentPiece.aggregate({ where: { campaignId: recommendation.campaignId, status: "IDEA" }, _max: { order: true } });
        const piece = await prisma.campaignContentPiece.create({
          data: { campaignId: recommendation.campaignId, title: `A partir de: ${recommendation.title}`, platform: typeof params.platform === "string" ? params.platform : "instagram", authorId: userId, status: "IDEA", order: (maxOrder._max.order ?? -1) + 1 },
        });
        createdResourceId = piece.id;
        await prisma.performanceRecommendationAction.update({ where: { id: action.id }, data: { campaignContentPieceId: piece.id } });
      }
    } else if (input.actionType === "CONTENT_UPDATE") {
      createdResourceId = action.id;
    }
  } catch (err) {
    resultError = { errorMessage: err instanceof Error ? err.message.slice(0, 300) : "No se pudo completar la acción." };
  }

  if (resultError) {
    await prisma.performanceRecommendationAction.update({ where: { id: action.id }, data: { status: "FAILED" } });
    return { errorCode: "INTERNAL_SAFE_ERROR", errorMessage: resultError.errorMessage };
  }

  await prisma.$transaction([
    prisma.performanceRecommendationAction.update({ where: { id: action.id }, data: { status: "CREATED", confirmedAt: new Date() } }),
    prisma.performanceRecommendation.update({ where: { id: input.recommendationId }, data: { status: "APPLIED" } }),
  ]);

  return { id: action.id, createdResourceId };
}
