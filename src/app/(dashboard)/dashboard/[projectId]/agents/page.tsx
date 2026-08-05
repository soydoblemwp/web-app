import type { Metadata } from "next";
import Link from "next/link";
import { Bot, Plus, Users } from "lucide-react";
import { requireProjectAccess } from "@/lib/permissions";
import { listAgentRunsAction, listOfficialAgentsAction, listCustomAgentsAction, listAgentTeamsAction, listFavoriteAgentRefsAction } from "@/server/actions/agent-select";
import { Button } from "@/components/ui/button";
import { AgentsHub } from "@/components/agents/agents-hub";
import type { AgentRunListItem, CustomAgentListItem, TeamListItem } from "@/components/agents/types";

export const metadata: Metadata = { title: "AI Agent Studio" };

export default async function AgentsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectAccess(projectId, "VIEWER");

  const [runs, officialAgents, customAgents, teams, favorites] = await Promise.all([
    listAgentRunsAction(projectId),
    listOfficialAgentsAction(projectId),
    listCustomAgentsAction(projectId),
    listAgentTeamsAction(projectId),
    listFavoriteAgentRefsAction(projectId),
  ]);

  const runItems: AgentRunListItem[] = runs.map((r) => ({
    id: r.id,
    status: r.status,
    progressPercent: r.progressPercent,
    createdAt: r.createdAt.toISOString(),
    officialAgentKey: r.officialAgentKey,
    customAgent: r.customAgent,
    team: r.team,
    createdBy: r.createdBy,
    stepCount: r._count.steps,
    resourceCount: r._count.resources,
  }));

  const customAgentItems: CustomAgentListItem[] = customAgents.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    icon: a.icon,
    category: a.category,
    status: a.status,
    outputType: a.outputType,
    createdBy: a.createdBy,
  }));

  const teamItems: TeamListItem[] = teams.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    status: t.status,
    members: t.members.map((m) => ({ agentRef: m.agentRef, order: m.order, enabled: m.enabled })),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Bot className="size-6" /> AI Agent Studio
          </h1>
          <p className="text-sm text-muted-foreground">Agentes especializados que trabajan solos o en equipo para completar tareas complejas.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" render={<Link href={`/dashboard/${projectId}/agents/new`} />}>
            <Plus className="size-4" /> Crear agente
          </Button>
          <Button variant="outline" render={<Link href={`/dashboard/${projectId}/agent-teams/new`} />}>
            <Users className="size-4" /> Crear equipo
          </Button>
        </div>
      </div>

      <AgentsHub projectId={projectId} officialAgents={officialAgents} customAgents={customAgentItems} teams={teamItems} runs={runItems} favorites={favorites} />
    </div>
  );
}
