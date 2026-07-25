import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireProjectAccess } from "@/lib/permissions";
import { listWorkflowsForUser } from "@/server/services/ai-workflows";
import { WorkflowAnalyticsDashboard } from "@/components/ai-workflows/analytics/workflow-analytics-dashboard";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "AI Workflows — Analytics" };

/**
 * "Analytics" — a view within AI Workflows (not a new AI Center category),
 * combining a global dashboard with per-workflow detail via the workflow
 * filter. Server Component only fetches the lightweight id/name list needed
 * for the filter dropdown; every metric is fetched client-side through the
 * ownership-scoped actions in src/server/actions/workflow-analytics.ts.
 */
export default async function AiWorkflowsAnalyticsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireProjectAccess(projectId, "VIEWER");

  const workflows = await listWorkflowsForUser(user.id, projectId);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link href={`/dashboard/${projectId}/ai-workflows`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2")}>
          <ArrowLeft className="size-3.5" /> Volver a AI Workflows
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">AI Workflows — Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Ejecuciones, tasas de éxito, duración, uso de IA y errores — calculado en servidor a partir de tus propias
          ejecuciones reales, aisladas por usuario y proyecto.
        </p>
      </div>
      <WorkflowAnalyticsDashboard projectId={projectId} workflows={workflows.map((w) => ({ id: w.id, name: w.name }))} />
    </div>
  );
}
