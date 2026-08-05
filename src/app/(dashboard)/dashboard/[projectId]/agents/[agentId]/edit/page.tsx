import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireProjectAccess } from "@/lib/permissions";
import { getCustomAgentAction } from "@/server/actions/agent-select";
import { AgentForm } from "@/components/agents/agent-form";
import type { AgentInputFieldSpec } from "@/lib/agents/types";

export const metadata: Metadata = { title: "Editar agente" };

export default async function EditAgentPage({ params }: { params: Promise<{ projectId: string; agentId: string }> }) {
  const { projectId, agentId } = await params;
  await requireProjectAccess(projectId, "EDITOR");

  const agent = await getCustomAgentAction(projectId, agentId);
  if (!agent) notFound();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Editar agente</h1>
      <AgentForm
        projectId={projectId}
        agentId={agent.id}
        initialValues={{
          name: agent.name,
          description: agent.description,
          icon: agent.icon,
          category: agent.category,
          objective: agent.objective ?? "",
          systemInstructions: agent.systemInstructions,
          inputSchema: agent.inputSchema as unknown as AgentInputFieldSpec[],
          outputType: agent.outputType.toLowerCase(),
          language: agent.language,
          creativity: agent.creativity,
          allowedTools: agent.allowedTools,
          requireApproval: agent.requireApproval,
          maxSteps: agent.maxSteps,
          visibility: agent.visibility,
        }}
      />
    </div>
  );
}
