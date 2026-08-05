import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronRight, Pencil } from "lucide-react";
import { requireProjectAccess } from "@/lib/permissions";
import { findAgentDefinition } from "@/lib/agents/registry";
import { getCustomAgentAction, listAgentMemoryAction } from "@/server/actions/agent-select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AgentIcon } from "@/components/agents/agent-icon";
import { NewAgentRunButton } from "@/components/agents/new-agent-run-button";
import { MemoryPanel } from "@/components/agents/memory-panel";

export const metadata: Metadata = { title: "Agente" };

export default async function AgentDetailPage({ params }: { params: Promise<{ projectId: string; agentId: string }> }) {
  const { projectId, agentId } = await params;
  await requireProjectAccess(projectId, "VIEWER");

  const official = findAgentDefinition(agentId);
  const custom = official ? null : await getCustomAgentAction(projectId, agentId);
  if (!official && !custom) notFound();

  const memory = await listAgentMemoryAction(projectId, agentId);
  const name = official?.name ?? custom!.name;
  const description = official?.description ?? custom!.description;
  const category = official?.category ?? custom!.category;
  const capabilities = official?.capabilities ?? [];

  return (
    <div className="max-w-3xl space-y-4">
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link href={`/dashboard/${projectId}/agents`} className="hover:text-foreground hover:underline">
          AI Agent Studio
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground">{name}</span>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <AgentIcon agentRef={agentId} customIconName={custom?.icon} className="size-6" /> {name}
        </h1>
        <div className="flex gap-2">
          {custom ? (
            <Button variant="outline" render={<Link href={`/dashboard/${projectId}/agents/${agentId}/edit`} />}>
              <Pencil className="size-4" /> Editar
            </Button>
          ) : null}
          <NewAgentRunButton projectId={projectId} officialAgentKey={official?.key} customAgentId={custom?.id} label="Nueva ejecución" />
        </div>
      </div>

      <Card>
        <CardContent className="space-y-3 py-4">
          <p className="text-sm text-muted-foreground">{description}</p>
          <Badge variant="outline">{category}</Badge>
          {capabilities.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {capabilities.map((c) => (
                <Badge key={c} variant="secondary">
                  {c}
                </Badge>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <MemoryPanel
        projectId={projectId}
        agentRef={agentId}
        initialMemory={memory.map((m) => ({
          id: m.id,
          type: m.type,
          content: m.content,
          isActive: m.isActive,
          createdAt: m.createdAt.toISOString(),
          approvedBy: m.approvedBy,
        }))}
      />
    </div>
  );
}
