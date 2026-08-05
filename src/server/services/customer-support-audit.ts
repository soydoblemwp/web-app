import "server-only";
import { prisma } from "@/lib/db/prisma";

/**
 * Reuses the existing, workspace-scoped `AuditLog` model directly (Fase 40
 * spec section 31: "reutiliza AuditLog") - mirrors
 * src/server/services/google-audit.ts's `logIntegrationAction` exactly.
 * Never pass message text, secrets, or prompts as `metadata` - callers must
 * already have sanitized anything visitor-supplied before calling this
 * (spec: "no registres mensajes completos; no registres secretos; no
 * registres prompts").
 */
export async function logCustomerSupportAction(
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
