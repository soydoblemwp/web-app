import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Lightbulb } from "lucide-react";
import { requireProjectAccess } from "@/lib/permissions";
import { listRecommendationsAction } from "@/server/actions/performance-recommendations";
import { RecommendationsListView } from "@/components/performance/recommendations-list-view";

export const metadata: Metadata = { title: "Performance — Recomendaciones" };

export default async function PerformanceRecommendationsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectAccess(projectId, "VIEWER");

  const recommendations = await listRecommendationsAction(projectId, { limit: 200 });

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/dashboard/${projectId}/performance`} className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Volver al hub de Performance
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Lightbulb className="size-6" /> Recomendaciones
        </h1>
        <p className="text-sm text-muted-foreground">Generadas por reglas deterministas a partir de datos reales — cada una es una hipótesis accionable, nunca una certeza automática.</p>
      </div>

      <RecommendationsListView
        projectId={projectId}
        initialRecommendations={recommendations.map((r) => ({
          id: r.id,
          title: r.title,
          description: r.description,
          category: r.category,
          priority: r.priority,
          status: r.status,
          confidence: Number(r.confidence),
          rationale: r.rationale,
          actionProposed: r.actionProposed,
          contentItem: r.contentItem,
          campaign: r.campaign,
          socialPost: r.socialPost,
        }))}
      />
    </div>
  );
}
