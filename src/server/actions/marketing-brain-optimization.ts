"use server";

import { revalidatePath } from "next/cache";
import { requireProjectAccess } from "@/lib/permissions";
import {
  performanceContextSelectionSchema,
  createOptimizationSessionSchema,
  decideOptimizationSessionSchema,
  convertScenarioActionSchema,
  createMeasurementPlanSchema,
} from "@/lib/validation/marketing-brain-optimization";
import {
  createOptimizationSession,
  updateSessionSelection,
  listOptimizationSessions,
  getSessionCreatedByAgentRun,
  getOptimizationSessionDetail,
  prepareOptimizationGeneration,
  completeOptimizationGeneration,
  failOptimizationGeneration,
  selectScenario,
  decideOptimizationSession,
  archiveOptimizationSession,
  createOptimizationSessionVersion,
} from "@/server/services/marketing-brain-optimization";
import { convertScenarioAction as convertScenarioActionCore } from "@/server/services/marketing-brain-scenario-conversion";
import { createMeasurementPlan, listMeasurementPlans, getMeasurementPlanDetail, generateMeasurementReview, cancelMeasurementPlan } from "@/server/services/marketing-brain-measurement";
import { buildPerformanceContext } from "@/server/services/marketing-brain-performance-context";
import type { MbOptimizationErrorCode } from "@/lib/marketing-brain/optimization-types";

export interface MbOptimizationActionResult {
  id?: string;
  createdResourceId?: string;
  errorCode?: MbOptimizationErrorCode;
  errorMessage?: string;
}

function revalidateOptimization(projectId: string, sessionId?: string) {
  revalidatePath(`/dashboard/${projectId}/marketing-brain/optimization`);
  if (sessionId) revalidatePath(`/dashboard/${projectId}/marketing-brain/optimization/${sessionId}`);
}

export async function createOptimizationSessionAction(projectId: string, input: unknown): Promise<MbOptimizationActionResult> {
  const parsed = createOptimizationSessionSchema.safeParse(input);
  if (!parsed.success) return { errorMessage: parsed.error.issues[0]?.message ?? "Datos no válidos." };

  const user = await requireProjectAccess(projectId, "EDITOR");
  const result = await createOptimizationSession(projectId, user.id, parsed.data);
  if ("error" in result) return { errorCode: result.code, errorMessage: result.error };
  revalidateOptimization(projectId, result.id);
  return { id: result.id };
}

export async function updateSessionSelectionAction(projectId: string, sessionId: string, selection: unknown): Promise<MbOptimizationActionResult> {
  const parsed = performanceContextSelectionSchema.safeParse(selection);
  if (!parsed.success) return { errorMessage: parsed.error.issues[0]?.message ?? "Selección no válida." };

  await requireProjectAccess(projectId, "EDITOR");
  const result = await updateSessionSelection(projectId, sessionId, parsed.data);
  if ("error" in result) return { errorCode: result.code, errorMessage: result.error };
  revalidateOptimization(projectId, sessionId);
  return { id: result.id };
}

export async function listOptimizationSessionsAction(projectId: string, filters: { campaignId?: string; status?: string } = {}) {
  await requireProjectAccess(projectId, "VIEWER");
  return listOptimizationSessions(projectId, filters);
}

/** Compact picker list for the "marketing_brain_session" agent input field type (Fase 36) — reuses the same session list, never a second query path. */
export async function listOptimizationSessionsForSelectAction(projectId: string): Promise<{ id: string; label: string }[]> {
  await requireProjectAccess(projectId, "VIEWER");
  const sessions = await listOptimizationSessions(projectId);
  return sessions.map((s) => ({ id: s.id, label: `${s.campaign?.name ?? "Sin campaña"} — ${s.status}` }));
}

export async function getOptimizationSessionDetailAction(projectId: string, sessionId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return getOptimizationSessionDetail(projectId, sessionId);
}

/** Bidirectional link (Fase 36 spec section 24): given an AiAgentRun, find the (at most one) optimization session it produced. */
export async function getSessionCreatedByAgentRunAction(projectId: string, agentRunId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return getSessionCreatedByAgentRun(projectId, agentRunId);
}

export async function prepareOptimizationGenerationAction(projectId: string, sessionId: string) {
  const user = await requireProjectAccess(projectId, "EDITOR");
  return prepareOptimizationGeneration(projectId, sessionId, user.id);
}

export async function completeOptimizationGenerationAction(projectId: string, sessionId: string, output: string, executionToken: string) {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const result = await completeOptimizationGeneration(projectId, sessionId, user.id, output, executionToken);
  revalidateOptimization(projectId, sessionId);
  return result;
}

export async function failOptimizationGenerationAction(projectId: string, sessionId: string, executionToken: string, errorMessage: string) {
  await requireProjectAccess(projectId, "EDITOR");
  return failOptimizationGeneration(projectId, sessionId, executionToken, errorMessage);
}

