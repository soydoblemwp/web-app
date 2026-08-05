"use server";

import { revalidatePath } from "next/cache";
import { requireProjectAccess, getProjectRole } from "@/lib/permissions";
import { evaluatePolicy } from "@/lib/agents/governance-engine";
import { classifyAgentModeRisk } from "@/lib/agents/governance-risk";
import {
  createPolicyVersionSchema,
  simulatePolicySchema,
  decideGovernanceApprovalSchema,
  pauseProjectSchema,
  pauseAgentSchema,
  emergencyStopSchema,
  bulkCancelRunsSchema,
  runFilterSchema,
  updateRolloutScopeSchema,
  promoteRolloutSchema,
  retireRolloutSchema,
  massSimulationSchema,
  impactAnalysisSchema,
  comparePolicyVersionsSchema,
  restorePolicyVersionSchema,
  applyTemplateSchema,
  requestPolicyChangeApprovalSchema,
  decidePolicyChangeApprovalSchema,
} from "@/lib/validation/agent-governance";
import {
  getActivePolicy,
  getPolicyById,
  getMatchedRules,
  listPolicyVersions,
  getPolicyVersionDetail,
  createPolicyDraft,
  restorePolicyVersion,
  activatePolicyVersion,
  archivePolicyVersion,
  DEFAULT_POLICY_LIMITS,
} from "@/server/services/agent-governance-policy";
import { getGovernanceState, setProjectPaused, setAgentPaused, setEmergencyStop, bulkCancelActiveRuns } from "@/server/services/agent-governance-state";
import { getBudgetSnapshots } from "@/server/services/agent-governance-budget";
import { countActiveRunsForProject, countActiveRunsForAgent, countRunsToday, countRunsThisMonth } from "@/server/services/agent-governance-concurrency";
import { decideGovernanceApproval, cancelApprovalRequest } from "@/server/services/agent-governance-approvals";
import { getMissionControlOverview, listGovernedRuns, getRunGovernanceDetail } from "@/server/services/agent-governance-mission-control";
import { GOVERNANCE_LIMITS } from "@/lib/agents/governance-limits";
import { detectPolicyConflicts } from "@/lib/agents/governance-conflicts";
import type { CreatePolicyVersionInput } from "@/lib/validation/agent-governance";
import { GOVERNANCE_TEMPLATES, findGovernanceTemplate } from "@/lib/agents/governance-templates";
import { buildAgentModeCatalog, runMassSimulation } from "@/server/services/agent-governance-matrix";
import { getPolicyCoverage } from "@/server/services/agent-governance-coverage";
import { comparePolicyVersions } from "@/server/services/agent-governance-comparison";
import { analyzePolicyImpact } from "@/server/services/agent-governance-impact";
import { getRollout, listActiveRollouts, startShadowRollout, updateRolloutScope, promoteRollout, retireRollout, listShadowDifferences } from "@/server/services/agent-governance-rollout";
import { requestPolicyChangeApproval, decidePolicyChangeApproval, getPendingPolicyChangeApproval, canEnforceSeparationOfDuties } from "@/server/services/agent-governance-change-approval";
import { detectSensitiveChanges } from "@/lib/agents/governance-sensitive-changes";

/**
 * Server actions for AI Agent Governance & Mission Control (Fase 37). Policy
 * editing, activation, pause, emergency stop, and approval decisions are all
 * gated at MANAGER (spec section 27: reuses the real project role system —
 * no parallel role model). Read-only surfaces (overview, own-run detail,
 * simulation) are available to any EDITOR. Every action re-derives
 * `projectId` from its own argument and re-checks access — nothing here
 * trusts a client-supplied role or a cached permission.
 */

export async function getMissionControlOverviewAction(projectId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  return getMissionControlOverview(projectId);
}

export async function listGovernedRunsAction(projectId: string, input: unknown) {
  await requireProjectAccess(projectId, "EDITOR");
  const parsed = runFilterSchema.safeParse(input ?? {});
  if (!parsed.success) return { error: "Filtro no válido." };
  return listGovernedRuns(projectId, parsed.data);
}

export async function getRunGovernanceDetailAction(projectId: string, runId: string) {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const detail = await getRunGovernanceDetail(projectId, runId);
  if (!detail) return { error: "Ejecución no encontrada." };
  const role = await getProjectRole(user.id, projectId);
  const isManagerOrAbove = role === "MANAGER" || role === "OWNER";
  if (!isManagerOrAbove && detail.createdById !== user.id) return { error: "Solo puedes ver el detalle de gobernanza de tus propias ejecuciones." };
  return { detail };
}

