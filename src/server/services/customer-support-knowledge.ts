import "server-only";
import { prisma } from "@/lib/db/prisma";
import { appConfig } from "@/lib/config";
import { validateSyncablePath } from "@/lib/customer-support/internal-path";
import { fetchPublicPageSameOrigin } from "@/lib/customer-support/safe-page-fetch";
import { sanitizeHtmlToText } from "@/lib/customer-support/html-sanitize";
import { computeChecksum } from "@/lib/knowledge/checksum";
import { logCustomerSupportAction } from "@/server/services/customer-support-audit";
import { notifyKnowledgeSourceOutdated } from "@/server/services/customer-support-notifications";
import { publishAutomationEvent } from "@/server/services/automation-events";

/**
 * Knowledge source administration + internal-page sync (Fase 40 spec
 * sections 11-12). Only a fetch to THIS app's own trusted, server-configured
 * origin (`appConfig.url`) is ever made - the visitor/caller-controlled
 * input is exclusively the relative PATH, already validated by
 * validateSyncablePath BEFORE this file does anything network-related (see
 * that file's header comment for why this is SSRF-proof by construction,
 * not by a DNS/IP check).
 */

export async function listKnowledgeSources(projectId: string, filter: { status?: string; type?: string } = {}) {
  return prisma.customerSupportKnowledgeSource.findMany({
    where: { projectId, ...(filter.status ? { status: filter.status as never } : {}), ...(filter.type ? { type: filter.type as never } : {}) },
    orderBy: { createdAt: "desc" },
    include: { approvedBy: { select: { id: true, name: true, email: true } } },
  });
}

export async function getKnowledgeSource(projectId: string, sourceId: string) {
  const source = await prisma.customerSupportKnowledgeSource.findUnique({ where: { id: sourceId } });
  if (!source || source.projectId !== projectId) return null;
  return source;
}

/** Only APPROVED + PUBLIC rows the widget/public endpoint may ever read (spec section 11). */
export async function listApprovedPublicCandidates(projectId: string, language?: string) {
  return prisma.customerSupportKnowledgeSource.findMany({
    where: { projectId, status: "APPROVED", visibility: "PUBLIC", ...(language ? { language } : {}) },
    take: 500,
  });
}

export interface CreateManualSourceInput {
  title: string;
  content: string;
  language?: string;
  excerpt?: string;
}

export async function createManualSource(projectId: string, userId: string, input: CreateManualSourceInput) {
  const normalizedContent = input.content.trim();
  const source = await prisma.customerSupportKnowledgeSource.create({
    data: {
      projectId,
      type: "MANUAL",
      title: input.title,
      sourceRef: `manual:${Date.now()}`,
      normalizedContent,
      checksum: computeChecksum(normalizedContent),
      excerpt: input.excerpt ?? normalizedContent.slice(0, 300),
      language: input.language ?? "es",
      status: "DRAFT",
    },
  });
  await logCustomerSupportAction(projectId, userId, "customer_support.knowledge_source_created", "CustomerSupportKnowledgeSource", source.id);
  return source;
}

export async function approveKnowledgeSource(projectId: string, userId: string, sourceId: string, visibility: "PUBLIC" | "INTERNAL" = "PUBLIC") {
  const source = await getKnowledgeSource(projectId, sourceId);
  if (!source) return { error: "Fuente no encontrada." };
  const updated = await prisma.customerSupportKnowledgeSource.update({
    where: { id: sourceId },
    data: { status: "APPROVED", visibility, approvedById: userId, approvedAt: new Date() },
  });
  await logCustomerSupportAction(projectId, userId, "customer_support.knowledge_approved", "CustomerSupportKnowledgeSource", sourceId);
  await publishAutomationEvent({
    projectId,
    eventKey: "customer_support.knowledge_approved",
    actorId: userId,
    payload: { sourceId },
    idempotencyKey: `customer_support.knowledge_approved:${sourceId}:${updated.approvedAt?.getTime()}`,
  });
  return { source: updated };
}

export async function archiveKnowledgeSource(projectId: string, userId: string, sourceId: string) {
  const source = await getKnowledgeSource(projectId, sourceId);
  if (!source) return { error: "Fuente no encontrada." };
  const updated = await prisma.customerSupportKnowledgeSource.update({ where: { id: sourceId }, data: { status: "ARCHIVED" } });
  await logCustomerSupportAction(projectId, userId, "customer_support.knowledge_source_archived", "CustomerSupportKnowledgeSource", sourceId);
  return { source: updated };
}

