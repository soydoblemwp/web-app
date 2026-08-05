import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FlaskConical, Plus } from "lucide-react";
import { requireProjectAccess } from "@/lib/permissions";
import { listExperimentsAction } from "@/server/actions/performance-experiments";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EXPERIMENT_STATUS_LABELS, EXPERIMENT_STATUS_TONE } from "@/components/performance/labels";

export const metadata: Metadata = { title: "Performance — Experimentos" };

export default async function PerformanceExperimentsListPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectAccess(projectId, "VIEWER");

  const experiments = await listExperimentsAction(projectId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/dashboard/${projectId}/performance`} className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" /> Volver al hub de Performance
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <FlaskConical className="size-6" /> Experimentos
          </h1>
          <p className="text-sm text-muted-foreground">Pruebas internas de título, hook, CTA, formato y más — nunca presentadas como A/B tests externos controlados por una plataforma real.</p>
        </div>
        <Link href={`/dashboard/${projectId}/performance/experiments/new`} className={cn(buttonVariants({ size: "sm" }))}>
          <Plus className="size-3.5" /> Nuevo experimento
        </Link>
      </div>

      {experiments.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <FlaskConical className="size-10 text-muted-foreground" />
            <p className="max-w-md text-sm text-muted-foreground">Todavía no hay experimentos. Crea uno para comparar variantes de título, hook, CTA u otro elemento sobre contenido o publicaciones reales.</p>
            <Link href={`/dashboard/${projectId}/performance/experiments/new`} className={cn(buttonVariants({ size: "sm" }))}>
              Crear el primer experimento
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {experiments.map((e) => (
            <Link key={e.id} href={`/dashboard/${projectId}/performance/experiments/${e.id}`}>
              <Card className="transition-colors hover:bg-accent/50">
                <CardContent className="flex items-center justify-between gap-3 py-4">
                  <div>
                    <p className="font-medium">{e.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.type} · {e.variants.length} variante(s) · métrica primaria: {e.primaryMetricKey}
                    </p>
                  </div>
                  <Badge variant={EXPERIMENT_STATUS_TONE[e.status] ?? "outline"}>{EXPERIMENT_STATUS_LABELS[e.status] ?? e.status}</Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
