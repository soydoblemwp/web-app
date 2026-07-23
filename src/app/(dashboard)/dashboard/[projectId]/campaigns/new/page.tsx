import type { Metadata } from "next";
import { CreateCampaignForm } from "@/components/campaigns/create-campaign-form";

export const metadata: Metadata = { title: "Nueva campaña" };

export default async function NewCampaignPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nueva campaña</h1>
        <p className="text-sm text-muted-foreground">Define el marco general antes de añadir contenido y publicaciones.</p>
      </div>
      <CreateCampaignForm projectId={projectId} />
    </div>
  );
}
