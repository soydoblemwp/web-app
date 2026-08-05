import type { Metadata } from "next";
import { requireProjectAccess, getProjectRole } from "@/lib/permissions";
import { listHandoffsAction } from "@/server/actions/customer-support";
import { HandoffsAdmin } from "@/components/customer-support/handoffs-admin";

export const metadata: Metadata = { title: "Atencion humana — Servicio al cliente" };

export default async function CustomerSupportHandoffsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireProjectAccess(projectId, "EDITOR");
  const role = await getProjectRole(user.id, projectId);
  const isManager = role === "MANAGER" || role === "OWNER";

  const result = await listHandoffsAction(projectId, {});
  const handoffs = "error" in result ? [] : result.handoffs;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Solicitudes de atencion humana</h1>
        <p className="text-sm text-muted-foreground">Visitantes que pidieron ayuda humana desde el widget.</p>
      </div>
      <HandoffsAdmin
        projectId={projectId}
        isManager={isManager}
        initialHandoffs={handoffs.map((h) => ({
          id: h.id,
          subject: h.subject,
          category: h.category,
          priority: h.priority,
          status: h.status,
          sanitizedMessage: h.sanitizedMessage,
          originPage: h.originPage,
          assignedTo: h.assignedTo ? { id: h.assignedTo.id, name: h.assignedTo.name, email: h.assignedTo.email } : null,
          createdAt: h.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
