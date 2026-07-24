import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import { setAutomationActiveAction, setMonitorActiveAction } from "@/server/actions/admin";
import { StatusBadge } from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Administración · Automatizaciones y monitoreo" };

const MINUTE_MS = 60_000;
const ADMIN_LIST_LIMIT = 50;

export default async function AdminOperationsPage() {
  const [automations, monitors] = await Promise.all([
    prisma.automation.findMany({
      orderBy: { createdAt: "desc" },
      take: ADMIN_LIST_LIMIT,
      select: {
        id: true,
        name: true,
        triggerType: true,
        isActive: true,
        project: { select: { name: true } },
        runs: { orderBy: { startedAt: "desc" }, take: 1, select: { status: true, startedAt: true, message: true } },
      },
    }),
    prisma.monitor.findMany({
      orderBy: { createdAt: "desc" },
      take: ADMIN_LIST_LIMIT,
      select: {
        id: true,
        name: true,
        url: true,
        isActive: true,
        lastStatus: true,
        lastCheckedAt: true,
        checkFrequencyMinutes: true,
        project: { select: { name: true } },
        changes: { orderBy: { detectedAt: "desc" }, take: 1, select: { detectedAt: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Automatizaciones y monitoreo</h1>
        <p className="text-sm text-muted-foreground">
          Automatizaciones deterministas de cuentas registradas — sin IA de pago ni generación remota desde cron.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Automatizaciones</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Nombre</th>
                <th className="px-4 py-2 font-medium">Proyecto</th>
                <th className="px-4 py-2 font-medium">Tipo</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium">Última ejecución</th>
                <th className="px-4 py-2 font-medium">Errores recientes</th>
                <th className="px-4 py-2 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {automations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No hay automatizaciones registradas.
                  </td>
                </tr>
              ) : (
                automations.map((automation) => {
                  const lastRun = automation.runs[0];
                  return (
                    <tr key={automation.id}>
                      <td className="px-4 py-2 font-medium">{automation.name}</td>
                      <td className="px-4 py-2 text-muted-foreground">{automation.project.name}</td>
                      <td className="px-4 py-2 text-muted-foreground">{automation.triggerType}</td>
                      <td className="px-4 py-2">
                        <Badge variant={automation.isActive ? "secondary" : "outline"}>
                          {automation.isActive ? "Activa" : "Inactiva"}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {lastRun ? lastRun.startedAt.toLocaleString("es-ES") : "Nunca"}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {lastRun?.status === "FAILED" ? lastRun.message || "Fallo sin detalles" : "—"}
                      </td>
                      <td className="px-4 py-2">
                        <form action={setAutomationActiveAction.bind(null, automation.id, !automation.isActive)}>
                          <Button type="submit" size="sm" variant="outline">
                            {automation.isActive ? "Desactivar" : "Activar"}
                          </Button>
                        </form>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Monitores</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Nombre</th>
                <th className="px-4 py-2 font-medium">Proyecto</th>
                <th className="px-4 py-2 font-medium">URL</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium">Última comprobación</th>
                <th className="px-4 py-2 font-medium">Último cambio</th>
                <th className="px-4 py-2 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {monitors.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No hay monitores registrados.
                  </td>
                </tr>
              ) : (
                monitors.map((monitor) => {
                  const nextCheckEstimate = monitor.lastCheckedAt
                    ? new Date(monitor.lastCheckedAt.getTime() + monitor.checkFrequencyMinutes * MINUTE_MS)
                    : null;
                  return (
                    <tr key={monitor.id}>
                      <td className="px-4 py-2 font-medium">{monitor.name}</td>
                      <td className="px-4 py-2 text-muted-foreground">{monitor.project.name}</td>
                      <td className="px-4 py-2 max-w-48 truncate text-muted-foreground">{monitor.url}</td>
                      <td className="px-4 py-2">
                        <StatusBadge status={monitor.lastStatus} />
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {monitor.lastCheckedAt ? monitor.lastCheckedAt.toLocaleString("es-ES") : "Nunca"}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {monitor.changes[0]?.detectedAt.toLocaleString("es-ES") ?? "—"}
                        {nextCheckEstimate ? (
                          <p className="text-xs">Próxima estimada: {nextCheckEstimate.toLocaleString("es-ES")}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-2">
                        <form action={setMonitorActiveAction.bind(null, monitor.id, !monitor.isActive)}>
                          <Button type="submit" size="sm" variant="outline">
                            {monitor.isActive ? "Pausar" : "Reactivar"}
                          </Button>
                        </form>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
