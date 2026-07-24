import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import { setProjectStatusAdminAction } from "@/server/actions/admin";
import { StatusBadge } from "@/components/admin/status-badge";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Administración · Detalle de proyecto" };

export default async function AdminProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      ownerId: true,
      workspaceId: true,
      members: { select: { role: true, user: { select: { id: true, name: true, email: true } } }, take: 50 },
      contentItems: {
        select: { id: true, title: true, type: true, status: true, isArchived: true, deletedAt: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      campaigns: { select: { id: true, name: true, status: true }, take: 20, orderBy: { createdAt: "desc" } },
      socialPosts: { select: { id: true, platform: true, status: true }, take: 20, orderBy: { createdAt: "desc" } },
      automations: { select: { id: true, name: true, isActive: true }, take: 20 },
      monitors: { select: { id: true, name: true, lastStatus: true }, take: 20 },
      integrations: { select: { id: true, type: true, status: true }, take: 20 },
    },
  });

  if (!project) notFound();

  const [owner, workspace] = await Promise.all([
    prisma.user.findUnique({ where: { id: project.ownerId }, select: { id: true, name: true, email: true } }),
    prisma.workspace.findUnique({ where: { id: project.workspaceId }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          <p className="text-sm text-muted-foreground">
            Propietario: {owner?.name || owner?.email || "—"} · Espacio: {workspace?.name || "—"}
          </p>
        </div>
        <StatusBadge status={project.status} />
      </div>

      <div className="flex flex-wrap gap-2">
        {project.status !== "ACTIVE" ? (
          <form action={setProjectStatusAdminAction.bind(null, project.id, "ACTIVE")}>
            <ConfirmSubmitButton variant="outline" size="sm" confirmMessage={`¿Reactivar el proyecto "${project.name}"?`}>
              Reactivar
            </ConfirmSubmitButton>
          </form>
        ) : null}
        {project.status !== "PAUSED" ? (
          <form action={setProjectStatusAdminAction.bind(null, project.id, "PAUSED")}>
            <ConfirmSubmitButton variant="outline" size="sm" confirmMessage={`¿Pausar el proyecto "${project.name}"?`}>
              Pausar
            </ConfirmSubmitButton>
          </form>
        ) : null}
        {project.status !== "ARCHIVED" ? (
          <form action={setProjectStatusAdminAction.bind(null, project.id, "ARCHIVED")}>
            <ConfirmSubmitButton variant="destructive" size="sm" confirmMessage={`¿Archivar el proyecto "${project.name}"?`}>
              Archivar
            </ConfirmSubmitButton>
          </form>
        ) : (
          <form action={setProjectStatusAdminAction.bind(null, project.id, "ACTIVE")}>
            <ConfirmSubmitButton variant="outline" size="sm" confirmMessage={`¿Restaurar el proyecto archivado "${project.name}"?`}>
              Restaurar de archivado
            </ConfirmSubmitButton>
          </form>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6 text-sm">
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">Miembros</p>
            <p>{project.members.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">Contenido</p>
            <p>{project.contentItems.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">Campañas</p>
            <p>{project.campaigns.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">Publicaciones</p>
            <p>{project.socialPosts.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">Automatizaciones</p>
            <p>{project.automations.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">Monitores</p>
            <p>{project.monitors.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Miembros</h2>
          {project.members.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguno.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {project.members.map((m) => (
                <li key={m.user.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <Link href={`/admin/users/${m.user.id}`} className="min-w-0 truncate hover:underline">
                    {m.user.name || m.user.email}
                  </Link>
                  <Badge variant="outline">{m.role}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Integraciones</h2>
          {project.integrations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguna.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {project.integrations.map((i) => (
                <li key={i.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <span>{i.type}</span>
                  <StatusBadge status={i.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Contenido reciente</h2>
          {project.contentItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguno.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {project.contentItems.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                  <span className="min-w-0 truncate">{c.title}</span>
                  <StatusBadge status={c.deletedAt ? "ELIMINADO" : c.isArchived ? "ARCHIVADO" : c.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Campañas</h2>
          {project.campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguna.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {project.campaigns.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                  <span className="min-w-0 truncate">{c.name}</span>
                  <StatusBadge status={c.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Automatizaciones</h2>
          {project.automations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguna.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {project.automations.map((a) => (
                <li key={a.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <span>{a.name}</span>
                  <Badge variant={a.isActive ? "secondary" : "outline"}>{a.isActive ? "Activa" : "Inactiva"}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Monitores</h2>
          {project.monitors.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguno.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {project.monitors.map((m) => (
                <li key={m.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <span>{m.name}</span>
                  <StatusBadge status={m.lastStatus} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Button variant="ghost" size="sm" render={<Link href="/admin/projects">← Volver a proyectos</Link>} />
    </div>
  );
}