export async function listPolicyVersionsAction(projectId: string) {
  await requireProjectAccess(projectId, "MANAGER");
  return listPolicyVersions(projectId);
}

export async function getPolicyVersionDetailAction(projectId: string, policyId: string) {
  await requireProjectAccess(projectId, "MANAGER");
  const detail = await getPolicyVersionDetail(projectId, policyId);
  if (!detail) return { error: "Política no encontrada." };
  return { detail };
}

export async function createPolicyDraftAction(projectId: string, input: unknown) {
  const user = await requireProjectAccess(projectId, "MANAGER");
  const parsed = createPolicyVersionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  const result = await createPolicyDraft(projectId, user.id, parsed.data);
  revalidatePath(`/dashboard/${projectId}/agents/governance`);
  return result;
}

export async function activatePolicyVersionAction(projectId: string, policyId: string) {
  const user = await requireProjectAccess(projectId, "MANAGER");
  const result = await activatePolicyVersion(projectId, user.id, policyId);
  revalidatePath(`/dashboard/${projectId}/agents/governance`);
  return result;
}

export async function archivePolicyVersionAction(projectId: string, policyId: string) {
  const user = await requireProjectAccess(projectId, "MANAGER");
  const result = await archivePolicyVersion(projectId, user.id, policyId);
  revalidatePath(`/dashboard/${projectId}/agents/governance`);
  return result;
}

/**
 * Policy simulation (spec section 11) — pure read: never creates a run,
 * never consumes budget, never emits a lifecycle event. Uses the SAME
 * `evaluatePolicy` engine every real execution goes through, fed with real
 * current state (policy, pause, concurrency, budgets) but a user-supplied
 * hypothetical operation/size — never a second, approximate engine.
 */
export async function simulateGovernancePolicyAction(projectId: string, input: unknown) {
  await requireProjectAccess(projectId, "MANAGER");
  const parsed = simulatePolicySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos de simulación no válidos." };
  const sim = parsed.data;

  const policy = await getActivePolicy(projectId);
  const state = await getGovernanceState(projectId);
  const matched = policy ? await getMatchedRules(policy.id, sim.agentRef, sim.mode ?? null) : { agentRule: null, modeRule: null };
  const limits = policy?.limits ?? DEFAULT_POLICY_LIMITS;
  const riskLevel = classifyAgentModeRisk(sim.agentRef, sim.mode ?? null);

  const [runsToday, runsThisMonth, budgets] = await Promise.all([
    countRunsToday(projectId, sim.agentRef),
    countRunsThisMonth(projectId),
    getBudgetSnapshots(projectId, "PROJECT", "", limits),
  ]);

  const result = evaluatePolicy({
    projectId,
    userId: "simulation",
    hasProjectAccess: true,
    agentRef: sim.agentRef,
    agentIsOfficial: true,
    mode: sim.mode ?? null,
    operationType: sim.operationType,
    riskLevel,
    contextChars: sim.contextChars,
    expectedOutputChars: sim.expectedOutputChars,
    retryCount: sim.retryCount,
    concurrentRunsForProject: sim.simulatedConcurrentRunsForProject,
    concurrentRunsForAgent: sim.simulatedConcurrentRunsForAgent,
    runsTodayForProject: runsToday,
    runsThisMonthForProject: runsThisMonth,
    emergencyStopEnabled: state.emergencyStopEnabled,
    projectPaused: state.projectPaused,
    agentPaused: state.pausedAgentRefs.includes(sim.agentRef),
    policy,
    matchedAgentRule: matched.agentRule,
    matchedModeRule: matched.modeRule,
    budgets,
    preApprovedRequestId: null,
  });

  return { result };
}

export async function setProjectPausedAction(projectId: string, input: unknown) {
  const user = await requireProjectAccess(projectId, "MANAGER");
  const parsed = pauseProjectSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos no válidos." };
  await setProjectPaused(projectId, user.id, parsed.data.paused, parsed.data.reason);
  revalidatePath(`/dashboard/${projectId}/agents/governance`);
  return {};
}

export async function setAgentPausedAction(projectId: string, input: unknown) {
  const user = await requireProjectAccess(projectId, "MANAGER");
  const parsed = pauseAgentSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos no válidos." };
  await setAgentPaused(projectId, user.id, parsed.data.agentRef, parsed.data.paused);
  revalidatePath(`/dashboard/${projectId}/agents/governance`);
  return {};
}

