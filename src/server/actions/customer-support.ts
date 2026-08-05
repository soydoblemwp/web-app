"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireProjectAccess } from "@/lib/permissions";
import { prisma } from "@/lib/db/prisma";
import {
  faqInputSchema,
  updateFaqSchema,
  faqFilterSchema,
  createManualKnowledgeSourceSchema,
  syncKnowledgePathSchema,
  approveKnowledgeSourceSchema,
  updateCustomerSupportConfigSchema,
  testAgentSchema,
  assignHandoffSchema,
  addHandoffNoteSchema,
  updateHandoffStatusSchema,
  conversationFilterSchema,
  handoffFilterSchema,
  claimPublicSiteSchema,
} from "@/lib/validation/customer-support";
import { getDashboardStats } from "@/server/services/customer-support-stats";
import { getOrCreateConfig, updateConfig, getActivationChecklist, activateAgent, deactivateAgent, markTestCompleted } from "@/server/services/customer-support-config";
import { listPublicSites, claimPublicSite, disablePublicSite, checkPublicSiteInstallation } from "@/server/services/customer-support-public-site";
import {
  listFaqs,
  getFaq,
  createFaq,
  updateFaq,
  publishFaq,
  archiveFaq,
  duplicateFaq,
  importFaqsFromCsv,
  importFaqsFromJson,
  exportFaqsAsCsv,
  exportFaqsAsJson,
} from "@/server/services/customer-support-faq";
import {
  listKnowledgeSources,
  getKnowledgeSource,
  createManualSource,
  approveKnowledgeSource,
  archiveKnowledgeSource,
  syncInternalPath,
  listSyncHistory,
} from "@/server/services/customer-support-knowledge";
import { listConversations, getConversationForProject, updateConversationStatus } from "@/server/services/customer-support-conversation";
import { listHandoffs, getHandoff, assignHandoff, addHandoffNote, updateHandoffStatus } from "@/server/services/customer-support-handoff";
import { createDraftRun, updateRunInput, confirmRun, startRun, prepareNextStep, completeAiStep } from "@/server/services/agent-orchestrator";
import { CUSTOMER_SUPPORT_SUGGESTED_PATHS } from "@/lib/customer-support/internal-path";

const BASE_PATH = (projectId: string) => `/dashboard/${projectId}/customer-support`;

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export async function getCustomerSupportDashboardAction(projectId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  return getDashboardStats(projectId);
}

// ---------------------------------------------------------------------------
// Config / activation
// ---------------------------------------------------------------------------

export async function getCustomerSupportConfigAction(projectId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  return getOrCreateConfig(projectId);
}

export async function updateCustomerSupportConfigAction(projectId: string, input: unknown) {
  const user = await requireProjectAccess(projectId, "MANAGER");
  const parsed = updateCustomerSupportConfigSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no validos." };
  const updated = await updateConfig(projectId, user.id, parsed.data);
  revalidatePath(`${BASE_PATH(projectId)}/settings`);
  return { config: updated };
}

export async function getActivationChecklistAction(projectId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  return getActivationChecklist(projectId);
}

export async function activateCustomerSupportAgentAction(projectId: string) {
  const user = await requireProjectAccess(projectId, "MANAGER");
  const result = await activateAgent(projectId, user.id);
  revalidatePath(BASE_PATH(projectId));
  return result;
}

export async function deactivateCustomerSupportAgentAction(projectId: string) {
  const user = await requireProjectAccess(projectId, "MANAGER");
  const result = await deactivateAgent(projectId, user.id);
  revalidatePath(BASE_PATH(projectId));
  return result;
}

/** Suggestions only (one-click convenience in the UI) — syncKnowledgePathAction accepts any real, safe path, not just these (spec section 6). */
export async function getSuggestedSyncPathsAction() {
  return CUSTOMER_SUPPORT_SUGGESTED_PATHS;
}

// ---------------------------------------------------------------------------
// Public site (hostname) binding (Fase 40's third correction — replaces the
// earlier "first activated project wins" resolution with an explicit,
// exclusive hostname -> project assignment).
// ---------------------------------------------------------------------------

export async function listPublicSitesAction(projectId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  return listPublicSites(projectId);
}

