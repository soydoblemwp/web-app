import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import { StatusBadge } from "@/components/admin/status-badge";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Administración · Resumen" };

const DAY_MS = 24 * 60 * 60 * 1000;

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

export default async function AdminOverviewPage() {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS);

  const [
    totalUsers,
    activeUsers,
    suspendedUsers,
    newUsers7d,
    newUsers30d,
    totalWorkspaces,
    activeProjects,
    inactiveProjects,
    totalContent,
    totalCampaigns,
    totalSocialPosts,
    totalAutomations,
    totalMonitors,
    connectedIntegrations,
    pendingNotifications,
    recentUsers,
    recentProjectsRaw,
    recentAuditLogs,
    integrationsWithErrors,
    monitorsWithErrors,
    failedAutomationRuns,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isSuspended: false } }),
    prisma.user.count({ where: { isSuspended: true } }),
    prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.workspace.count(),
    prisma.project.count({ where: { status: "ACTIVE" } }),
    prisma.project.count({ where: { status: { in: ["PAUSED", "ARCHIVED"] } } }),
    prisma.contentItem.count({ where: { deletedAt: null } }),
    prisma.campaign.count(),
    prisma.socialPost.count(),
    prisma.automation.count(),
    prisma.monitor.count(),
    prisma.integration.count({ where: { status: "CONNECTED" } }),
    prisma.notification.count({ where: { isRead: false } }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    }),
    prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, name: true, status: true, createdAt: true, ownerId: true },
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        createdAt: true,
        actor: { select: { name: true, email: true } },
      },
    }),
    prisma.integration.findMany({
      where: { status: "ERROR" },
      take: 8,
      select: { id: true, type: true, lastError: true, projectId: true },
    }),
    prisma.monitor.findMany({
      where: { lastStatus: "ERROR" },
      take: 8,
      select: { id: true, name: true, url: true, projectId: true },
    }),
    prisma.automationRun.findMany({
      where: { status: "FAILED" },
      orderBy: { startedAt: "desc" },
      take: 8,
      select: {
        id: true,
        message: true,
        startedAt: true,
        automation: { select: { id: true, name: true, projectId: true } },
      },
    }),
  ]);

  const ownerIds = [...new Set(recentProjectsRaw.map((p) => p.ownerId))];
  const owners = ownerIds.length
    ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true, email: true } })
    : [];
  const ownerById = new Map(owners.map((o) => [o.id, o]));

  const stats: Array<{ label: string; value: number }> = [
    { label: "Usuarios totales", value: totalUsers },
    { label: "Usuarios activos", value: activeUsers },
    { label: "Usuarios suspendidos", value: suspendedUsers },
    { label: "Nuevos (7 días)", value: newUsers7d },
    { label: "Nuevos (30 días)", value: newUsers30d },
    { label: "Espacios de trabajo", value: totalWorkspaces },
    { label: "Proyectos activos", value: activeProjects },
    { label: "Proyectos pausados/archivados", value: inactiveProjects },
    { label: "Elementos de contenido", value: totalContent },
    { label: "Campañas", value: totalCampaigns },
    { label: "Publicaciones sociales", value: totalSocialPosts },
    { label: "Automatizaciones", value: totalAutomations },
    { label: "Monitores", value: totalMonitors },
    { label: "Integraciones conectadas", value: connectedIntegrations },
    { label: "Notificaciones pendientes", value: pendingNotifications },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Resumen</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Estas estadísticas incluyen únicamente cuentas registradas. Los datos del modo invitado se guardan
          localmente en el navegador de cada visitante (IndexedDB) y nunca llegan a este servidor — no aparecen ni
          pueden aparecer aquí.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((stat) => (
          <StatCard key={stat.label} label={stat.label} value={stat.value} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Usuarios registrados recientemente
          </h2>
          {recentUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin usuarios todavía.</p>
          ) : (
            <ul className="space-y-2">
              {recentUsers.map((u) => (
                <li key={u.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                  <Link href={`/admin/users/${u.id}`} className="min-w-0 truncate hover:underline">
                    {u.name || u.email}
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground">{u.createdAt.toLocaleDateString("es-ES")}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Proyectos creados recientemente
          </h2>
          {recentProjectsRaw.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin proyectos todavía.</p>
          ) : (
            <ul className="space-y-2">
              {recentProjectsRaw.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                  <Link href={`/admin/projects/${p.id}`} className="min-w-0 truncate hover:underline">
                    {p.name}
                  </Link>
                  <span className="shrink-0 truncate text-xs text-muted-foreground">
                    {ownerById.get(p.ownerId)?.name || ownerById.get(p.ownerId)?.email || "—"}
                  </span>
                  <StatusBadge status={p.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Actividad administrativa reciente
          </h2>
          {recentAuditLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin actividad todavía.</p>
          ) : (
            <ul className="space-y-2">
              {recentAuditLogs.map((log) => (
                <li key={log.id} className="rounded-lg border px-3 py-2 text-sm">
                  <p>
                    <span className="font-medium">{log.actor?.name || log.actor?.email || "Sistema"}</span> ·{" "}
                    {log.action}
                  </p>
                  <p className="text-xs text-muted-foreground">{log.createdAt.toLocaleString("es-ES")}</p>
                </li>
              ))}
            </ul>
          )}
          <Link href="/admin/audit-log" className="text-xs underline-offset-4 hover:underline">
            Ver registro completo →
          </Link>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Integraciones con errores
          </h2>
          {integrationsWithErrors.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguna integración con errores.</p>
          ) : (
            <ul className="space-y-2">
              {integrationsWithErrors.map((i) => (
                <li key={i.id} className="rounded-lg border px-3 py-2 text-sm">
                  <p className="font-medium">{i.type}</p>
                  <p className="truncate text-xs text-muted-foreground">{i.lastError || "Error desconocido"}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Monitores con fallos
          </h2>
          {monitorsWithErrors.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ningún monitor con errores.</p>
          ) : (
            <ul className="space-y-2">
              {monitorsWithErrors.map((m) => (
                <li key={m.id} className="rounded-lg border px-3 py-2 text-sm">
                  <p className="font-medium">{m.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{m.url}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Automatizaciones con fallos recientes
          </h2>
          {failedAutomationRuns.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguna ejecución fallida reciente.</p>
          ) : (
            <ul className="space-y-2">
              {failedAutomationRuns.map((run) => (
                <li key={run.id} className="rounded-lg border px-3 py-2 text-sm">
                  <p className="font-medium">{run.automation.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{run.message || "Sin detalles"}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