export async function setEmergencyStopAction(projectId: string, input: unknown) {
  const user = await requireProjectAccess(projectId, "MANAGER");
  const parsed = emergencyStopSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos no válidos." };
  await setEmergencyStop(projectId, user.id, parsed.data.enabled, parsed.data.reason);
  revalidatePath(`/dashboard/${projectId}/agents/governance`);
  return {};
}

export async function bulkCancelActiveRunsAction(projectId: string, input: unknown) {
  const user = await requireProjectAccess(projectId, "MANAGER");
  const parsed = bulkCancelRunsSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos no válidos." };
  const result = await bulkCancelActiveRuns(projectId, user.id, parsed.data.runIds);
  revalidatePath(`/dashboard/${projectId}/agents/governance`);
  return result;
}

export async function decideGovernanceApprovalAction(projectId: string, input: unknown) {
  const user = await requireProjectAccess(projectId, "MANAGER");
  const parsed = decideGovernanceApprovalSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos no válidos." };
  const result = await decideGovernanceApproval(projectId, parsed.data.approvalId, user.id, parsed.data.decision, parsed.data.comment);
  revalidatePath(`/dashboard/${projectId}/agents/governance`);
  return result;
}

export async function cancelGovernanceApprovalAction(projectId: string, approvalId: string) {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const result = await cancelApprovalRequest(projectId, user.id, approvalId);
  revalidatePath(`/dashboard/${projectId}/agents/governance`);
  return result;
}

export async function getGovernanceLimitsAction() {
  return GOVERNANCE_LIMITS;
}

export async function getAgentConcurrencySnapshotAction(projectId: string, agentRef: string) {
  await requireProjectAccess(projectId, "EDITOR");
  const [project, agent] = await Promise.all([countActiveRunsForProject(projectId), countActiveRunsForAgent(projectId, agentRef)]);
  return { project, agent };
}

// ---------------------------------------------------------------------------
// Fase 38: Policy Studio — matrix, effective policy, conflicts, coverage,
// comparison, impact analysis, mass simulation, rollout, templates, change
// approval. All admin/write actions gated at MANAGER; reads at EDITOR.
// ---------------------------------------------------------------------------

export async function getAgentModeCatalogAction(projectId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  return buildAgentModeCatalog(projectId);
}

/** Live, pre-save conflict preview (spec section 31) — pure, no DB write. */
export async function previewPolicyConflictsAction(projectId: string, input: unknown) {
  await requireProjectAccess(projectId, "MANAGER");
  const parsed = createPolicyVersionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  return { conflicts: detectPolicyConflicts({ ...parsed.data, requireApprovalAtOrAboveRisk: parsed.data.requireApprovalAtOrAboveRisk ?? null, maxRunsPerDay: parsed.data.maxRunsPerDay ?? null }) };
}

export async function getPolicyCoverageAction(projectId: string, policyId: string) {
  await requireProjectAccess(projectId, "MANAGER");
  return getPolicyCoverage(projectId, policyId);
}

export async function comparePolicyVersionsAction(projectId: string, input: unknown) {
  await requireProjectAccess(projectId, "EDITOR");
  const parsed = comparePolicyVersionsSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos no válidos." };
  return comparePolicyVersions(projectId, parsed.data.policyIdA, parsed.data.policyIdB);
}

/** Impact analysis (spec section 16) — real historical runs, bounded (spec section 17), never mutates a run. */
export async function analyzePolicyImpactAction(projectId: string, input: unknown) {
  await requireProjectAccess(projectId, "MANAGER");
  const parsed = impactAnalysisSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  return analyzePolicyImpact(projectId, parsed.data);
}

/** Mass simulation over the full agent x mode matrix (spec section 18) — never creates a run. */
export async function runMassSimulationAction(projectId: string, input: unknown) {
  await requireProjectAccess(projectId, "MANAGER");
  const parsed = massSimulationSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  return runMassSimulation(projectId, parsed.data.policyId, parsed.data.agentRefs, parsed.data.operationType);
}

export async function restorePolicyVersionAction(projectId: string, input: unknown) {
  const user = await requireProjectAccess(projectId, "MANAGER");
  const parsed = restorePolicyVersionSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos no válidos." };
  const result = await restorePolicyVersion(projectId, user.id, parsed.data.sourcePolicyId);
  revalidatePath(`/dashboard/${projectId}/agents/governance`);
  return result;
}

