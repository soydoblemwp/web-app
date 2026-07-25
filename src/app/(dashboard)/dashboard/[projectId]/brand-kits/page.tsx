import type { Metadata } from "next";
import { requireProjectAccess } from "@/lib/permissions";
import { listBrandProfilesForUser } from "@/server/services/brand-profiles";
import { BrandProfileHub } from "@/components/brand-profiles/brand-profile-hub";

export const metadata: Metadata = { title: "Brand Kits" };

export default async function BrandKitsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireProjectAccess(projectId, "VIEWER");

  const profiles = await listBrandProfilesForUser(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Brand Kits</h1>
        <p className="text-sm text-muted-foreground">
          Crea uno o varios perfiles de marca y reutilízalos automáticamente en cualquier herramienta de IA. El que
          marques como predeterminado se aplica cuando no eliges ninguno explícitamente.
        </p>
      </div>
      <BrandProfileHub projectId={projectId} profiles={profiles} />
    </div>
  );
}
