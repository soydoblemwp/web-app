import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/permissions";
import {
  anonymizeUserAction,
  closeUserSessionsAction,
  suspendUserAction,
} from "@/server/actions/admin";
import { UserRoleSelect } from "@/components/admin/user-role-select";
import { StatusBadge } from "@/components/admin/status-badge";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Administración · Detalle de usuario" };

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const currentUser = await getCurrentUser();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    // The password hash column is deliberately absent from this select — this row is rendered directly in the page.
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isSuspended: true,
      createdAt: true,
      updatedAt: true,
      workspaceMemberships: {
        select: { role: true, workspace: { select: { id: true, name: true } } },
        take: 20,
      },
      projectMemberships: {
        select: { role: true, project: { select: { id: true, name: true, status: true } } },
        take: 20,
      },
      campaigns: {
        select: { id: true, name: true, status: true, projectId: true },
        take: 20,
        orderBy: { createdAt: "desc" },
      },
      contentItems: {
        select: { id: true, title: true, type: true, status: true, projectId: true, createdAt: true },
        take: 20,
        orderBy: { createdAt: "desc" },
      },
      notifications: {
        select: { id: true, type: true, title: true, isRead: true, createdAt: true },
        take: 20,
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!user) notFound();

  const ownedProjectIds = user.projectMemberships.filter((m) => m.role === "OWNER").map((m) => m.project.id);
  const [integrations, activityLog] = await Promise.all([
    ownedProjectIds.length
      ? prisma.integration.findMany({
          where: { projectId: { in: ownedProjectIds } },
          select: { id: true, type: true, status: true, projectId: true },
          take: 20,
        })
      : Promise.resolve([]),
    prisma.auditLog.findMany({
      where: { OR: [{ actorId: userId }, { targetId: userId }] },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, action: true, targetType: true, targetId: true, createdAt: true, actorId: true },
    }),
  ]);

  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";
  const isSelf = currentUser?.id === user.id;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{user.name || "Sin nombre"}</h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <UserRoleSelect userId={user.id} role={user.role} disabled={!isSuperAdmin} />
          <Badge variant={user.isSuspended ? "destructive" : "secondary"}>
            {user.isSuspended ? "Suspendido" : "Activo"}
          </Badge>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">Creado</p>
            <p>{user.createdAt.toLocaleString("es-ES")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">Última actualización</p>
            <p>{user.updatedAt.toLocaleString("es-ES")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">Espacios de trabajo</p>
            <p>{user.workspaceMemberships.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">Proyectos</p>
            <p>{user.projectMemberships.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <form action={suspendUserAction.bind(null, user.id, !user.isSuspended)}>
          <ConfirmSubmitButton
            variant="outline"
            size="sm"
            confirmMessage={
              user.isSuspended
                ? `¿Reactivar la cuenta de ${user.email}?`
                : `¿Suspender la cuenta de ${user.email}? No podrá iniciar sesión.`
            }
            disabled={isSelf}
          >
            {user.isSuspended ? "Reactivar cuenta" : "Suspender cuenta"}
          </ConfirmSubmitButton>
        </form>

        {isSuperAdmin ? (
          <>
            <form action={closeUserSessionsAction.bind(null, user.id)}>
              <ConfirmSubmitButton
                variant="outline"
                size="sm"
                confirmMessage={`¿Cerrar todas las sesiones activas de ${user.email}?`}
              >
                Cerrar todas las sesiones
              </ConfirmSubmitButton>
            </form>
            <form action={anonymizeUserAction.bind(null, user.id)}>
              <ConfirmSubmitButton
                variant="destructive"
                size="sm"
                confirmMessage={`¿Eliminar/anonimizar permanentemente la cuenta de ${user.email}? Esta acción no se puede deshacer.`}
                disabled={isSelf}
              >
                Eliminar / anonimizar cuenta
              </ConfirmSubmitButton>
            </form>
          </>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Espacios de trabajo</h2>
          {user.workspaceMemberships.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguno.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {user.workspaceMemberships.map((m) => (
                <li key={m.workspace.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <span>{m.workspace.name}</span>
                  <Badge variant="outline">{m.role}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Proyectos</h2>
          {user.projectMemberships.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguno.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {user.projectMemberships.map((m) => (
                <li key={m.project.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                  <Link href={`/admin/projects/${m.project.id}`} className="min-w-0 truncate hover:underline">
                    {m.project.name}
                  </Link>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="outline">{m.role}</Badge>
                    <StatusBadge status={m.project.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Campañas</h2>
          {user.campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguna.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {user.campaigns.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                  <span className="min-w-0 truncate">{c.name}</span>
                  <StatusBadge status={c.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Contenido</h2>
          {user.contentItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguno.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {user.contentItems.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                  <span className="min-w-0 truncate">{c.title}</span>
                  <StatusBadge status={c.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Integraciones</h2>
          {integrations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguna en proyectos de los que es propietario.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {integrations.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                  <span>{i.type}</span>
                  <StatusBadge status={i.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Notificaciones</h2>
          {user.notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguna.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {user.notifications.map((n) => (
                <li key={n.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                  <span className="min-w-0 truncate">{n.title}</span>
                  <Badge variant={n.isRead ? "outline" : "secondary"}>{n.isRead ? "Leída" : "No leída"}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Registro de actividad relacionado
        </h2>
        {activityLog.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin actividad registrada.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {activityLog.map((log) => (
              <li key={log.id} className="rounded-lg border px-3 py-2">
                <span className="font-medium">{log.action}</span>
                <span className="text-xs text-muted-foreground">
                  {" "}
                  · {log.actorId === userId ? "realizada por este usuario" : "aplicada a este usuario"} ·{" "}
                  {log.createdAt.toLocaleString("es-ES")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Button variant="ghost" size="sm" render={<Link href="/admin/users">← Volver a usuarios</Link>} />
    </div>
  );
}
