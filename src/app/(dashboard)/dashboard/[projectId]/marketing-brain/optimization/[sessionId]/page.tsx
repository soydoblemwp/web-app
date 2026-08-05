import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireProjectAccess } from "@/lib/permissions";
import { getOptimizationSessionDetailAction } from "@/server/actions/marketing-brain-optimization";
import { listContentItemsForSelectAction, listCampaignsForSelectAction, listSocialPostsForSelectAction } from "@/server/actions/performance-select";
import { listGoalsAction } from "@/server/actions/performance-goals";
import { OptimizationSessionView } from "@/components/marketing-brain/optimization-session-view";

export const metadata: Metadata = { title: "Sesión de optimización" };

export default async function OptimizationSessionPage({ params }: { params: Promise<{ projectId: string; sessionId: string }> }) {
  const { projectId, sessionId } = await params;
  await requireProjectAccess(projectId, "VIEWER");

  const session = await getOptimizationSessionDetailAction(projectId, sessionId);
  if (!session) notFound();

  const [contentItems, campaigns, socialPosts, goals] = await Promise.all([
    listContentItemsForSelectAction(projectId),
    listCampaignsForSelectAction(projectId),
    listSocialPostsForSelectAction(projectId),
    listGoalsAction(projectId, { status: "ACTIVE" }),
  ]);

  const snapshot = session.contextSnapshot
    ? {
        periodStart: session.contextSnapshot.periodStart.toISOString(),
        periodEnd: session.contextSnapshot.periodEnd.toISOString(),
        dataQualityScore: session.contextSnapshot.dataQualityScore,
        dataQualityLevel: session.contextSnapshot.dataQualityLevel,
        evidenceStrength: session.contextSnapshot.evidenceStrength,
        facts: session.contextSnapshot.facts as unknown as { metrics: { key: string; label: string; value: number; unit?: string; origin: string; sampleSize?: number }[] },
        missingData: session.contextSnapshot.missingData as unknown as string[],
        constraints: session.contextSnapshot.constraints as unknown as string[],
      }
    : null;

  return (
    <div className="space-y-6">
      <Link href={`/dashboard/${projectId}/marketing-brain/optimization`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Volver a sesiones de optimización
      </Link>

      <OptimizationSessionView
        projectId={projectId}
        sessionId={session.id}
        status={session.status}
        contextMode={session.contextMode}
        campaignId={session.campaignId}
        lastErrorMessage={session.lastErrorMessage}
        snapshot={snapshot}
        brief={session.strategyBrief as never}
        scenarios={session.scenarios.map((s) => ({
          id: s.id,
          kind: s.kind,
          objective: s.objective,
          intensity: s.intensity,
          timeframe: s.timeframe,
          measurementMethod: s.measurementMethod,
          risks: s.risks,
          kpis: s.kpis,
          preconditions: s.preconditions,
          constraints: s.constraints,
          resourcesRequired: s.resourcesRequired,
          selected: s.selected,
          actions: s.actions.map((a) => ({
            id: a.id,
            order: a.order,
            title: a.title,
            description: a.description,
            channel: a.channel,
            actionType: a.actionType,
            convertedAt: a.convertedAt ? a.convertedAt.toISOString() : null,
            createdResourceId: a.campaignContentPieceId ?? a.contentItemId ?? a.socialPostId ?? a.agentRunId ?? a.knowledgeQueryId ?? null,
          })),
        }))}
        measurementPlans={session.measurementPlans.map((p) => ({
          id: p.id,
          primaryMetricKey: p.primaryMetricKey,
          status: p.status,
          trackingStart: p.trackingStart.toISOString(),
          trackingEnd: p.trackingEnd.toISOString(),
          baselineValue: p.baselineValue !== null ? Number(p.baselineValue) : null,
          baselineQuality: p.baselineQuality,
          reviews: p.reviews.map((r) => ({
            id: r.id,
            initialValue: r.initialValue !== null ? Number(r.initialValue) : null,
            currentValue: r.currentValue !== null ? Number(r.currentValue) : null,
            percentDiff: r.percentDiff !== null ? Number(r.percentDiff) : null,
            initialQuality: r.initialQuality,
            currentQuality: r.currentQuality,
            goalOutcome: r.goalOutcome,
            causalityStatement: r.causalityStatement,
            limitations: r.limitations,
            conclusion: r.conclusion,
            generatedAt: r.generatedAt.toISOString(),
          })),
        }))}
        contentItems={contentItems.map((i) => ({ id: i.id, label: i.title }))}
        campaigns={campaigns.map((c) => ({ id: c.id, label: c.name }))}
        socialPosts={socialPosts.map((p) => ({ id: p.id, label: `${p.platform} — ${p.internalTitle || p.text.slice(0, 30)}` }))}
        goals={goals.map((g) => ({ id: g.id, metricKey: g.metricKey }))}
      />
    </div>
  );
}
