import type { Metadata } from "next";
import { MessageCircleQuestion } from "lucide-react";
import { requireProjectAccess } from "@/lib/permissions";
import { listKnowledgeQueriesAction } from "@/server/actions/knowledge-queries";
import { AskPanel } from "@/components/knowledge/ask-panel";

export const metadata: Metadata = { title: "Preguntar — Knowledge Base" };

export default async function KnowledgeAskPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectAccess(projectId, "VIEWER");

  const history = await listKnowledgeQueriesAction(projectId);
  const historyItems = history.map((h) => ({
    id: h.id,
    question: h.question,
    status: h.status,
    mode: h.mode,
    createdAt: h.createdAt.toISOString(),
    askedBy: { name: h.askedBy.name, email: h.askedBy.email },
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <MessageCircleQuestion className="size-5" /> Preguntar a la base de conocimiento
        </h1>
        <p className="text-sm text-muted-foreground">Respuestas con citas reales a las fuentes de este proyecto — nunca inventa fuentes ni oculta la falta de evidencia.</p>
      </div>
      <AskPanel projectId={projectId} history={historyItems} />
    </div>
  );
}
