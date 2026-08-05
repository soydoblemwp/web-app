import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireProjectAccess } from "@/lib/permissions";
import { listContentItemsForSelectAction } from "@/server/actions/performance-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ResourceComparisonView } from "@/components/performance/resource-comparison-view";
import { ManualMetricForm } from "@/components/performance/manual-metric-form";

export const metadata: Metadata = { title: "Performance — Contenido" };

export default async function PerformanceContentPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectAccess(projectId, "VIEWER");

  const items = await listContentItemsForSelectAction(projectId);
  const resourceOptions = items.map((i) => ({ id: i.id, label: i.title }));

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/dashboard/${projectId}/performance`} className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Volver al hub de Performance
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Comparar contenido</h1>
        <p className="text-sm text-muted-foreground">Compara piezas de contenido por métricas internas y registradas — nunca declara una ganadora sin muestra comparable.</p>
      </div>

      <ResourceComparisonView projectId={projectId} resourceKind="CONTENT_ITEM" resourceOptions={resourceOptions} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registrar una métrica manual</CardTitle>
        </CardHeader>
        <CardContent>
          <ManualMetricForm projectId={projectId} resourceType="CONTENT_ITEM" resourceOptions={resourceOptions} />
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Link href={`/dashboard/${projectId}/performance/experiments/new`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Crear experimento a partir de estas piezas
        </Link>
        <Link href={`/dashboard/${projectId}/performance/imports`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Importar métricas desde archivo
        </Link>
      </div>
    </div>
  );
}
