import "server-only";
import { prisma } from "@/lib/db/prisma";

/**
 * Governance-specific audit helper — reuses the existing, workspace-scoped
 * `AuditLog` model directly (Fase 37 spec section 4: "no crees otro sistema
 * de auditoría si el existente puede ampliarse"), following the exact same
 * shape as `logAdminAction` in src/server/actions/admin.ts. `AuditLog` is
 * keyed by `workspaceId`, not `projectId`, so every call here resolves the
 * project's workspace first.
 *
 * Never pass secrets/tokens/full prompts as `metadata` — callers must already
 * have sanitized/truncated anything user-supplied (spec section 35).
 */
export async function logGovernanceAction(
  projectId: string,
  actorId: string | null,
  action: string,
  targetType: string,
  targetId: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { workspaceId: true } });
  await prisma.auditLog.create({
    data: {
      workspaceId: project?.workspaceId ?? null,
      actorId,
      action,
      targetType,
      targetId,
      metadata: metadata ? (metadata as object) : undefined,
    },
  });
}
