import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import { getCampaignStudioCampaign, listCampaignPieces, listProjectMembersForCampaignStudio } from "@/server/services/campaign-studio";
import { requireProjectAccess } from "@/lib/permissions";
import { CampaignWizard } from "@/components/campaign-studio/campaign-wizard";
import { CampaignDetailTabs } from "@/components/campaign-studio/campaign-detail-tabs";
import type { CampaignBriefingInput } from "@/lib/validation/campaign-studio";

export const metadata: Metadata = { title: "Campaña" };

export default async function CampaignStudioDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; campaignId: string }>;
}) {
  const { projectId, campaignId } = await params;
  await requireProjectAccess(projectId, "VIEWER");

  const campaign = await getCampaignStudioCampaign(campaignId);
  if (!campaign || campaign.projectId !== projectId) notFound();

  if (campaign.status === "DRAFT") {
    const initial: CampaignBriefingInput = {
      name: campaign.name,
      description: campaign.description ?? "",
      productOrService: campaign.productOrService ?? "",
      objective: campaign.objective ?? "",
      startDate: campaign.startDate ? campaign.startDate.toISOString().slice(0, 10) : "",
      endDate: campaign.endDate ? campaign.endDate.toISOString().slice(0, 10) : "",
      timezone: campaign.timezone,
      budget: campaign.budget ? Number(campaign.budget) : null,
      brandProfileId: campaign.brandProfileId,
      audience: campaign.audience ?? "",
      audienceLocation: campaign.audienceLocation ?? "",
      audienceAgeRange: campaign.audienceAgeRange ?? "",
      audienceInterests: campaign.audienceInterests,
      audiencePainPoints: campaign.audiencePainPoints,
      audienceNeeds: campaign.audienceNeeds,
      audienceObjections: campaign.audienceObjections,
      audienceAwareness: campaign.audienceAwareness ?? "",
      valueProposition: campaign.valueProposition ?? "",
      mainMessage: campaign.mainMessage ?? "",
      offer: campaign.offer ?? "",
      primaryCTA: campaign.primaryCTA ?? "",
      tone: campaign.tone ?? "",
      forbiddenWords: campaign.forbiddenWords,
      differentiators: campaign.differentiators,
      channels: campaign.channels,
      contentCount: campaign.contentCount,
      frequencyPerWeek: campaign.frequencyPerWeek,
      preferredDays: campaign.preferredDays,
      preferredHours: campaign.preferredHours,
      desiredFormats: campaign.desiredFormats,
    };

    return (
      <div className="space-y-4">
        <Breadcrumbs projectId={projectId} campaignName={campaign.name} />
        <CampaignWizard projectId={projectId} campaignId={campaignId} initial={initial} />
      </div>
    );
  }

  const [pieces, members] = await Promise.all([
    listCampaignPieces(campaignId),
    listProjectMembersForCampaignStudio(projectId),
  ]);

  return (
    <div className="space-y-4">
      <Breadcrumbs projectId={projectId} campaignName={campaign.name} />
      <CampaignDetailTabs
        projectId={projectId}
        campaign={{
          id: campaign.id,
          name: campaign.name,
          description: campaign.description,
          status: campaign.status,
          objective: campaign.objective,
          audience: campaign.audience,
          startDate: campaign.startDate ? campaign.startDate.toISOString() : null,
          endDate: campaign.endDate ? campaign.endDate.toISOString() : null,
          timezone: campaign.timezone,
          channels: campaign.channels,
          brandProfileId: campaign.brandProfileId,
          brandProfileName: campaign.brandProfile?.name ?? null,
          valueProposition: campaign.valueProposition,
          mainMessage: campaign.mainMessage,
          offer: campaign.offer,
          primaryCTA: campaign.primaryCTA,
          tone: campaign.tone,
          forbiddenWords: campaign.forbiddenWords,
          differentiators: campaign.differentiators,
          audienceLocation: campaign.audienceLocation,
          audienceAgeRange: campaign.audienceAgeRange,
          audienceInterests: campaign.audienceInterests,
          audiencePainPoints: campaign.audiencePainPoints,
          audienceNeeds: campaign.audienceNeeds,
          audienceObjections: campaign.audienceObjections,
          audienceAwareness: campaign.audienceAwareness,
          contentCount: campaign.contentCount,
          frequencyPerWeek: campaign.frequencyPerWeek,
          preferredDays: campaign.preferredDays,
          preferredHours: campaign.preferredHours,
          desiredFormats: campaign.desiredFormats,
        }}
        strategy={campaign.strategy}
        pillars={campaign.pillars}
        metricGoals={campaign.metricGoals.map((g) => ({
          id: g.id,
          metricType: g.metricType,
          targetValue: Number(g.targetValue),
          currentValue: Number(g.currentValue),
          updatedAt: g.updatedAt.toISOString(),
        }))}
        pieces={pieces.map((p) => ({
          ...p,
          scheduledDate: p.scheduledDate ? p.scheduledDate.toISOString() : null,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
        }))}
        members={members}
        ownerName={campaign.owner.name || campaign.owner.email}
      />
    </div>
  );
}

function Breadcrumbs({ projectId, campaignName }: { projectId: string; campaignName: string }) {
  return (
    <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Link href={`/dashboard/${projectId}/campaign-studio`} className="hover:text-foreground hover:underline">
        Campaign Studio
      </Link>
      <ChevronRight className="size-3.5" />
      <span className="text-foreground">{campaignName}</span>
    </nav>
  );
}
