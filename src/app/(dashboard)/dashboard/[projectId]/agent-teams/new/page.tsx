import type { Metadata } from "next";
import { requireProjectAccess } from "@/lib/permissions";
import { listCustomAgentsAction } from "@/server/actions/agent-select";
import { TeamForm } from "@/components/agents/team-form";

export const metadata: Metadata = { title: "Crear equipo de agentes" };

export default async function NewAgentTeamPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectAccess(projectId, "EDITOR");
  const customAgents = await listCustomAgentsAction(projectId);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Crear equipo de agentes</h1>
      <TeamForm projectId={projectId} customAgents={customAgents.map((a) => ({ id: a.id, name: a.name }))} />
    </div>
  );
}