// ---------------------------------------------------------------------------
// Internal-page sync
// ---------------------------------------------------------------------------

export async function syncInternalPath(projectId: string, userId: string, rawPath: string): Promise<{ error?: string; sourceId?: string; changeDetected?: boolean }> {
  const validation = validateSyncablePath(rawPath);
  if (!validation.ok || !validation.normalizedPath) return { error: validation.error };

  const syncRun = await prisma.customerSupportKnowledgeSyncRun.create({
    data: { projectId, requestedPath: validation.normalizedPath, status: "RUNNING", startedAt: new Date(), startedById: userId },
  });

  try {
    const fetched = await fetchPublicPageSameOrigin(validation.normalizedPath, appConfig.url);
    if (!fetched.ok) {
      await prisma.customerSupportKnowledgeSyncRun.update({ where: { id: syncRun.id }, data: { status: "FAILED", errorMessage: fetched.error, completedAt: new Date() } });
      return { error: fetched.error };
    }
    const { title, text } = sanitizeHtmlToText(fetched.page.html);
    if (!text) {
      await prisma.customerSupportKnowledgeSyncRun.update({ where: { id: syncRun.id }, data: { status: "FAILED", errorMessage: "No se encontro contenido de texto en la pagina.", completedAt: new Date() } });
      return { error: "No se encontro contenido de texto util en esta pagina." };
    }

    const checksum = computeChecksum(text);
    const existing = await prisma.customerSupportKnowledgeSource.findUnique({ where: { projectId_sourceRef: { projectId, sourceRef: validation.normalizedPath } } });
    const changeDetected = !existing || existing.checksum !== checksum;

    let sourceId: string;
    if (!existing) {
      const created = await prisma.customerSupportKnowledgeSource.create({
        data: {
          projectId,
          type: "INTERNAL_PAGE",
          title: title ?? validation.normalizedPath,
          sourceRef: validation.normalizedPath,
          normalizedContent: text,
          checksum,
          excerpt: text.slice(0, 300),
          status: "DRAFT",
          visibility: "INTERNAL",
          lastSyncedAt: new Date(),
        },
      });
      sourceId = created.id;
    } else {
      sourceId = existing.id;
      // A previously APPROVED source whose live content changed needs re-approval - never silently keeps serving stale-but-still-marked-approved content, and never silently re-approves itself either.
      const nextStatus = existing.status === "APPROVED" && changeDetected ? "OUTDATED" : existing.status;
      await prisma.customerSupportKnowledgeSource.update({
        where: { id: existing.id },
        data: { title: title ?? existing.title, normalizedContent: text, checksum, excerpt: text.slice(0, 300), lastSyncedAt: new Date(), status: nextStatus },
      });
      if (nextStatus === "OUTDATED") await notifyKnowledgeSourceOutdated(projectId, title ?? existing.title).catch(() => null);
    }

    await prisma.customerSupportKnowledgeSyncRun.update({ where: { id: syncRun.id }, data: { status: "COMPLETED", changeDetected, sourceId, completedAt: new Date() } });
    await logCustomerSupportAction(projectId, userId, "customer_support.knowledge_synced", "CustomerSupportKnowledgeSource", sourceId, { changeDetected });
    await publishAutomationEvent({
      projectId,
      eventKey: "customer_support.knowledge_synced",
      actorId: userId,
      payload: { sourceId, changeDetected },
      idempotencyKey: `customer_support.knowledge_synced:${syncRun.id}`,
    });
    return { sourceId, changeDetected };
  } catch (err) {
    const message = err instanceof Error && err.name === "AbortError" ? "Tiempo de espera agotado al sincronizar." : "No se pudo sincronizar esta pagina.";
    await prisma.customerSupportKnowledgeSyncRun.update({ where: { id: syncRun.id }, data: { status: "FAILED", errorMessage: message, completedAt: new Date() } });
    return { error: message };
  }
}

export async function listSyncHistory(projectId: string, limit = 30) {
  return prisma.customerSupportKnowledgeSyncRun.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 100),
    include: { source: { select: { id: true, title: true } }, startedBy: { select: { id: true, name: true, email: true } } },
  });
}
