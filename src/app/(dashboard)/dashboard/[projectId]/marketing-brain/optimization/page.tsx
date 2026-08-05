import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BrainCircuit } from "lucide-react";
import { requireProjectAccess } from "@/lib/permissions";
import { listOptimizationSessionsAction } from "@/server/actions/marketing-brain-optimization";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Marketing Brain — Optimización" };

const STATUS_LABELS: Record<string, string> = { DRAFT: "Borrador", READY_FOR_REVIEW: "Lista para revisión", APPROVED: "Aprobada", REJECTED: "Rechazada", ARCHIVED: "Archivada" };
const STATUS_TONE: Record<string, "outline" | "secondary" | "destructive"> = { DRAFT: "outline", READY_FOR_REVIEW: "secondary", APPROVED: "secondary", REJECTED: "destructive", ARCHIVED: "outline" };

export default async function MarketingBrainOptimizationListPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectAccess(projectId, "VIEWER");

  const sessions = await listOptimizationSessionsAction(projectId);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/dashboard/${projectId}/marketing-brain`} className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Volver a Marketing Brain
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <BrainCircuit className="size-6" /> Optimización basada en rendimiento
        </h1>
        <p className="text-sm text-muted-foreground">Sesiones que analizan datos reales de Performance Center para proponer estrategias — la aprobación es siempre humana.</p>
      </div>

      {sessions.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="max-w-md text-sm text-muted-foreground">
              Todavía no hay sesiones de optimización. Ábrelas desde la pestaña &quot;Contexto de rendimiento&quot; del asistente de Marketing Brain, o desde Performance Center.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <Link key={s.id} href={`/dashboard/${projectId}/marketing-brain/optimization/${s.id}`}>
              <Card className="transition-colors hover:bg-accent/50">
                <CardContent className="flex items-center justify-between gap-3 py-4">
                  <div>
                    <p className="font-medium">{s.campaign?.name ?? "Sin campaña asociada"}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.contextMode} · {s.scenarios.length} escenario(s)
                    </p>
                  </div>
                  <Badge variant={STATUS_TONE[s.status] ?? "outline"}>{STATUS_LABELS[s.status] ?? s.status}</Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
