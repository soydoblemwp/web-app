import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronRight, Pencil } from "lucide-react";
import { requireProjectAccess } from "@/lib/permissions";
import { getAgentTeamAction, listCustomAgentsAction } from "@/server/actions/agent-select";
import { findAgentDefinition } from "@/lib/agents/registry";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AgentIcon } from "@/components/agents/agent-icon";
import { NewAgentRunButton } from "@/components/agents/new-agent-run-button";

export const metadata: Metadata = { title: "Equipo de agentes" };

export default async function AgentTeamPage({ params }: { params: Promise<{ projectId: string; teamId: string }> }) {
  const { projectId, teamId } = await params;
  await requireProjectAccess(projectId, "VIEWER");

  const team = await getAgentTeamAction(projectId, teamId);
  if (!team) notFound();
  const customAgents = await listCustomAgentsAction(projectId);
  const customById = new Map(customAgents.map((a) => [a.id, a.name]));

  function agentName(ref: string) {
    return findAgentDefinition(ref)?.name ?? customById.get(ref) ?? ref;
  }

  return (
    <div className="max-w-3xl space-y-4">
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link href={`/dashboard/${projectId}/agents`} className="hover:text-foreground hover:underline">
          AI Agent Studio
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground">{team.name}</span>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{team.name}</h1>
        <div className="flex gap-2">
          <Button variant="outline" render={<Link href={`/dashboard/${projectId}/agent-teams/${teamId}/edit`} />}>
            <Pencil className="size-4" /> Editar
          </Button>
          <NewAgentRunButton projectId={projectId} teamId={teamId} label="Ejecutar equipo" />
        </div>
      </div>

      <Card>
        <CardContent className="space-y-3 py-4">
          {team.description ? <p className="text-sm text-muted-foreground">{team.description}</p> : null}
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">Coordinador: {agentName(team.coordinatorAgentRef)}</Badge>
            <Badge variant="outline">{team.errorStrategy === "STOP_ON_ERROR" ? "Detiene ante error" : "Continúa ante error"}</Badge>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Flujo</p>
            <div className="flex flex-wrap items-center gap-2">
              {team.members
                .sort((a, b) => a.order - b.order)
                .map((m) => (
                  <span key={m.id} className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${m.enabled ? "" : "opacity-40"}`}>
                    <AgentIcon agentRef={m.agentRef} className="size-3.5" /> {agentName(m.agentRef)}
                    {m.requireApproval ? <Badge variant="secondary">aprobación</Badge> : null}
                  </span>
                ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
