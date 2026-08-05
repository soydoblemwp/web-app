import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireProjectAccess } from "@/lib/permissions";
import { getExperimentDetailAction } from "@/server/actions/performance-experiments";
import { ExperimentDetailView } from "@/components/performance/experiment-detail-view";

export const metadata: Metadata = { title: "Detalle de experimento" };

export default async function ExperimentDetailPage({ params }: { params: Promise<{ projectId: string; experimentId: string }> }) {
  const { projectId, experimentId } = await params;
  await requireProjectAccess(projectId, "VIEWER");

  const experiment = await getExperimentDetailAction(projectId, experimentId);
  if (!experiment) notFound();

  return (
    <div className="space-y-6">
      <Link href={`/dashboard/${projectId}/performance/experiments`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Volver a experimentos
      </Link>

      <ExperimentDetailView
        projectId={projectId}
        experimentId={experiment.id}
        name={experiment.name}
        hypothesis={experiment.hypothesis}
        status={experiment.status}
        primaryMetricKey={experiment.primaryMetricKey}
        conclusion={experiment.conclusion}
        winnerVariantId={experiment.winnerVariantId}
        variants={experiment.variants.map((v) => ({
          id: v.id,
          label: v.label,
          isControl: v.isControl,
          status: v.status,
          text: v.text,
          agentKeyUsed: v.agentKeyUsed,
          createdByAgentRun: v.createdByAgentRun,
        }))}
      />
    </div>
  );
}
