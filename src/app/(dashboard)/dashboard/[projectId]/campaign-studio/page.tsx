import type { Metadata } from "next";
import { Rocket } from "lucide-react";
import { listCampaignStudioCampaigns } from "@/server/services/campaign-studio";
import { requireProjectAccess } from "@/lib/permissions";
import { NewCampaignMenu } from "@/components/campaign-studio/new-campaign-menu";
import { CampaignStudioFilters } from "@/components/campaign-studio/campaign-studio-filters";
import { CampaignStudioBrowser, type CampaignStudioCardData } from "@/components/campaign-studio/campaign-studio-browser";
import { campaignChannelLabel } from "@/lib/campaign-studio/channels";

export const metadata: Metadata = { title: "Campaign Studio" };

export default async function CampaignStudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ status?: string; search?: string }>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  await requireProjectAccess(projectId, "VIEWER");

  const campaigns = await listCampaignStudioCampaigns(projectId, { status: query.status, search: query.search });

  const cards: CampaignStudioCardData[] = campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    status: c.status,
    startDate: c.startDate ? c.startDate.toISOString() : null,
    endDate: c.endDate ? c.endDate.toISOString() : null,
    channels: c.channels.map(campaignChannelLabel),
    brandProfileName: c.brandProfile?.name ?? null,
    pieceCount: c._count.pieces,
    pillarCount: c._count.pillars,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Rocket className="size-6" /> Campaign Studio
          </h1>
          <p className="text-sm text-muted-foreground">
            De un briefing a una campaña completa: estrategia, pilares, calendario y contenido para varias plataformas.
          </p>
        </div>
        <NewCampaignMenu projectId={projectId} existingCampaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))} />
      </div>

      <CampaignStudioFilters />

      <CampaignStudioBrowser projectId={projectId} campaigns={cards} />
    </div>
  );
}
