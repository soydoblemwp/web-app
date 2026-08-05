import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { requireProjectAccess, getProjectRole } from "@/lib/permissions";
import { getMissionControlOverviewAction, listPolicyVersionsAction } from "@/server/actions/agent-governance";
import { GovernanceMissionControl } from "@/components/agents/governance-mission-control";

export const metadata: Metadata = { title: "Gobernanza de agentes de IA" };

export default async function AgentGovernancePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireProjectAccess(projectId, "EDITOR");
  const role = await getProjectRole(user.id, projectId);
  const isManager = role === "MANAGER" || role === "OWNER";

  const [overview, policyVersions] = await Promise.all([
    getMissionControlOverviewAction(projectId),
    isManager ? listPolicyVersionsAction(projectId) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <ShieldCheck className="size-6" /> Gobernanza de agentes de IA
        </h1>
        <p className="text-sm text-muted-foreground">Políticas, límites, presupuestos, aprobaciones y supervisión en tiempo real de las ejecuciones de AI Agents en este proyecto.</p>
      </div>

      <GovernanceMissionControl
        projectId={projectId}
        isManager={isManager}
        overview={{
          policy: overview.policy ? { id: overview.policy.id, version: overview.policy.version, limits: overview.policy.limits as unknown as Record<string, unknown> } : null,
          state: overview.state,
          concurrency: overview.concurrency,
          statusCounts: overview.statusCounts,
          deniedCount: overview.deniedCount,
          requireApprovalCount: overview.requireApprovalCount,
          recentRuns: overview.recentRuns.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), completedAt: r.completedAt ? r.completedAt.toISOString() : null })),
          pendingApprovals: overview.pendingApprovals.map((a) => ({
            ...a,
            createdAt: a.createdAt.toISOString(),
            expiresAt: a.expiresAt ? a.expiresAt.toISOString() : null,
            requestedBy: a.requestedBy,
          })),
          recentDecisions: overview.recentDecisions.map((d) => ({ ...d, evaluatedAt: d.evaluatedAt.toISOString() })),
          budgets: overview.budgets,
          agentsWithMostFailures: overview.agentsWithMostFailures,
        }}
        policyVersions={policyVersions.map((p) => ({
          id: p.id,
          version: p.version,
          status: p.status,
          comment: p.comment,
          maxRiskLevel: p.maxRiskLevel,
          createdAt: p.createdAt.toISOString(),
          activatedAt: p.activatedAt ? p.activatedAt.toISOString() : null,
          archivedAt: p.archivedAt ? p.archivedAt.toISOString() : null,
          createdBy: p.createdBy,
        }))}
      />
    </div>
  );
}
