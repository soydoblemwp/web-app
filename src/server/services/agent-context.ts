import "server-only";
import { prisma } from "@/lib/db/prisma";
import { buildBrandProfileContext } from "@/lib/brand-profiles/context";
import { resolveKnowledgeContext } from "@/server/services/knowledge-context";
import type { AgentContextSelection, ResolvedContextItem } from "@/lib/agents/types";

const MAX_ITEM_CHARS = 3000;

function truncate(text: string, max = MAX_ITEM_CHARS): string {
  return text.length > max ? `${text.slice(0, max)}\n[...contenido recortado...]` : text;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * The context builder (spec section 14) — loads ONLY resources the caller
 * actually owns/has access to, labels their origin, deduplicates, and caps
 * size. Never returns secrets or internal metadata (no storageKey, no raw
 * IDs beyond what's needed for traceability). Every referenced id is
 * re-validated against `projectId`/`userId` here — the caller's selection is
 * never trusted as-is (spec section 6/28: "no confíes en IDs enviados por
 * el cliente").
 */
export async function resolveAgentContext(projectId: string, userId: string, selection: AgentContextSelection): Promise<ResolvedContextItem[]> {
  const items: ResolvedContextItem[] = [];
  const seen = new Set<string>();

  function push(origin: string, label: string, content: string, dedupeKey: string) {
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    items.push({ origin, label, content: truncate(content) });
  }

  if (selection.brandProfileId) {
    const profile = await prisma.brandProfile.findUnique({ where: { id: selection.brandProfileId } });
    if (profile && profile.userId === userId) {
      push("Brand Profile", profile.name, buildBrandProfileContext(profile), `brand:${profile.id}`);
    }
  }

  if (selection.contentItemIds?.length) {
    const items_ = await prisma.contentItem.findMany({
      where: { id: { in: selection.contentItemIds }, projectId, deletedAt: null },
    });
    for (const item of items_) {
      push("ContentItem", item.title, stripHtml(item.body), `content-item:${item.id}`);
    }
  }

  if (selection.campaignId) {
    const campaign = await prisma.campaign.findUnique({ where: { id: selection.campaignId } });
    if (campaign && campaign.projectId === projectId) {
      const summary = [
        `Objetivo: ${campaign.objective ?? "sin definir"}`,
        campaign.audience ? `Audiencia: ${campaign.audience}` : "",
        campaign.valueProposition ? `Propuesta de valor: ${campaign.valueProposition}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      push("Campaign", campaign.name, summary, `campaign:${campaign.id}`);
    }
  }

  if (selection.campaignPieceId) {
    const piece = await prisma.campaignContentPiece.findUnique({ where: { id: selection.campaignPieceId }, include: { campaign: true } });
    if (piece && piece.campaign.projectId === projectId) {
      push("CampaignContentPiece", piece.title, `Idea: ${piece.idea ?? "sin definir"}\nPlataforma: ${piece.platform}`, `piece:${piece.id}`);
    }
  }

  if (selection.socialPostId) {
    const post = await prisma.socialPost.findUnique({ where: { id: selection.socialPostId } });
    if (post && post.projectId === projectId) {
      push("SocialPost", post.internalTitle ?? post.platform, post.text, `post:${post.id}`);
    }
  }

  if (selection.promptIds?.length) {
    const prompts = await prisma.savedPrompt.findMany({ where: { id: { in: selection.promptIds }, userId } });
    for (const prompt of prompts) {
      if (prompt.projectId && prompt.projectId !== projectId) continue;
      push("Prompt Library", prompt.title, prompt.content, `prompt:${prompt.id}`);
    }
  }

  if (selection.fileAssetIds?.length) {
    const files = await prisma.fileAsset.findMany({ where: { id: { in: selection.fileAssetIds }, projectId } });
    for (const file of files) {
      // No text-extraction pipeline exists for FileAsset uploads — be honest about the limitation rather than inventing content (spec section 16).
      const label = file.displayName ?? file.originalName;
      const description =
        file.kind === "IMAGE" || file.kind === "VIDEO"
          ? `Archivo multimedia (${file.mimeType}). Sin contenido de texto extraíble — solo metadatos: ${[file.altText, file.tags.join(", ")].filter(Boolean).join(" · ") || "sin metadatos adicionales"}.`
          : `Archivo (${file.mimeType}). Este sistema no extrae texto de archivos subidos — considera pegar su contenido como nota si es relevante.`;
      push("FileAsset", label, description, `file:${file.id}`);
    }
  }

  if (selection.previousRunIds?.length) {
    const runs = await prisma.aiAgentRun.findMany({ where: { id: { in: selection.previousRunIds }, projectId } });
    for (const run of runs) {
      if (!run.result) continue;
      push("Ejecución anterior", run.officialAgentKey ?? run.customAgentId ?? run.id, JSON.stringify(run.result), `run:${run.id}`);
    }
  }

  if (selection.notes?.trim()) {
    push("Notas del usuario", "Notas", selection.notes.trim(), `notes:${selection.notes.trim().slice(0, 40)}`);
  }

  if (selection.knowledgeCollectionIds?.length || selection.knowledgeSourceIds?.length) {
    const knowledgeItems = await resolveKnowledgeContext(projectId, {
      collectionIds: selection.knowledgeCollectionIds,
      sourceIds: selection.knowledgeSourceIds,
      query: selection.knowledgeQuery,
      limit: 8,
    });
    for (const item of knowledgeItems) {
      push(item.origin, item.label, item.content, `kb-chunk:${item.chunkId}`);
    }
  }

  return items;
}

/** Preview-only summary for the "qué contexto se utilizará" screen (spec section 14) — same resolution, just labels/lengths, never re-fetched twice in the same request by the caller. */
export function summarizeContext(items: ResolvedContextItem[]): { origin: string; label: string; chars: number }[] {
  return items.map((i) => ({ origin: i.origin, label: i.label, chars: i.content.length }));
}