/** MANAGER-only — claiming a hostname is an activation-adjacent, security-relevant action (spec section 3). */
export async function claimPublicSiteAction(projectId: string, input: unknown) {
  const user = await requireProjectAccess(projectId, "MANAGER");
  const parsed = claimPublicSiteSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dominio no valido." };
  const result = await claimPublicSite(projectId, user.id, parsed.data.hostname);
  revalidatePath(`${BASE_PATH(projectId)}/settings`);
  return result;
}

export async function disablePublicSiteAction(projectId: string, siteId: string) {
  const user = await requireProjectAccess(projectId, "MANAGER");
  const result = await disablePublicSite(projectId, user.id, siteId);
  revalidatePath(`${BASE_PATH(projectId)}/settings`);
  return result;
}

/**
 * Real, live check for the "Instalacion publica" panel (Fase 40 correction
 * spec section 7/12: "boton Probar en la web") — confirms whether THIS
 * specific hostname binding is really ACTIVE and its project's agent is
 * really active, using the exact same underlying data the public layout
 * itself reads. Never fabricated, never falls back to a different project.
 */
export async function checkPublicSiteInstallationAction(projectId: string, siteId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  return checkPublicSiteInstallation(projectId, siteId);
}

/**
 * Minimal, public-safe payload the in-app widget needs to decide whether/how
 * to render (spec section 5-6) — gated at VIEWER (any project member), never
 * exposes internal-only fields (retentionDays, activatedById, allowedDomains
 * aren't needed client-side for the same-origin in-app widget).
 */
export async function getWidgetBootstrapAction(projectId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  const config = await getOrCreateConfig(projectId);
  return {
    active: config.active,
    publicId: config.publicId,
    agentName: config.agentName,
    welcomeMessage: config.welcomeMessage,
    buttonText: config.buttonText,
    suggestedQuestions: config.suggestedQuestions,
    language: config.language,
    position: config.position,
    includedPaths: config.includedPaths,
    excludedPaths: config.excludedPaths,
    offHoursMessage: config.offHoursMessage,
    humanHandoffEnabled: config.humanHandoffEnabled,
    privacyText: config.privacyText,
    appearanceTheme: config.appearanceTheme,
  };
}

// ---------------------------------------------------------------------------
// FAQ (spec section 9 — only MANAGER can publish/archive; EDITOR can draft)
// ---------------------------------------------------------------------------

export async function listFaqsAction(projectId: string, filter: unknown) {
  await requireProjectAccess(projectId, "EDITOR");
  const parsed = faqFilterSchema.safeParse(filter ?? {});
  if (!parsed.success) return { error: "Filtro no valido." };
  return listFaqs(projectId, parsed.data);
}

export async function getFaqAction(projectId: string, faqId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  const faq = await getFaq(projectId, faqId);
  if (!faq) return { error: "FAQ no encontrada." };
  return { faq };
}

export async function createFaqAction(projectId: string, input: unknown) {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const parsed = faqInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no validos." };
  const faq = await createFaq(projectId, user.id, parsed.data);
  revalidatePath(`${BASE_PATH(projectId)}/faqs`);
  return { id: faq.id };
}

export async function updateFaqAction(projectId: string, faqId: string, input: unknown) {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const parsed = updateFaqSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no validos." };
  const result = await updateFaq(projectId, user.id, faqId, parsed.data);
  revalidatePath(`${BASE_PATH(projectId)}/faqs`);
  return result;
}

export async function publishFaqAction(projectId: string, faqId: string) {
  const user = await requireProjectAccess(projectId, "MANAGER");
  const result = await publishFaq(projectId, user.id, faqId);
  revalidatePath(`${BASE_PATH(projectId)}/faqs`);
  return result;
}

export async function archiveFaqAction(projectId: string, faqId: string) {
  const user = await requireProjectAccess(projectId, "MANAGER");
  const result = await archiveFaq(projectId, user.id, faqId);
  revalidatePath(`${BASE_PATH(projectId)}/faqs`);
  return result;
}

export async function duplicateFaqAction(projectId: string, faqId: string) {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const result = await duplicateFaq(projectId, user.id, faqId);
  revalidatePath(`${BASE_PATH(projectId)}/faqs`);
  return result;
}

