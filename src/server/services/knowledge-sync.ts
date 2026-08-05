import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { KnowledgeSourceOriginType } from "@/lib/knowledge/types";
import type { CreateInternalSourceInput } from "@/lib/validation/knowledge";

export interface InternalResourceSnapshot {
  title: string;
  text: string;
  resourceIds: {
    contentItemId?: string;
    campaignId?: string;
    campaignStrategyId?: string;
    campaignContentPieceId?: string;
    socialPostId?: string;
    savedPromptId?: string;
  };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Resolves+snapshots one of the six internal-resource origin types into
 * indexable markdown text (spec section 4: "genera un snapshot versionado
 * para indexación; registra su origen; permite sincronizar cambios
 * posteriormente"). Never forks the underlying model — this is always a
 * point-in-time TEXT copy, re-derived on each sync from the live resource.
 * Every id is re-validated against `projectId`/`userId` here, never trusted
 * from the caller (spec section 33).
 */
export async function resolveInternalResourceSnapshot(
  projectId: string,
  userId: string,
  input: Pick<CreateInternalSourceInput, "originType" | "contentItemId" | "campaignId" | "campaignStrategyId" | "campaignContentPieceId" | "socialPostId" | "savedPromptId">
): Promise<InternalResourceSnapshot | null> {
  switch (input.originType) {
    case "CONTENT_ITEM": {
      if (!input.contentItemId) return null;
      const item = await prisma.contentItem.findUnique({ where: { id: input.contentItemId } });
      if (!item || item.projectId !== projectId || item.deletedAt) return null;
      const lines = [`# ${item.title}`, "", stripHtml(item.body)];
      if (item.seoDescription) lines.push("", `## Meta descripción`, item.seoDescription);
      return { title: item.title, text: lines.join("\n"), resourceIds: { contentItemId: item.id } };
    }
    case "CAMPAIGN": {
      if (!input.campaignId) return null;
      const campaign = await prisma.campaign.findUnique({ where: { id: input.campaignId } });
      if (!campaign || campaign.projectId !== projectId) return null;
      const lines = [
        `# ${campaign.name}`,
        "",
        campaign.description ? `## Descripción\n${campaign.description}` : "",
        campaign.objective ? `## Objetivo\n${campaign.objective}` : "",
        campaign.audience ? `## Audiencia\n${campaign.audience}` : "",
        campaign.valueProposition ? `## Propuesta de valor\n${campaign.valueProposition}` : "",
        campaign.mainMessage ? `## Mensaje principal\n${campaign.mainMessage}` : "",
      ].filter(Boolean);
      return { title: campaign.name, text: lines.join("\n\n"), resourceIds: { campaignId: campaign.id } };
    }
    case "CAMPAIGN_STRATEGY": {
      if (!input.campaignStrategyId) return null;
      const strategy = await prisma.campaignStrategy.findUnique({ where: { id: input.campaignStrategyId }, include: { campaign: true } });
      if (!strategy || strategy.campaign.projectId !== projectId) return null;
      const lines = [
        `# Estrategia — ${strategy.campaign.name}`,
        "",
        strategy.summary ? `## Resumen\n${strategy.summary}` : "",
        strategy.audienceProfile ? `## Audiencia\n${strategy.audienceProfile}` : "",
        strategy.valueProposition ? `## Propuesta de valor\n${strategy.valueProposition}` : "",
        strategy.mainMessage ? `## Mensaje principal\n${strategy.mainMessage}` : "",
        strategy.themes.length ? `## Temas\n${strategy.themes.map((t) => `- ${t}`).join("\n")}` : "",
        strategy.recommendations.length ? `## Recomendaciones\n${strategy.recommendations.map((t) => `- ${t}`).join("\n")}` : "",
      ].filter(Boolean);
      return { title: `Estrategia — ${strategy.campaign.name}`, text: lines.join("\n\n"), resourceIds: { campaignStrategyId: strategy.id } };
    }
    case "CAMPAIGN_CONTENT_PIECE": {
      if (!input.campaignContentPieceId) return null;
      const piece = await prisma.campaignContentPiece.findUnique({ where: { id: input.campaignContentPieceId }, include: { campaign: true } });
      if (!piece || piece.campaign.projectId !== projectId) return null;
      const lines = [`# ${piece.title}`, "", `Plataforma: ${piece.platform}`, piece.idea ? `## Idea\n${piece.idea}` : "", piece.notes ? `## Notas\n${piece.notes}` : ""].filter(Boolean);
      return { title: piece.title, text: lines.join("\n\n"), resourceIds: { campaignContentPieceId: piece.id } };
    }
    case "SOCIAL_POST": {
      if (!input.socialPostId) return null;
      const post = await prisma.socialPost.findUnique({ where: { id: input.socialPostId } });
      if (!post || post.projectId !== projectId) return null;
      const title = post.internalTitle ?? `${post.platform} — ${post.id.slice(0, 8)}`;
      const lines = [`# ${title}`, "", post.text, post.hashtags.length ? `\nHashtags: ${post.hashtags.join(" ")}` : ""].filter(Boolean);
      return { title, text: lines.join("\n"), resourceIds: { socialPostId: post.id } };
    }
    case "SAVED_PROMPT": {
      if (!input.savedPromptId) return null;
      const prompt = await prisma.savedPrompt.findUnique({ where: { id: input.savedPromptId } });
      if (!prompt || prompt.userId !== userId || (prompt.projectId && prompt.projectId !== projectId)) return null;
      return { title: prompt.title, text: `# ${prompt.title}\n\n${prompt.content}`, resourceIds: { savedPromptId: prompt.id } };
    }
    default:
      return null;
  }
}

const ORIGIN_TO_FORMAT: Record<KnowledgeSourceOriginType, "TEXT" | "MARKDOWN"> = {
  PASTED_TEXT: "TEXT",
  FILE: "TEXT",
  NOTE: "TEXT",
  CONTENT_ITEM: "MARKDOWN",
  CAMPAIGN: "MARKDOWN",
  CAMPAIGN_STRATEGY: "MARKDOWN",
  CAMPAIGN_CONTENT_PIECE: "MARKDOWN",
  SOCIAL_POST: "MARKDOWN",
  SAVED_PROMPT: "MARKDOWN",
};

export function formatForOrigin(origin: KnowledgeSourceOriginType): "TEXT" | "MARKDOWN" {
  return ORIGIN_TO_FORMAT[origin] ?? "TEXT";
}
