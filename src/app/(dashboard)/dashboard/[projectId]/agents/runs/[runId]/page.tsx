import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronRight, ExternalLink } from "lucide-react";
import { requireProjectAccess } from "@/lib/permissions";
import { getAgentRunDetailAction } from "@/server/actions/agent-select";
import { listBrandProfilesForSelectAction } from "@/server/actions/brand-profiles";
import { findAgentDefinition } from "@/lib/agents/registry";
import { resolveAgent } from "@/server/services/agent-catalog";
import { getSessionCreatedByAgentRunAction } from "@/server/actions/marketing-brain-optimization";
import { AgentRunInputForm } from "@/components/agents/agent-run-input-form";
import { AgentRunConfirmation } from "@/components/agents/agent-run-confirmation";
import { AgentRunExecutionPanel } from "@/components/agents/agent-run-execution-panel";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AgentRunDetailData } from "@/components/agents/types";

const OPTIMIZATION_STATUS_LABELS: Record<string, string> = { DRAFT: "Borrador", READY_FOR_REVIEW: "Lista para revisión", APPROVED: "Aprobada", REJECTED: "Rechazada", ARCHIVED: "Archivada" };

export const metadata: Metadata = { title: "Ejecución de agente" };

export default async function AgentRunPage({ params }: { params: Promise<{ projectId: string; runId: string }> }) {
  const { projectId, runId } = await params;
  await requireProjectAccess(projectId, "VIEWER");

  const run = await getAgentRunDetailAction(projectId, runId);
  if (!run) notFound();

  const brandProfiles = await listBrandProfilesForSelectAction(projectId);

  const detail: AgentRunDetailData = {
    id: run.id,
    projectId: run.projectId,
    status: run.status,
    currentStepOrder: run.currentStepOrder,
    progressPercent: run.progressPercent,
    officialAgentKey: run.officialAgentKey,
    customAgentId: run.customAgentId,
    customAgent: run.customAgent,
    teamId: run.teamId,
    team: run.team ? { id: run.team.id, name: run.team.name, errorStrategy: run.team.errorStrategy, members: run.team.members.map((m) => ({ agentRef: m.agentRef, order: m.order, enabled: m.enabled })) } : null,
    input: run.input as unknown as AgentRunDetailData["input"],
    approvedInput: run.approvedInput as unknown as AgentRunDetailData["approvedInput"],
    brandProfile: run.brandProfile,
    lastErrorMessage: run.lastErrorMessage,
    createdAt: run.createdAt.toISOString(),
    startedAt: run.startedAt ? run.startedAt.toISOString() : null,
    completedAt: run.completedAt ? run.completedAt.toISOString() : null,
    steps: run.steps.map((s) => ({
      id: s.id,
      order: s.order,
      agentRef: s.agentRef,
      status: s.status,
      input: s.input as unknown as AgentRunDetailData["steps"][number]["input"],
      output: s.output as unknown as AgentRunDetailData["steps"][number]["output"],
      errorMessage: s.errorMessage,
      errorCategory: s.errorCategory,
      attemptCount: s.attemptCount,
      requiresApproval: s.requiresApproval,
      startedAt: s.startedAt ? s.startedAt.toISOString() : null,
      completedAt: s.completedAt ? s.completedAt.toISOString() : null,
    })),
    resources: run.resources.map((r) => ({
      id: r.id,
      type: r.type,
      action: r.action,
      createdAt: r.createdAt.toISOString(),
      contentItem: r.contentItem,
      campaign: r.campaign,
      pillar: r.pillar,
      piece: r.piece,
      socialPost: r.socialPost,
      fileAsset: r.fileAsset,
    })),
    approvals: run.approvals.map((a) => ({
      stepOrder: a.stepOrder,
      status: a.status,
      comment: a.comment,
      decidedAt: a.decidedAt ? a.decidedAt.toISOString() : null,
      decidedBy: a.decidedBy,
    })),
  };

  const entryRef = run.teamId ? run.team?.members.find((m) => m.enabled)?.agentRef : (run.officialAgentKey ?? run.customAgentId ?? "");
  const entryAgent = entryRef ? await resolveAgent(projectId, entryRef) : null;
  const title = run.customAgent?.name ?? run.team?.name ?? (run.officialAgentKey ? findAgentDefinition(run.officialAgentKey)?.name : null) ?? "Ejecución";

  const linkedSession = run.officialAgentKey === "performance-strategist" ? await getSessionCreatedByAgentRunAction(projectId, runId) : null;

  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link href={`/dashboard/${projectId}/agents`} className="hover:text-foreground hover:underline">
          AI Agent Studio
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground">{title}</span>
      </nav>

      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>

      {linkedSession ? (
        <Card className="border-primary/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
            <div>
              <p className="font-medium">Sesión de optimización preparada por este agente</p>
              <p className="text-xs text-muted-foreground">
                {linkedSession.campaign?.name ?? "Sin campaña"} — siempre queda en borrador; la aprobación y conversión siguen siendo exclusivamente humanas.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{OPTIMIZATION_STATUS_LABELS[linkedSession.status] ?? linkedSession.status}</Badge>
              <Link href={`/dashboard/${projectId}/marketing-brain/optimization/${linkedSession.id}`} className="flex items-center gap-1 text-xs text-primary hover:underline">
                Abrir sesión <ExternalLink className="size-3" />
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {detail.status === "DRAFT" && entryAgent ? (
        <AgentRunInputForm
          projectId={projectId}
          run={detail}
          entryAgentName={entryAgent.name}
          requiredInputs={entryAgent.requiredInputs}
          optionalInputs={entryAgent.optionalInputs}
          brandProfiles={brandProfiles}
        />
      ) : detail.status === "READY" ? (
        <AgentRunConfirmation
          projectId={projectId}
          run={detail}
          stepLabels={detail.steps.map((s) => ({ agentRef: s.agentRef, name: findAgentDefinition(s.agentRef)?.name ?? s.agentRef, icon: null }))}
        />
      ) : (
        <AgentRunExecutionPanel projectId={projectId} run={detail} />
      )}
    </div>
  );
}
