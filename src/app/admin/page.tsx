import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/permissions";
import { suspendUserAction } from "@/server/actions/admin";
import { UserRoleSelect } from "@/components/admin/user-role-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Administración · Usuarios" };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const currentUser = await getCurrentUser();
  const { q } = await searchParams;

  const users = await prisma.user.findMany({
    where: q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { _count: { select: { workspaceMemberships: true, projectMemberships: true } } },
  });

  const [totalUsers, totalProjects, aiUsageAgg] = await Promise.all([
    prisma.user.count(),
    prisma.project.count(),
    prisma.aIUsage.aggregate({ _sum: { inputTokens: true, outputTokens: true }, _count: true }),
  ]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="py-4">
            <p className="text-2xl font-semibold">{totalUsers}</p>
            <p className="text-xs text-muted-foreground">Usuarios totales</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-2xl font-semibold">{totalProjects}</p>
            <p className="text-xs text-muted-foreground">Proyectos totales</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-2xl font-semibold">{aiUsageAgg._count}</p>
            <p className="text-xs text-muted-foreground">
              Generaciones de IA · {(aiUsageAgg._sum.inputTokens ?? 0) + (aiUsageAgg._sum.outputTokens ?? 0)} tokens
            </p>
          </CardContent>
        </Card>
      </div>

      <form className="max-w-sm">
        <Input name="q" defaultValue={q} placeholder="Buscar por nombre o correo..." />
      </form>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Usuario</th>
              <th className="px-4 py-2 font-medium">Rol</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium">Registrado</th>
              <th className="px-4 py-2 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-4 py-2">
                  <p className="font-medium">{user.name || "Sin nombre"}</p>
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
                <td className="px-4 py-2">
                  <form action={suspendUserAction.bind(null, user.id, !user.isSuspended)}>
                    <Button type="submit" size="sm" variant="outline">
                      {user.isSuspended ? "Reactivar" : "Suspender"}
                    </Button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
