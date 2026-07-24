import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { StatusBadge } from "@/components/admin/status-badge";
import { ADMIN_PAGE_SIZE, paginationSkip, parsePage, totalPages } from "@/lib/admin/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProjectStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Administración · Proyectos" };

const STATUSES: ProjectStatus[] = ["ACTIVE", "PAUSED", "ARCHIVED"];

export default async function AdminProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; owner?: string; status?: string; page?: string }>;
}) {
  const { q, owner, status, page: pageParam } = await searchParams;
  const page = parsePage(pageParam);

  const ownerMatches = owner
    ? await prisma.user.findMany({
        where: { OR: [{ email: { contains: owner, mode: "insensitive" } }, { name: { contains: owner, mode: "insensitive" } }] },
        select: { id: true },
        take: 500,
      })
    : null;

  const where = {
    ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
    ...(status && STATUSES.includes(status as ProjectStatus) ? { status: status as ProjectStatus } : {}),
    ...(ownerMatches ? { ownerId: { in: ownerMatches.map((u) => u.id) } } : {}),
  };

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: paginationSkip(page),
      take: ADMIN_PAGE_SIZE,
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        ownerId: true,
        workspaceId: true,
        _count: {
          select: {
            members: true,
            contentItems: true,
            campaigns: true,
            socialPosts: true,
            automations: true,
            monitors: true,
            integrations: true,
          },
        },
      },
    }),
    prisma.project.count({ where }),
  ]);

  const ownerIds = [...new Set(projects.map((p) => p.ownerId))];
  const workspaceIds = [...new Set(projects.map((p) => p.workspaceId))];
  const [owners, workspaces] = await Promise.all([
    ownerIds.length
      ? prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true, email: true } })
      : Promise.resolve([]),
    workspaceIds.length
      ? prisma.workspace.findMany({ where: { id: { in: workspaceIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const ownerById = new Map(owners.map((o) => [o.id, o]));
  const workspaceById = new Map(workspaces.map((w) => [w.id, w]));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Proyectos</h1>
        <p className="text-sm text-muted-foreground">{total} proyectos de cuentas registradas.</p>
      </div>

      <form className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Nombre</label>
          <Input name="q" defaultValue={q} placeholder="Nombre del proyecto..." className="w-56" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Propietario</label>
          <Input name="owner" defaultValue={owner} placeholder="Nombre o correo..." className="w-56" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Estado</label>
          <Select name="status" defaultValue={status || "ALL"}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" size="sm">
          Filtrar
        </Button>
      </form>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Proyecto</th>
              <th className="px-4 py-2 font-medium">Propietario</th>
              <th className="px-4 py-2 font-medium">Espacio</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium">Creado</th>
              <th className="px-4 py-2 font-medium">Miembros</th>
              <th className="px-4 py-2 font-medium">Contenido</th>
              <th className="px-4 py-2 font-medium">Campañas</th>
              <th className="px-4 py-2 font-medium">Publicaciones</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {projects.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                  No se encontraron proyectos con estos filtros.
                </td>
              </tr>
            ) : (
              projects.map((project) => (
                <tr key={project.id}>
                  <td className="px-4 py-2">
                    <Link href={`/admin/projects/${project.id}`} className="font-medium hover:underline">
                      {project.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {ownerById.get(project.ownerId)?.name || ownerById.get(project.ownerId)?.email || "—"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{workspaceById.get(project.workspaceId)?.name || "—"}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={project.status} />
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{project.createdAt.toLocaleDateString("es-ES")}</td>
                  <td className="px-4 py-2 text-muted-foreground">{project._count.members}</td>
                  <td className="px-4 py-2 text-muted-foreground">{project._count.contentItems}</td>
                  <td className="px-4 py-2 text-muted-foreground">{project._count.campaigns}</td>
                  <td className="px-4 py-2 text-muted-foreground">{project._count.socialPosts}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <AdminPagination basePath="/admin/projects" page={page} totalPages={totalPages(total)} searchParams={{ q, owner, status }} />
    </div>
  );
}
