import "server-only";
import { prisma } from "@/lib/db/prisma";
import { mbOptimizationError, type MbOptimizationActionError } from "@/lib/marketing-brain/optimization-types";
import { publishAutomationEvent } from "@/server/services/automation-events";
import type { ConvertScenarioActionInput } from "@/lib/validation/marketing-brain-optimization";

/**
 * Converts a single, user-selected scenario action into a real DRAFT
 * resource via the project's EXISTING domain services (Fase 35 spec section
 * 13) — never a direct insert bypassing those services when one already
 * owns the resource's invariants. Idempotent: convertedAt/convertedById are
 * claimed atomically once; a second call on an already-converted action
 * returns the same resource, never creates a duplicate. Only ever runs
 * against an APPROVED session — no draft/rejected/pending strategy can spawn
 * real resources.
 */
export async function convertScenarioAction(
  projectId: string,
  userId: string,
  input: ConvertScenarioActionInput
): Promise<{ id: string; createdResourceId?: string; alreadyConverted?: boolean } | MbOptimizationActionError> {
  const action = await prisma.marketingBrainScenarioAction.findUnique({
    where: { id: input.scenarioActionId },
    include: { scenario: { include: { session: true } } },
  });
  if (!action || action.projectId !== projectId) return mbOptimizationError("SCENARIO_ACTION_NOT_FOUND");
  if (action.scenario.session.status !== "APPROVED") return mbOptimizationError("SESSION_NOT_EDITABLE", "Solo puedes convertir acciones de una estrategia aprobada.");

  if (action.convertedAt) {
    const existingId = action.campaignContentPieceId ?? action.contentItemId ?? action.socialPostId ?? action.agentRunId ?? action.knowledgeQueryId ?? action.id;
    return { id: action.id, createdResourceId: existingId, alreadyConverted: true };
  }

  const claim = await prisma.marketingBrainScenarioAction.updateMany({
    where: { id: action.id, convertedAt: null },
    data: { convertedAt: new Date(), convertedById: userId, actionType: input.actionType },
  });
  if (claim.count === 0) {
    const raced = await prisma.marketingBrainScenarioAction.findUnique({ where: { id: action.id } });
    const existingId = raced?.campaignContentPieceId ?? raced?.contentItemId ?? raced?.socialPostId ?? raced?.agentRunId ?? raced?.knowledgeQueryId ?? action.id;
    return { id: action.id, createdResourceId: existingId, alreadyConverted: true };
  }

  const params = input.parameters ?? {};
  const session = action.scenario.session;
  let createdResourceId: string | undefined;

  try {
    if (input.actionType === "CAMPAIGN_CONTENT_PIECE") {
      if (!session.campaignId) return mbOptimizationError("RESOURCE_NOT_FOUND", "Esta sesión no está asociada a una campaña.");
      const maxOrder = await prisma.campaignContentPiece.aggregate({ where: { campaignId: session.campaignId, status: "IDEA" }, _max: { order: true } });
      const piece = await prisma.campaignContentPiece.create({
        data: { campaignId: session.campaignId, title: action.title, idea: action.description, platform: params.platform || action.channel || "instagram", authorId: userId, status: "IDEA", order: (maxOrder._max.order ?? -1) + 1 },
      });
      createdResourceId = piece.id;
      await prisma.marketingBrainScenarioAction.update({ where: { id: action.id }, data: { campaignContentPieceId: piece.id } });
    } else if (input.actionType === "CONTENT_ITEM") {
      const item = await prisma.contentItem.create({
        data: { projectId, authorId: userId, type: "OTHER", title: action.title, body: action.description, status: "DRAFT", channel: params.platform || action.channel || null, objective: action.scenario?.objective ?? null },
      });
      createdResourceId = item.id;
      await prisma.marketingBrainScenarioAction.update({ where: { id: action.id }, data: { contentItemId: item.id } });
    } else if (input.actionType === "SOCIAL_POST") {
      const platform = params.platform || action.channel || "INSTAGRAM";
      const post = await prisma.socialPost.create({
        data: { projectId, authorId: userId, campaignId: session.campaignId ?? undefined, platform: platform as never, postType: "post", internalTitle: action.title, text: action.description, status: "DRAFT" },
      });
      createdResourceId = post.id;
      await prisma.marketingBrainScenarioAction.update({ where: { id: action.id }, data: { socialPostId: post.id } });
    } else if (input.actionType === "AGENT_RUN") {
      const { createDraftRun } = await import("@/server/services/agent-orchestrator");
      const created = await createDraftRun(projectId, userId, `mb-scenario-action:${action.id}`, { officialAgentKey: null, customAgentId: null, teamId: null });
      if ("error" in created || !created.id) return mbOptimizationError("INTERNAL_SAFE_ERROR", created.error);
      createdResourceId = created.id;
      await prisma.marketingBrainScenarioAction.update({ where: { id: action.id }, data: { agentRunId: created.id } });
    } else if (input.actionType === "KNOWLEDGE_QUERY") {
      const { prepareKnowledgeQuery } = await import("@/server/services/knowledge-query");
      const prepared = await prepareKnowledgeQuery(projectId, userId, { question: params.question || action.title, collectionIds: [], sourceIds: [], maxSources: 5 } as never);
      createdResourceId = prepared.queryId;
      await prisma.marketingBrainScenarioAction.update({ where: { id: action.id }, data: { knowledgeQueryId: prepared.queryId } });
    }
    // TASK: no resource created — the row itself (now marked convertedAt) is the marker.
  } catch (err) {
    await prisma.marketingBrainScenarioAction.update({ where: { id: action.id }, data: { convertedAt: null, convertedById: null } });
    return mbOptimizationError("INTERNAL_SAFE_ERROR", err instanceof Error ? err.message.slice(0, 300) : undefined);
  }

  await publishAutomationEvent({
    projectId,
    eventKey: "marketing_brain_optimization.action_converted",
    resourceId: action.id,
    actorId: userId,
    payload: { id: action.id, actionType: input.actionType },
    idempotencyKey: `marketing_brain_optimization.action_converted:${action.id}`,
  });

  return { id: action.id, createdResourceId };
}
