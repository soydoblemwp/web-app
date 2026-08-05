import type { Metadata } from "next";
import { requireProjectAccess, getProjectRole } from "@/lib/permissions";
import { listKnowledgeSourcesAction, listKnowledgeSyncHistoryAction, getSuggestedSyncPathsAction } from "@/server/actions/customer-support";
import { KnowledgeAdmin } from "@/components/customer-support/knowledge-admin";

export const metadata: Metadata = { title: "Conocimiento — Servicio al cliente" };

export default async function CustomerSupportKnowledgePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireProjectAccess(projectId, "EDITOR");
  const role = await getProjectRole(user.id, projectId);
  const isManager = role === "MANAGER" || role === "OWNER";

  const [sources, history, suggestedPaths] = await Promise.all([listKnowledgeSourcesAction(projectId, {}), listKnowledgeSyncHistoryAction(projectId), getSuggestedSyncPathsAction()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Base de conocimiento</h1>
        <p className="text-sm text-muted-foreground">Solo las fuentes APROBADAS y PUBLICAS pueden usarse en el widget publico.</p>
      </div>
      <KnowledgeAdmin
        projectId={projectId}
        isManager={isManager}
        suggestedPaths={suggestedPaths as unknown as string[]}
        initialSources={sources.map((s) => ({
          id: s.id,
          title: s.title,
          type: s.type,
          sourceRef: s.sourceRef,
          status: s.status,
          visibility: s.visibility,
          language: s.language,
          excerpt: s.excerpt,
          lastSyncedAt: s.lastSyncedAt ? s.lastSyncedAt.toISOString() : null,
        }))}
        initialHistory={history.map((h) => ({
          id: h.id,
          requestedPath: h.requestedPath,
          status: h.status,
          changeDetected: h.changeDetected,
          errorMessage: h.errorMessage,
          createdAt: h.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
