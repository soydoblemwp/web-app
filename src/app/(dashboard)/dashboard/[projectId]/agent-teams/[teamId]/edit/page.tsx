import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireProjectAccess } from "@/lib/permissions";
import { getAgentTeamAction, listCustomAgentsAction } from "@/server/actions/agent-select";
import { TeamForm } from "@/components/agents/team-form";

export const metadata: Metadata = { title: "Editar equipo" };

export default async function EditAgentTeamPage({ params }: { params: Promise<{ projectId: string; teamId: string }> }) {
  const { projectId, teamId } = await params;
  await requireProjectAccess(projectId, "EDITOR");

  const team = await getAgentTeamAction(projectId, teamId);
  if (!team) notFound();
  const customAgents = await listCustomAgentsAction(projectId);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Editar equipo</h1>
      <TeamForm
        projectId={projectId}
        teamId={team.id}
        customAgents={customAgents.map((a) => ({ id: a.id, name: a.name }))}
        initialValues={{
          name: team.name,
          description: team.description ?? "",
          objective: team.objective ?? "",
          coordinatorAgentRef: team.coordinatorAgentRef,
          reviewerAgentRef: team.reviewerAgentRef,
          errorStrategy: team.errorStrategy,
          members: team.members.map((m) => ({ agentRef: m.agentRef, order: m.order, enabled: m.enabled, requireApproval: m.requireApproval })),
        }}
      />
    </div>
  );
}
