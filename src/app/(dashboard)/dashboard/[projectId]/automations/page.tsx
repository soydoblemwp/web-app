import type { Metadata } from "next";
import { Workflow } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { runAutomationNowAction, toggleAutomationActiveAction, deleteAutomationAction } from "@/server/actions/automation";
import { CreateAutomationForm } from "@/components/automations/create-automation-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Automatizaciones" };

export default async function AutomationsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [automations, monitors] = await Promise.all([
    prisma.automation.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      include: { actions: true, runs: { orderBy: { startedAt: "desc" }, take: 1 } },
    }),
    prisma.monitor.findMany({ where: { projectId }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Automatizaciones</h1>
        <p className="text-sm text-muted-foreground">
          Disparador, acción e historial de ejecuciones. Las automatizaciones con programación diaria o semanal se
          ejecutan mediante una tarea programada (Vercel Cron) cuando el proyecto está desplegado.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nueva automatización</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateAutomationForm projectId={projectId} monitors={monitors} />
        </CardContent>
      </Card>

      {automations.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Workflow className="size-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No hay automatizaciones configuradas.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {automations.map((automation) => {
            const lastRun = automation.runs[0];
            return (
              <Card key={automation.id}>
                <CardContent className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{automation.name}</p>
                      <Badge variant="outline">{automation.triggerType}</Badge>
                      {!automation.isActive ? <Badge variant="secondary">Pausada</Badge> : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {automation.actions.map((a) => a.actionType).join(", ")}
                    </p>
                    {lastRun ? (
                      <p className="text-xs text-muted-foreground">
                        Última ejecución: {lastRun.startedAt.toLocaleString("es-ES")} · {lastRun.status}
                        {lastRun.message ? ` · ${lastRun.message}` : ""}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Sin ejecuciones todavía.</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <form action={runAutomationNowAction.bind(null, projectId, automation.id)}>
                      <Button type="submit" size="sm" variant="outline">
                        Ejecutar ahora
                      </Button>
                    </form>
                    <form action={toggleAutomationActiveAction.bind(null, projectId, automation.id, !automation.isActive)}>
                      <Button type="submit" size="sm" variant="outline">
                        {automation.isActive ? "Pausar" : "Reactivar"}
                      </Button>
                    </form>
                    <form action={deleteAutomationAction.bind(null, projectId, automation.id)}>
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
