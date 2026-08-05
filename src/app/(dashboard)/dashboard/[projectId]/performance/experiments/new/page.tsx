import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireProjectAccess } from "@/lib/permissions";
import { listContentItemsForSelectAction, listCampaignsForSelectAction } from "@/server/actions/performance-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExperimentCreateForm } from "@/components/performance/experiment-create-form";

export const metadata: Metadata = { title: "Nuevo experimento" };

export default async function NewExperimentPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectAccess(projectId, "EDITOR");

  const [items, campaigns] = await Promise.all([listContentItemsForSelectAction(projectId), listCampaignsForSelectAction(projectId)]);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/dashboard/${projectId}/performance/experiments`} className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Volver a experimentos
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Nuevo experimento</h1>
        <p className="text-sm text-muted-foreground">Se crea en borrador — luego podrás añadir variantes y activarlo cuando tenga al menos un control y una variante.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detalles del experimento</CardTitle>
        </CardHeader>
        <CardContent>
          <ExperimentCreateForm
            projectId={projectId}
            contentItems={items.map((i) => ({ id: i.id, label: i.title }))}
            campaigns={campaigns.map((c) => ({ id: c.id, label: c.name }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
