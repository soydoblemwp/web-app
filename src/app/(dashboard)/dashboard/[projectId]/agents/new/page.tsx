import type { Metadata } from "next";
import { requireProjectAccess } from "@/lib/permissions";
import { AgentForm } from "@/components/agents/agent-form";

export const metadata: Metadata = { title: "Crear agente" };

export default async function NewAgentPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectAccess(projectId, "EDITOR");

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Crear agente personalizado</h1>
      <AgentForm projectId={projectId} />
    </div>
  );
}
