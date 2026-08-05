import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireProjectAccess } from "@/lib/permissions";
import { listSocialPostsForSelectAction } from "@/server/actions/performance-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ResourceComparisonView } from "@/components/performance/resource-comparison-view";
import { ManualMetricForm } from "@/components/performance/manual-metric-form";

export const metadata: Metadata = { title: "Performance — Publicaciones" };

export default async function PerformanceSocialPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectAccess(projectId, "VIEWER");

  const posts = await listSocialPostsForSelectAction(projectId);
  const resourceOptions = posts.map((p) => ({ id: p.id, label: `${p.platform} — ${p.internalTitle || p.text.slice(0, 40) || "(sin título)"}` }));

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/dashboard/${projectId}/performance`} className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Volver al hub de Performance
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Comparar publicaciones</h1>
        <p className="text-sm text-muted-foreground">Compara publicaciones sociales por plataforma y métricas registradas — nunca se asume una publicación medida sin datos reales.</p>
      </div>

      <ResourceComparisonView projectId={projectId} resourceKind="SOCIAL_POST" resourceOptions={resourceOptions} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registrar una métrica manual</CardTitle>
        </CardHeader>
        <CardContent>
          <ManualMetricForm projectId={projectId} resourceType="SOCIAL_POST" resourceOptions={resourceOptions} />
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Link href={`/dashboard/${projectId}/performance/experiments/new`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Crear experimento a partir de estas publicaciones
        </Link>
        <Link href={`/dashboard/${projectId}/performance/imports`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Importar métricas desde archivo
        </Link>
      </div>
    </div>
  );
}