export async function importFaqsAction(projectId: string, format: "csv" | "json", text: string) {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const result = format === "csv" ? await importFaqsFromCsv(projectId, user.id, text) : await importFaqsFromJson(projectId, user.id, text);
  revalidatePath(`${BASE_PATH(projectId)}/faqs`);
  return result;
}

export async function exportFaqsAction(projectId: string, format: "csv" | "json") {
  await requireProjectAccess(projectId, "EDITOR");
  const text = format === "csv" ? await exportFaqsAsCsv(projectId) : await exportFaqsAsJson(projectId);
  return { text };
}

// ---------------------------------------------------------------------------
// Knowledge sources (spec sections 11-12 — MANAGER-only admin)
// ---------------------------------------------------------------------------

export async function listKnowledgeSourcesAction(projectId: string, filter: { status?: string; type?: string } = {}) {
  await requireProjectAccess(projectId, "EDITOR");
  return listKnowledgeSources(projectId, filter);
}

export async function getKnowledgeSourceAction(projectId: string, sourceId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  const source = await getKnowledgeSource(projectId, sourceId);
  if (!source) return { error: "Fuente no encontrada." };
  return { source };
}

export async function createManualKnowledgeSourceAction(projectId: string, input: unknown) {
  const user = await requireProjectAccess(projectId, "MANAGER");
  const parsed = createManualKnowledgeSourceSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no validos." };
  const source = await createManualSource(projectId, user.id, parsed.data);
  revalidatePath(`${BASE_PATH(projectId)}/knowledge`);
  return { id: source.id };
}

export async function approveKnowledgeSourceAction(projectId: string, sourceId: string, input: unknown) {
  const user = await requireProjectAccess(projectId, "MANAGER");
  const parsed = approveKnowledgeSourceSchema.safeParse(input ?? {});
  if (!parsed.success) return { error: "Datos no validos." };
  const result = await approveKnowledgeSource(projectId, user.id, sourceId, parsed.data.visibility);
  revalidatePath(`${BASE_PATH(projectId)}/knowledge`);
  return result;
}

export async function archiveKnowledgeSourceAction(projectId: string, sourceId: string) {
  const user = await requireProjectAccess(projectId, "MANAGER");
  const result = await archiveKnowledgeSource(projectId, user.id, sourceId);
  revalidatePath(`${BASE_PATH(projectId)}/knowledge`);
  return result;
}

export async function syncKnowledgePathAction(projectId: string, input: unknown) {
  const user = await requireProjectAccess(projectId, "MANAGER");
  const parsed = syncKnowledgePathSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no validos." };
  const result = await syncInternalPath(projectId, user.id, parsed.data.path);
  revalidatePath(`${BASE_PATH(projectId)}/knowledge`);
  return result;
}

export async function listKnowledgeSyncHistoryAction(projectId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  return listSyncHistory(projectId);
}

// ---------------------------------------------------------------------------
// Conversations (bandeja, spec section 20)
// ---------------------------------------------------------------------------

export async function listConversationsAction(projectId: string, filter: unknown) {
  await requireProjectAccess(projectId, "EDITOR");
  const parsed = conversationFilterSchema.safeParse(filter ?? {});
  if (!parsed.success) return { error: "Filtro no valido." };
  return listConversations(projectId, parsed.data);
}

export async function getConversationDetailAction(projectId: string, conversationId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  const conversation = await getConversationForProject(projectId, conversationId);
  if (!conversation) return { error: "Conversacion no encontrada." };
  return { conversation };
}

export async function updateConversationStatusAction(projectId: string, conversationId: string, status: "ACTIVE" | "RESOLVED" | "ESCALATED" | "CLOSED") {
  await requireProjectAccess(projectId, "EDITOR");
  const result = await updateConversationStatus(projectId, conversationId, status);
  revalidatePath(`${BASE_PATH(projectId)}/conversations`);
  return result;
}

// ---------------------------------------------------------------------------
// Handoffs (spec section 19 — closing is MANAGER-only)
// ---------------------------------------------------------------------------

export async function listHandoffsAction(projectId: string, filter: unknown) {
  await requireProjectAccess(projectId, "EDITOR");
  const parsed = handoffFilterSchema.safeParse(filter ?? {});
  if (!parsed.success) return { error: "Filtro no valido." };
  return listHandoffs(projectId, parsed.data);
}

