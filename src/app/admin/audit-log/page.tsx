import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { ADMIN_PAGE_SIZE, paginationSkip, parsePage, totalPages } from "@/lib/admin/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const metadata: Metadata = { title: "Administración · Auditoría" };

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ actor?: string; action?: string; entity?: string; from?: string; to?: string; page?: string }>;
}) {
  const { actor, action, entity, from, to, page: pageParam } = await searchParams;
  const page = parsePage(pageParam);

  const createdAtFilter: { gte?: Date; lte?: Date } = {};
  if (from) {
    const parsed = new Date(from);
    if (!Number.isNaN(parsed.getTime())) createdAtFilter.gte = parsed;
  }
  if (to) {
    const parsed = new Date(to);
    if (!Number.isNaN(parsed.getTime())) createdAtFilter.lte = parsed;
  }

  const where = {
    ...(action ? { action: { contains: action, mode: "insensitive" as const } } : {}),
    ...(entity ? { targetType: { equals: entity, mode: "insensitive" as const } } : {}),
    ...(Object.keys(createdAtFilter).length ? { createdAt: createdAtFilter } : {}),
    ...(actor
      ? {
          actor: {
            OR: [
              { email: { contains: actor, mode: "insensitive" as const } },
              { name: { contains: actor, mode: "insensitive" as const } },
            ],
          },
        }
      : {}),
  };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: paginationSkip(page),
      take: ADMIN_PAGE_SIZE,
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        metadata: true,
        createdAt: true,
        actor: { select: { name: true, email: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Registro de auditoría</h1>
        <p className="text-sm text-muted-foreground">{total} acciones administrativas registradas.</p>
      </div>

      <form className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Actor</label>
          <Input name="actor" defaultValue={actor} placeholder="Nombre o correo..." className="w-48" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Acción</label>
          <Input name="action" defaultValue={action} placeholder="p. ej. user.suspend" className="w-48" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Entidad</label>
          <Input name="entity" defaultValue={entity} placeholder="p. ej. User" className="w-40" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Desde</label>
          <Input type="date" name="from" defaultValue={from} className="w-40" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Hasta</label>
          <Input type="date" name="to" defaultValue={to} className="w-40" />
        </div>
        <Button type="submit" size="sm">
          Filtrar
        </Button>
      </form>

      {logs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay acciones administrativas con estos filtros.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 font-medium">Actor</th>
                <th className="px-4 py-2 font-medium">Acción</th>
                <th className="px-4 py-2 font-medium">Objetivo</th>
                <th className="px-4 py-2 font-medium">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-2 text-muted-foreground">{log.createdAt.toLocaleString("es-ES")}</td>
                  <td className="px-4 py-2">{log.actor?.name || log.actor?.email || "Sistema"}</td>
                  <td className="px-4 py-2">{log.action}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {log.targetType} {log.targetId}
                  </td>
                  <td className="max-w-64 truncate px-4 py-2 text-xs text-muted-foreground">
                    {log.metadata ? JSON.stringify(log.metadata) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminPagination basePath="/admin/audit-log" page={page} totalPages={totalPages(total)} searchParams={{ actor, action, entity, from, to }} />
    </div>
  );
}
