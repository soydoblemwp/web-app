import "server-only";
import { prisma } from "@/lib/db/prisma";
import { publishAutomationEvent } from "@/server/services/automation-events";
import { logGovernanceAction } from "@/server/services/agent-governance-audit";
import { notifyGovernanceEmergencyStop, notifyGovernanceAgentPaused } from "@/server/services/agent-governance-notifications";

/**
 * Project-wide pause, per-agent pause, and emergency stop (Fase 37 spec
 * section 16) — a single mutable-in-place singleton row per project
 * (`AiAgentProjectGovernanceState`), deliberately SEPARATE from the
 * versioned/immutable `AiAgentPolicy` (spec section 10 requires policy
 * edits to be versioned; these three controls are meant to be an instant
 * "interruptor", not a deliberate policy edit — both are still fully
 * audited via `AuditLog` + a real Automation Center event).
 *
 * None of these ever auto-cancels active runs, deletes a run, or deletes
 * audit history — they only ever block NEW runs/retries/resumptions from
 * this point forward (enforced by the pure engine's steps 4-6).
 */

export async function getGovernanceState(projectId: string) {
  const row = await prisma.aiAgentProjectGovernanceState.findUnique({ where: { projectId } });
  return (
    row ?? {
      id: null,
      projectId,
      projectPaused: false,
      projectPausedAt: null,
      projectPausedById: null,
      emergencyStopEnabled: false,
      emergencyStopEnabledAt: null,
      emergencyStopEnabledById: null,
      pausedAgentRefs: [] as string[],
      updatedAt: null,
      createdAt: null,
    }
  );
}

export async function setProjectPaused(projectId: string, actorId: string, paused: boolean, reason?: string) {
  const now = new Date();
  await prisma.aiAgentProjectGovernanceState.upsert({
    where: { projectId },
    create: { projectId, projectPaused: paused, projectPausedAt: paused ? now : null, projectPausedById: paused ? actorId : null },
    update: { projectPaused: paused, projectPausedAt: paused ? now : null, projectPausedById: paused ? actorId : null },
  });

  await logGovernanceAction(projectId, actorId, paused ? "ai_agent_governance.project_paused" : "ai_agent_governance.project_resumed", "AiAgentProjectGovernanceState", projectId, reason ? { reason } : undefined);
  await publishAutomationEvent({
    projectId,
    eventKey: paused ? "ai_agent_governance.project_paused" : "ai_agent_governance.project_resumed",
    actorId,
    payload: { projectId },
    idempotencyKey: `ai_agent_governance.project_pause:${projectId}:${now.getTime()}`,
  });
}

export async function setAgentPaused(projectId: string, actorId: string, agentRef: string, paused: boolean) {
  const state = await prisma.aiAgentProjectGovernanceState.findUnique({ where: { projectId } });
  const current = state?.pausedAgentRefs ?? [];
  const next = paused ? Array.from(new Set([...current, agentRef])) : current.filter((r) => r !== agentRef);

  await prisma.aiAgentProjectGovernanceState.upsert({
    where: { projectId },
    create: { projectId, pausedAgentRefs: next },
    update: { pausedAgentRefs: next },
  });

  await logGovernanceAction(projectId, actorId, paused ? "ai_agent_governance.agent_paused" : "ai_agent_governance.agent_resumed", "AiAgentProjectGovernanceState", projectId, { agentRef });
  await publishAutomationEvent({
    projectId,
    eventKey: paused ? "ai_agent_governance.agent_paused" : "ai_agent_governance.agent_resumed",
    actorId,
    payload: { agentRef },
    idempotencyKey: `ai_agent_governance.agent_pause:${projectId}:${agentRef}:${paused}:${Date.now()}`,
  });
  await notifyGovernanceAgentPaused(projectId, agentRef, paused);
}

export async function setEmergencyStop(projectId: string, actorId: string, enabled: boolean, reason?: string) {
  const now = new Date();
  await prisma.aiAgentProjectGovernanceState.upsert({
    where: { projectId },
    create: { projectId, emergencyStopEnabled: enabled, emergencyStopEnabledAt: enabled ? now : null, emergencyStopEnabledById: enabled ? actorId : null },
    update: { emergencyStopEnabled: enabled, emergencyStopEnabledAt: enabled ? now : null, emergencyStopEnabledById: enabled ? actorId : null },
  });

  await logGovernanceAction(projectId, actorId, enabled ? "ai_agent_governance.emergency_stop_enabled" : "ai_agent_governance.emergency_stop_disabled", "AiAgentProjectGovernanceState", projectId, reason ? { reason } : undefined);
  await publishAutomationEvent({
    projectId,
    eventKey: enabled ? "ai_agent_governance.emergency_stop_enabled" : "ai_agent_governance.emergency_stop_disabled",
    actorId,
    payload: { projectId },
    idempotencyKey: `ai_agent_governance.emergency_stop:${projectId}:${now.getTime()}`,
  });
  await notifyGovernanceEmergencyStop(projectId, enabled);
}

/**
 * Bulk-cancels currently active runs (spec section 16: idempotent, shows
 * count, preserves history, never marks CANCELLED runs as COMPLETED). Only
 * cancels runs that are STILL active at the moment of the update
 * (conditioned `updateMany`, not a blind status write) — repeating the same
 * call is a no-op for already-terminal runs.
 */
export async function bulkCancelActiveRuns(projectId: string, actorId: string, runIds: string[]) {
  const now = new Date();
  const result = await prisma.aiAgentRun.updateMany({
    where: { id: { in: runIds }, projectId, status: { in: ["DRAFT", "READY", "RUNNING", "WAITING_FOR_APPROVAL"] } },
    data: { status: "CANCELLED", cancelledAt: now, completedAt: now },
  });
  await logGovernanceAction(projectId, actorId, "ai_agent_governance.bulk_cancel_runs", "AiAgentRun", projectId, { requested: runIds.length, cancelled: result.count });
  return { cancelled: result.count };
}