export async function selectScenarioAction(projectId: string, sessionId: string, kind: "CONSERVATIVE" | "BALANCED" | "EXPANSIVE"): Promise<MbOptimizationActionResult> {
  await requireProjectAccess(projectId, "EDITOR");
  const result = await selectScenario(projectId, sessionId, kind);
  if ("error" in result) return { errorCode: result.code, errorMessage: result.error };
  revalidateOptimization(projectId, sessionId);
  return { id: result.id };
}

/** The only path to APPROVED/REJECTED — always a real, authenticated human user; never callable from a cron/automation/agent/workflow context. */
export async function decideOptimizationSessionAction(projectId: string, input: unknown): Promise<MbOptimizationActionResult> {
  const parsed = decideOptimizationSessionSchema.safeParse(input);
  if (!parsed.success) return { errorMessage: parsed.error.issues[0]?.message ?? "Datos no válidos." };

  const user = await requireProjectAccess(projectId, "EDITOR");
  const result = await decideOptimizationSession(projectId, parsed.data.sessionId, user.id, parsed.data.decision, parsed.data.comment, parsed.data.selectedScenarioKind);
  if ("error" in result) return { errorCode: result.code, errorMessage: result.error };
  revalidateOptimization(projectId, parsed.data.sessionId);
  return { id: result.id };
}

export async function archiveOptimizationSessionAction(projectId: string, sessionId: string): Promise<MbOptimizationActionResult> {
  await requireProjectAccess(projectId, "EDITOR");
  const result = await archiveOptimizationSession(projectId, sessionId);
  if ("error" in result) return { errorCode: result.code, errorMessage: result.error };
  revalidateOptimization(projectId, sessionId);
  return { id: result.id };
}

export async function createOptimizationSessionVersionAction(projectId: string, sessionId: string, idempotencyKey: string): Promise<MbOptimizationActionResult> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const result = await createOptimizationSessionVersion(projectId, sessionId, user.id, idempotencyKey);
  if ("error" in result) return { errorCode: result.code, errorMessage: result.error };
  revalidateOptimization(projectId);
  return { id: result.id };
}

/** The confirmed conversion step (spec section 13) — the UI must already have shown a preview and required explicit confirmation before calling this. */
export async function convertScenarioActionAction(projectId: string, input: unknown): Promise<MbOptimizationActionResult> {
  const parsed = convertScenarioActionSchema.safeParse(input);
  if (!parsed.success) return { errorMessage: parsed.error.issues[0]?.message ?? "Datos no válidos." };

  const user = await requireProjectAccess(projectId, "EDITOR");
  const result = await convertScenarioActionCore(projectId, user.id, parsed.data);
  if ("error" in result) return { errorCode: result.code, errorMessage: result.error };
  revalidateOptimization(projectId);
  return { id: result.id, createdResourceId: result.createdResourceId };
}

export async function createMeasurementPlanAction(projectId: string, input: unknown): Promise<MbOptimizationActionResult> {
  const parsed = createMeasurementPlanSchema.safeParse(input);
  if (!parsed.success) return { errorMessage: parsed.error.issues[0]?.message ?? "Datos no válidos." };

  const user = await requireProjectAccess(projectId, "EDITOR");
  const result = await createMeasurementPlan(projectId, user.id, parsed.data);
  if ("error" in result) return { errorCode: result.code, errorMessage: result.error };
  revalidateOptimization(projectId, parsed.data.sessionId);
  return { id: result.id };
}

export async function listMeasurementPlansAction(projectId: string, sessionId?: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return listMeasurementPlans(projectId, sessionId);
}

export async function getMeasurementPlanDetailAction(projectId: string, planId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return getMeasurementPlanDetail(projectId, planId);
}

export async function generateMeasurementReviewAction(projectId: string, planId: string): Promise<MbOptimizationActionResult> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const result = await generateMeasurementReview(projectId, user.id, planId);
  if ("error" in result) return { errorCode: result.code, errorMessage: result.error };
  revalidatePath(`/dashboard/${projectId}/marketing-brain/optimization`);
  return { id: result.id };
}

export async function cancelMeasurementPlanAction(projectId: string, planId: string): Promise<MbOptimizationActionResult> {
  await requireProjectAccess(projectId, "EDITOR");
  const result = await cancelMeasurementPlan(projectId, planId);
  if ("error" in result) return { errorCode: result.code, errorMessage: result.error };
  return { id: result.id };
}

/** Read-only live preview of the context a selection WOULD produce — never persisted, so the wizard can show "vista previa del contexto" before a session/snapshot exists (spec section 5). */
export async function previewPerformanceContextAction(projectId: string, campaignId: string | null, selection: unknown) {
  const parsed = performanceContextSelectionSchema.safeParse(selection);
  if (!parsed.success) return { errorMessage: parsed.error.issues[0]?.message ?? "Selección no válida." };

  await requireProjectAccess(projectId, "VIEWER");
  const built = await buildPerformanceContext(projectId, campaignId, parsed.data);
  return { bundle: built.bundle, periodStart: built.periodStart.toISOString(), periodEnd: built.periodEnd.toISOString() };
}
