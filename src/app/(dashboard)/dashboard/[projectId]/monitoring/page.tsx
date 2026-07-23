import type { Metadata } from "next";
import { Radar } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { runMonitorNowAction, toggleMonitorActiveAction, deleteMonitorAction } from "@/server/actions/monitor";
import { CreateMonitorForm } from "@/components/monitoring/create-monitor-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Monitoreo" };

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  OK: "secondary",
  CHANGED: "default",
  ERROR: "destructive",
  UNKNOWN: "outline",
};

export default async function MonitoringPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const monitors = await prisma.monitor.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    include: { runs: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Monitoreo de páginas</h1>
        <p className="text-sm text-muted-foreground">
          Revisa cambios de título, descripción y disponibilidad de tus URLs. Todas las comprobaciones pasan por
          protección contra SSRF (bloqueo de IPs privadas y de esquemas no http/https).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nuevo monitor</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateMonitorForm projectId={projectId} />
        </CardContent>
      </Card>

      {monitors.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Radar className="size-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No hay monitores configurados.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {monitors.map((monitor) => {
            const lastRun = monitor.runs[0];
            return (
              <Card key={monitor.id}>
                <CardContent className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{monitor.name}</p>
                      <Badge variant={STATUS_VARIANT[monitor.lastStatus]}>{monitor.lastStatus}</Badge>
                      {!monitor.isActive ? <Badge variant="outline">Pausado</Badge> : null}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{monitor.url}</p>
                    <p className="text-xs text-muted-foreground">
                      Última comprobación:{" "}
                      {monitor.lastCheckedAt ? monitor.lastCheckedAt.toLocaleString("es-ES") : "nunca"}
                      {lastRun?.errorMessage ? ` · ${lastRun.errorMessage}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <form action={runMonitorNowAction.bind(null, projectId, monitor.id)}>
                      <Button type="submit" size="sm" variant="outline">
                        Comprobar ahora
                      </Button>
                    </form>
                    <form action={toggleMonitorActiveAction.bind(null, projectId, monitor.id, !monitor.isActive)}>
                      <Button type="submit" size="sm" variant="outline">
                        {monitor.isActive ? "Pausar" : "Reactivar"}
                      </Button>
                    </form>
                    <form action={deleteMonitorAction.bind(null, projectId, monitor.id)}>
                      <Button type="submit" size="sm" variant="ghost">
                        Eliminar
                      </Button>
                    </form>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
