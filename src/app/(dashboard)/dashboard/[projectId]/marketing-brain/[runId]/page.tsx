import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import { requireProjectAccess } from "@/lib/permissions";
import { getMarketingBrainRunDetailAction } from "@/server/actions/marketing-brain-select";
import { listProjectMembersForCampaignStudio } from "@/server/services/campaign-studio";
import { listCampaignsForSelectAction } from "@/server/actions/campaign";
import { listBrandProfilesForSelectAction } from "@/server/actions/brand-profiles";
import { BriefingWizard } from "@/components/marketing-brain/briefing-wizard";
import { PlanConfirmation } from "@/components/marketing-brain/plan-confirmation";
import { RunExecutionPanel } from "@/components/marketing-brain/run-execution-panel";
import type { MarketingBrainRunDetailData } from "@/components/marketing-brain/types";

export const metadata: Metadata = { title: "Plan de Marketing Brain" };

export default async function MarketingBrainRunPage({ params }: { params: Promise<{ projectId: string; runId: string }> }) {
  const { projectId, runId } = await params;
  await requireProjectAccess(projectId, "VIEWER");

  const run = await getMarketingBrainRunDetailAction(projectId, runId);
  if (!run) notFound();

  const [members, campaigns, brandProfiles] = await Promise.all([
    listProjectMembersForCampaignStudio(projectId),
    listCampaignsForSelectAction(projectId),
    listBrandProfilesForSelectAction(projectId),
  ]);

  const detail: MarketingBrainRunDetailData = {
    id: run.id,
    projectId: run.projectId,
    status: run.status,
    currentStepKey: run.currentStepKey,
    progressPercent: run.progressPercent,
    briefing: run.briefing as MarketingBrainRunDetailData["briefing"],
    approvedBriefing: run.approvedBriefing as MarketingBrainRunDetailData["approvedBriefing"],
    stagesConfig: run.stagesConfig as MarketingBrainRunDetailData["stagesConfig"],
    campaign: run.campaign,
    createdBy: run.createdBy,
    lastErrorMessage: run.lastErrorMessage,
    createdAt: run.createdAt.toISOString(),
    startedAt: run.startedAt ? run.startedAt.toISOString() : null,
    completedAt: run.completedAt ? run.completedAt.toISOString() : null,
    cancelledAt: run.cancelledAt ? run.cancelledAt.toISOString() : null,
    steps: run.steps.map((s) => ({
      id: s.id,
      key: s.key,
      status: s.status,
      order: s.order,
      output: s.output as Record<string, unknown> | null,
      errorMessage: s.errorMessage,
      errorCategory: s.errorCategory,
      attemptCount: s.attemptCount,
      startedAt: s.startedAt ? s.startedAt.toISOString() : null,
      completedAt: s.completedAt ? s.completedAt.toISOString() : null,
    })),
    resources: run.resources.map((r) => ({
      id: r.id,
      type: r.type,
      action: r.action,
      createdAt: r.createdAt.toISOString(),
      campaign: r.campaign,
      pillar: r.pillar,
      piece: r.piece,
      contentItem: r.contentItem,
      socialPost: r.socialPost,
    })),
    approvals: run.approvals.map((a) => ({
      stepKey: a.stepKey,
      status: a.status,
      comment: a.comment,
      decidedAt: a.decidedAt ? a.decidedAt.toISOString() : null,
      decidedBy: a.decidedBy,
    })),
  };

  const approvedBriefing = (run.approvedBriefing ?? run.briefing) as MarketingBrainRunDetailData["briefing"];
  const title = run.campaign?.name || approvedBriefing.productOrService || approvedBriefing.objective || "Plan de Marketing Brain";

  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link href={`/dashboard/${projectId}/marketing-brain`} className="hover:text-foreground hover:underline">
          AI Marketing Brain
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="truncate text-foreground">{title}</span>
      </nav>

      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>

      {detail.status === "DRAFT" ? (
        <BriefingWizard projectId={projectId} run={detail} members={members} campaigns={campaigns} brandProfiles={brandProfiles} />
      ) : detail.status === "READY" ? (
        <PlanConfirmation projectId={projectId} run={detail} />
      ) : (
        <RunExecutionPanel projectId={projectId} run={detail} />
      )}
    </div>
  );
}