export async function listGovernanceTemplatesAction() {
  return GOVERNANCE_TEMPLATES.map((t) => ({ key: t.key, label: t.label, description: t.description }));
}

export async function getGovernanceTemplateDraftAction(projectId: string, input: unknown) {
  await requireProjectAccess(projectId, "MANAGER");
  const parsed = applyTemplateSchema.safeParse(input);
  if (!parsed.success) return { error: "Plantilla no válida." };
  const template = findGovernanceTemplate(parsed.data.templateKey);
  if (!template) return { error: "Plantilla no encontrada." };
  const draft: CreatePolicyVersionInput = template.draft;
  return { draft };
}

// --- Rollout (SHADOW / LIMITED / PROMOTED / RETIRED) ------------------------

export async function listActiveRolloutsAction(projectId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  return listActiveRollouts(projectId);
}

export async function getRolloutAction(projectId: string, policyId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  return getRollout(projectId, policyId);
}

export async function listShadowDifferencesAction(projectId: string, rolloutId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  return listShadowDifferences(projectId, rolloutId);
}

export async function startShadowRolloutAction(projectId: string, policyId: string) {
  const user = await requireProjectAccess(projectId, "MANAGER");
  const result = await startShadowRollout(projectId, user.id, policyId);
  revalidatePath(`/dashboard/${projectId}/agents/governance`);
  return result;
}

export async function updateRolloutScopeAction(projectId: string, input: unknown) {
  const user = await requireProjectAccess(projectId, "MANAGER");
  const parsed = updateRolloutScopeSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos no válidos." };
  const result = await updateRolloutScope(projectId, user.id, parsed.data.policyId, { scopeAgentRefs: parsed.data.scopeAgentRefs, scopeModes: parsed.data.scopeModes, percentage: parsed.data.percentage ?? null });
  revalidatePath(`/dashboard/${projectId}/agents/governance`);
  return result;
}

export async function promoteRolloutAction(projectId: string, input: unknown) {
  const user = await requireProjectAccess(projectId, "MANAGER");
  const parsed = promoteRolloutSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos no válidos." };
  const result = await promoteRollout(projectId, user.id, parsed.data.policyId, parsed.data.targetStage);
  revalidatePath(`/dashboard/${projectId}/agents/governance`);
  return result;
}

export async function retireRolloutAction(projectId: string, input: unknown) {
  const user = await requireProjectAccess(projectId, "MANAGER");
  const parsed = retireRolloutSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos no válidos." };
  const result = await retireRollout(projectId, user.id, parsed.data.policyId);
  revalidatePath(`/dashboard/${projectId}/agents/governance`);
  return result;
}

// --- Sensitive policy-change approval (spec sections 23-24) -----------------

export async function getPolicyChangeStatusAction(projectId: string, policyId: string) {
  await requireProjectAccess(projectId, "MANAGER");
  const [pending, separationEnforced] = await Promise.all([getPendingPolicyChangeApproval(projectId, policyId), canEnforceSeparationOfDuties(projectId)]);
  return { pending, separationEnforced };
}

export async function requestPolicyChangeApprovalAction(projectId: string, input: unknown) {
  const user = await requireProjectAccess(projectId, "MANAGER");
  const parsed = requestPolicyChangeApprovalSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos no válidos." };
  const policy = await getPolicyById(projectId, parsed.data.policyId);
  if (!policy) return { error: "Política no encontrada." };
  const activePolicy = await getActivePolicy(projectId);
  const sensitiveChanges = detectSensitiveChanges(
    activePolicy ? { ...activePolicy.limits, disabledAgentRefs: activePolicy.disabledAgentRefs } : null,
    { ...policy.limits, disabledAgentRefs: policy.disabledAgentRefs }
  );
  const result = await requestPolicyChangeApproval(projectId, parsed.data.policyId, user.id, parsed.data.reason, sensitiveChanges);
  revalidatePath(`/dashboard/${projectId}/agents/governance`);
  return result;
}

export async function decidePolicyChangeApprovalAction(projectId: string, input: unknown) {
  const user = await requireProjectAccess(projectId, "MANAGER");
  const parsed = decidePolicyChangeApprovalSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos no válidos." };
  const result = await decidePolicyChangeApproval(projectId, parsed.data.approvalId, user.id, parsed.data.decision, parsed.data.comment);
  revalidatePath(`/dashboard/${projectId}/agents/governance`);
  return result;
}
