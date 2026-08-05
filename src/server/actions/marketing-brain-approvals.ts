"use server";

import { requireProjectAccess } from "@/lib/permissions";
import { decideMarketingBrainApprovalSchema } from "@/lib/validation/marketing-brain";
import { decideApproval } from "@/server/services/marketing-brain-orchestrator";
import type { MarketingBrainStepKey } from "@/generated/prisma/enums";

export async function decideMarketingBrainApprovalAction(projectId: string, runId: string, input: unknown): Promise<{ error?: string }> {
  const parsed = decideMarketingBrainApprovalSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };

  const user = await requireProjectAccess(projectId, "EDITOR");
  return decideApproval(projectId, runId, user.id, parsed.data.stepKey as MarketingBrainStepKey, parsed.data.decision, parsed.data.comment ?? "");
}
