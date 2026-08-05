"use server";

import { requireProjectAccess } from "@/lib/permissions";
import { decideAgentApprovalSchema } from "@/lib/validation/agents";
import { decideApproval } from "@/server/services/agent-orchestrator";

export async function decideAgentApprovalAction(projectId: string, runId: string, input: unknown): Promise<{ error?: string }> {
  const parsed = decideAgentApprovalSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  const user = await requireProjectAccess(projectId, "EDITOR");
  return decideApproval(
    projectId,
    runId,
    user.id,
    parsed.data.stepOrder,
    parsed.data.decision,
    parsed.data.comment ?? "",
    parsed.data.revisedOutput as Record<string, unknown> | undefined
  );
}
