import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/permissions";
import { suspendUserAction } from "@/server/actions/admin";
import { UserRoleSelect } from "@/components/admin/user-role-select";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { ADMIN_PAGE_SIZE, paginationSkip, parsePage, totalPages } from "@/lib/admin/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const metadata: Metadata = { title: "Administración · Usuarios" };

const ROLES = ["USER", "EDITOR", "ADMIN", "SUPER_ADMIN"] as const;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; status?: string; page?: string }>;
}) {
  const currentUser = await getCurrentUser();
  const { q, role, status, page: pageParam } = await searchParams;
  const page = parsePage(pageParam);

  const where = {
    ...(q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" as const } },
            { name: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(role && ROLES.includes(role as (typeof ROLES)[number]) ? { role: role as (typeof ROLES)[number] } : {}),
    ...(status === "active" ? { isSuspended: false } : status === "suspended" ? { isSuspended: true } : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: paginationSkip(page),
      take: ADMIN_PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isSuspended: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { workspaceMemberships: true, projectMemberships: true, contentItems: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usuarios</h1>
        <p className="text-sm text-muted-foreground">{total} cuentas registradas.</p>
      </div>

      <form className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Buscar</label>
          <Input name="q" defaultValue={q} placeholder="Nombre o correo..." className="w-56" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Rol</label>
          <Select name="role" defaultValue={role || "ALL"}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Estado</label>
          <Select name="status" defaultValue={status || "ALL"}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              <SelectItem value="active">Activos</SelectItem>
              <SelectItem value="suspended">Suspendidos</SelectItem>
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
              <th className="px-4 py-2 font-medium">Usuario</th>
              <th className="px-4 py-2 font-medium">Rol</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium">Registrado</th>
              <th className="px-4 py-2 font-medium">Actualizado</th>
              <th className="px-4 py-2 font-medium">Espacios</th>
              <th className="px-4 py-2 font-medium">Proyectos</th>
              <th className="px-4 py-2 font-medium">Contenido</th>
              <th className="px-4 py-2 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                  No se encontraron usuarios con estos filtros.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id}>
                  <td className="px-4 py-2">
                    <Link href={`/admin/users/${user.id}`} className="font-medium hover:underline">
                      {user.name || "Sin nombre"}
                    </Link>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </td>
                  <td className="px-4 py-2">
                    <UserRoleSelect userId={user.id} role={user.role} disabled={currentUser?.role !== "SUPER_ADMIN"} />
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant={user.isSuspended ? "destructive" : "secondary"}>
                      {user.isSuspended ? "Suspendido" : "Activo"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{user.createdAt.toLocaleDateString("es-ES")}</td>
                  <td className="px-4 py-2 text-muted-foreground">{user.updatedAt.toLocaleDateString("es-ES")}</td>
                  <td className="px-4 py-2 text-muted-foreground">{user._count.workspaceMemberships}</td>
                  <td className="px-4 py-2 text-muted-foreground">{user._count.projectMemberships}</td>
                  <td className="px-4 py-2 text-muted-foreground">{user._count.contentItems}</td>
                  <td className="px-4 py-2">
                    <form action={suspendUserAction.bind(null, user.id, !user.isSuspended)}>
                      <Button type="submit" size="sm" variant="outline">
                        {user.isSuspended ? "Reactivar" : "Suspender"}
                      </Button>
                    </form>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <AdminPagination basePath="/admin/users" page={page} totalPages={totalPages(total)} searchParams={{ q, role, status }} />
    </div>
  );
}
