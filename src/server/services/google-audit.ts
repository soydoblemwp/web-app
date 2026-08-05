import "server-only";
import { prisma } from "@/lib/db/prisma";

/**
 * Reuses the existing, workspace-scoped `AuditLog` model directly (Fase 39
 * spec section 28: "reutiliza AuditLog. No crees otro sistema de
 * auditoría."), following the exact same pattern as
 * src/server/services/agent-governance-audit.ts's `logGovernanceAction`.
 *
 * Never pass tokens/secrets/OAuth codes/code_verifiers/full provider
 * response bodies as `metadata` — callers must already have sanitized
 * anything Google-supplied before calling this.
 */
export async function logIntegrationAction(
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
