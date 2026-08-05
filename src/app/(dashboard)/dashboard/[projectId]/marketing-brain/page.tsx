import type { Metadata } from "next";
import Link from "next/link";
import { BrainCircuit, LineChart } from "lucide-react";
import { requireProjectAccess } from "@/lib/permissions";
import { listMarketingBrainRunsAction } from "@/server/actions/marketing-brain-select";
import { listProjectMembersForCampaignStudio } from "@/server/services/campaign-studio";
import { NewRunButton } from "@/components/marketing-brain/new-run-button";
import { MarketingBrainHub } from "@/components/marketing-brain/marketing-brain-hub";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MarketingBrainRunListItem } from "@/components/marketing-brain/types";

export const metadata: Metadata = { title: "AI Marketing Brain" };

export default async function MarketingBrainPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireProjectAccess(projectId, "VIEWER");

  const [runs, members] = await Promise.all([listMarketingBrainRunsAction(projectId), listProjectMembersForCampaignStudio(projectId)]);

  const items: MarketingBrainRunListItem[] = runs.map((r) => ({
    id: r.id,
    status: r.status,
    progressPercent: r.progressPercent,
    createdAt: r.createdAt.toISOString(),
    startedAt: r.startedAt ? r.startedAt.toISOString() : null,
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    createdBy: r.createdBy,
    campaign: r.campaign,
    briefing: r.briefing as MarketingBrainRunListItem["briefing"],
    stepCount: r._count.steps,
    resourceCount: r._count.resources,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <BrainCircuit className="size-6" /> AI Marketing Brain
          </h1>
          <p className="text-sm text-muted-foreground">
            Convierte un briefing en un plan de marketing completo: campaña, estrategia, pilares, contenido y publicaciones.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/dashboard/${projectId}/marketing-brain/optimization`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            <LineChart className="size-3.5" /> Optimización basada en rendimiento
          </Link>
          <NewRunButton projectId={projectId} />
        </div>
      </div>

      <MarketingBrainHub projectId={projectId} runs={items} currentUserId={user.id} members={members} />
    </div>
  );
}
