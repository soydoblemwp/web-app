import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import {
  archiveContentAdminAction,
  restoreContentAdminAction,
  restoreDeletedContentAdminAction,
  softDeleteContentAdminAction,
} from "@/server/actions/admin";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { StatusBadge } from "@/components/admin/status-badge";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { ADMIN_PAGE_SIZE, paginationSkip, parsePage, totalPages } from "@/lib/admin/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const metadata: Metadata = { title: "Administración · Contenido" };

export default async function AdminContentPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; trash?: string; page?: string }>;
}) {
  const { q, trash, page: pageParam } = await searchParams;
  const page = parsePage(pageParam);
  const showTrash = trash === "true";

  const where = {
    deletedAt: showTrash ? { not: null } : null,
    ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.contentItem.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: paginationSkip(page),
      take: ADMIN_PAGE_SIZE,
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        isFavorite: true,
        isArchived: true,
        deletedAt: true,
        createdAt: true,
        author: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true } },
      },
    }),
    prisma.contentItem.count({ where }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Contenido</h1>
        <p className="text-sm text-muted-foreground">{total} elementos en cuentas registradas.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <form className="flex flex-wrap items-end gap-3">
          <Input name="q" defaultValue={q} placeholder="Buscar por título..." className="w-64" />
          {showTrash ? <input type="hidden" name="trash" value="true" /> : null}
          <Button type="submit" size="sm">
            Buscar
          </Button>
        </form>
        <div className="flex gap-2">
          <Button
            variant={showTrash ? "outline" : "default"}
            size="sm"
            render={<Link href={`/admin/content${q ? `?q=${encodeURIComponent(q)}` : ""}`}>Contenido</Link>}
          />
          <Button
            variant={showTrash ? "default" : "outline"}
            size="sm"
            render={<Link href={`/admin/content?trash=true${q ? `&q=${encodeURIComponent(q)}` : ""}`}>Papelera</Link>}
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Título</th>
              <th className="px-4 py-2 font-medium">Tipo</th>
              <th className="px-4 py-2 font-medium">Autor</th>
              <th className="px-4 py-2 font-medium">Proyecto</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium">Creado</th>
              <th className="px-4 py-2 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  {showTrash ? "La papelera está vacía." : "No se encontró contenido con estos filtros."}
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-2">
                    <p className="max-w-64 truncate font-medium">{item.title}</p>
                    {item.isFavorite ? <Badge variant="outline">Favorito</Badge> : null}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{item.type}</td>
                  <td className="px-4 py-2 text-muted-foreground">{item.author.name || item.author.email}</td>
                  <td className="px-4 py-2 text-muted-foreground">{item.project.name}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={item.isArchived ? "ARCHIVADO" : item.status} />
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{item.createdAt.toLocaleDateString("es-ES")}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {showTrash ? (
                        <form action={restoreDeletedContentAdminAction.bind(null, item.id)}>
                          <Button type="submit" size="sm" variant="outline">
                            Restaurar
                          </Button>
                        </form>
                      ) : (
                        <>
                          <form action={item.isArchived ? restoreContentAdminAction.bind(null, item.id) : archiveContentAdminAction.bind(null, item.id)}>
                            <Button type="submit" size="sm" variant="outline">
                              {item.isArchived ? "Desarchivar" : "Archivar"}
                            </Button>
                          </form>
                          <form action={softDeleteContentAdminAction.bind(null, item.id)}>
                            <ConfirmSubmitButton
                              size="sm"
                              variant="destructive"
                              confirmMessage={`¿Enviar "${item.title}" a la papelera?`}
                            >
                              Papelera
                            </ConfirmSubmitButton>
                          </form>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <AdminPagination
        basePath="/admin/content"
        page={page}
        totalPages={totalPages(total)}
        searchParams={{ q, trash: showTrash ? "true" : undefined }}
      />
    </div>
  );
}
