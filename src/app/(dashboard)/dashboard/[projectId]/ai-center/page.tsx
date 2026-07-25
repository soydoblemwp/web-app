import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/permissions";
import { listFavoriteToolSlugs, listRecentToolSlugs } from "@/server/services/ai-center";
import { AiCenterHub } from "@/components/ai-center/ai-center-hub";

export const metadata: Metadata = { title: "AI Center" };

export default async function AiCenterPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await getCurrentUser();

  const [favoriteSlugs, recentSlugs] = user
    ? await Promise.all([listFavoriteToolSlugs(user.id), listRecentToolSlugs(user.id)])
    : [[], []];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI Center</h1>
        <p className="text-sm text-muted-foreground">
          Todas las herramientas de IA del proyecto, organizadas por categoría.
        </p>
      </div>
      <AiCenterHub projectId={projectId} favoriteSlugs={favoriteSlugs} recentSlugs={recentSlugs} />
    </div>
  );
}