export async function getHandoffAction(projectId: string, handoffId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  const handoff = await getHandoff(projectId, handoffId);
  if (!handoff) return { error: "Solicitud no encontrada." };
  return { handoff };
}

export async function assignHandoffAction(projectId: string, handoffId: string, input: unknown) {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const parsed = assignHandoffSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos no validos." };
  const result = await assignHandoff(projectId, user.id, handoffId, parsed.data.assignedToId);
  revalidatePath(`${BASE_PATH(projectId)}/handoffs`);
  return result;
}

export async function addHandoffNoteAction(projectId: string, handoffId: string, input: unknown) {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const parsed = addHandoffNoteSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos no validos." };
  const result = await addHandoffNote(projectId, user.id, handoffId, parsed.data.note);
  revalidatePath(`${BASE_PATH(projectId)}/handoffs`);
  return result;
}

/** Moving to IN_REVIEW is EDITOR-level; resolving/closing requires MANAGER (spec section 29: "cerrar solicitudes" is MANAGER-only). */
export async function updateHandoffStatusAction(projectId: string, handoffId: string, input: unknown) {
  const parsed = updateHandoffStatusSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos no validos." };
  const requiresManager = parsed.data.status === "RESOLVED" || parsed.data.status === "CLOSED";
  const user = await requireProjectAccess(projectId, requiresManager ? "MANAGER" : "EDITOR");
  const result = await updateHandoffStatus(projectId, user.id, handoffId, parsed.data.status);
  revalidatePath(`${BASE_PATH(projectId)}/handoffs`);
  return result;
}

// ---------------------------------------------------------------------------
// Test mode (spec section 22) — drives the REAL AI Agent Studio orchestrator
// end-to-end (createDraftRun -> confirmRun -> startRun -> prepareNextStep ->
// [client-side local AI] -> completeAiStep), exactly like every other
// official agent — never a shortcut/second engine.
// ---------------------------------------------------------------------------

export type TestAgentResult =
  | { error: string }
  | { runId: string; needsGeneration: true; executionToken: string; systemPrompt: string; userPrompt: string }
  | { runId: string; needsGeneration: false; answer: unknown };

export async function testCustomerSupportAgentAction(projectId: string, input: unknown): Promise<TestAgentResult> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const parsed = testAgentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Escribe una pregunta." };

  const draft = await createDraftRun(projectId, user.id, randomUUID(), { officialAgentKey: "customer-support-agent" });
  if ("error" in draft) return { error: draft.error ?? "No se pudo crear la ejecucion de prueba." };
  const runId = draft.id;

  const inputResult = await updateRunInput(projectId, runId, { visitorQuestion: parsed.data.question }, {});
  if ("error" in inputResult) return { error: inputResult.error ?? "No se pudo guardar la pregunta de prueba." };

  const confirmed = await confirmRun(projectId, runId, user.id);
  if ("error" in confirmed) return { error: confirmed.error ?? "No se pudo confirmar la ejecucion de prueba." };

  const started = await startRun(projectId, runId, user.id);
  if ("error" in started) return { error: started.error ?? "No se pudo iniciar la ejecucion de prueba." };

  const prepared = await prepareNextStep(projectId, runId, user.id);
  if (prepared.error) return { error: prepared.error };

  if (prepared.ai) {
    return { runId, needsGeneration: true, executionToken: prepared.ai.executionToken, systemPrompt: prepared.ai.systemPrompt, userPrompt: prepared.ai.userPrompt };
  }

  await markTestCompleted(projectId);
  const answer = await fetchTestRunAnswer(runId);
  return { runId, needsGeneration: false, answer };
}

export async function completeTestCustomerSupportAgentAction(projectId: string, runId: string, executionToken: string, output: string): Promise<{ error: string } | { answer: unknown }> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const result = await completeAiStep(projectId, runId, user.id, output, executionToken);
  if (result.error) return { error: result.error };

  await markTestCompleted(projectId);
  const answer = await fetchTestRunAnswer(runId);
  return { answer };
}

async function fetchTestRunAnswer(runId: string) {
  const step = await prisma.aiAgentRunStep.findFirst({ where: { runId, agentRef: "customer-support-agent" }, orderBy: { order: "desc" } });
  return step?.output ?? null;
}
