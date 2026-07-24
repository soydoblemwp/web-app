import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import {
  deleteNotificationAdminAction,
  deleteOldNotificationsAction,
  markNotificationReadAdminAction,
} from "@/server/actions/admin";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { ADMIN_PAGE_SIZE, paginationSkip, parsePage, totalPages } from "@/lib/admin/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { NotificationType } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Administración · Notificaciones" };

const TYPES: NotificationType[] = [
  "POST_DUE",
  "UPCOMING_DATE",
  "AUTOMATION_FAILED",
  "MONITOR_CHANGED",
  "LINK_BROKEN",
  "INTEGRATION_DISCONNECTED",
  "USAGE_LIMIT_NEAR",
  "COLLABORATION_DUE",
  "PAYMENT_PENDING",
  "PUBLISH_ERROR",
  "GENERIC",
];

export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; status?: string; page?: string }>;
}) {
  const { q, type, status, page: pageParam } = await searchParams;
  const page = parsePage(pageParam);

  const where = {
    ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
    ...(type && TYPES.includes(type as NotificationType) ? { type: type as NotificationType } : {}),
    ...(status === "unread" ? { isRead: false } : status === "read" ? { isRead: true } : {}),
  };

  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: paginationSkip(page),
      take: ADMIN_PAGE_SIZE,
      select: {
        id: true,
        type: true,
        title: true,
        isRead: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
        project: { select: { name: true } },
      },
    }),
    prisma.notification.count({ where }),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notificaciones</h1>
          <p className="text-sm text-muted-foreground">{total} notificaciones de cuentas registradas.</p>
        </div>
        <form action={deleteOldNotificationsAction.bind(null, 90)}>
          <ConfirmSubmitButton variant="outline" size="sm" confirmMessage="¿Eliminar todas las notificaciones con más de 90 días de antigüedad?">
            Eliminar antiguas (+90 días)
          </ConfirmSubmitButton>
        </form>
      </div>

      <form className="flex flex-wrap items-end gap-3">
        <Input name="q" defaultValue={q} placeholder="Buscar por título..." className="w-56" />
        <Select name="type" defaultValue={type || "ALL"}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos los tipos</SelectItem>
            {TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select name="status" defaultValue={status || "ALL"}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas</SelectItem>
            <SelectItem value="unread">No leídas</SelectItem>
            <SelectItem value="read">Leídas</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" size="sm">
          Filtrar
        </Button>
      </form>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Tipo</th>
              <th className="px-4 py-2 font-medium">Usuario</th>
              <th className="px-4 py-2 font-medium">Proyecto</th>
              <th className="px-4 py-2 font-medium">Título</th>
              <th className="px-4 py-2 font-medium">Fecha</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {notifications.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No hay notificaciones con estos filtros.
                </td>
              </tr>
            ) : (
              notifications.map((n) => (
                <tr key={n.id}>
                  <td className="px-4 py-2 text-muted-foreground">{n.type}</td>
                  <td className="px-4 py-2 text-muted-foreground">{n.user.name || n.user.email}</td>
                  <td className="px-4 py-2 text-muted-foreground">{n.project?.name || "—"}</td>
                  <td className="max-w-64 truncate px-4 py-2">{n.title}</td>
                  <td className="px-4 py-2 text-muted-foreground">{n.createdAt.toLocaleString("es-ES")}</td>
                  <td className="px-4 py-2">
                    <Badge variant={n.isRead ? "outline" : "secondary"}>{n.isRead ? "Leída" : "No leída"}</Badge>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {!n.isRead ? (
                        <form action={markNotificationReadAdminAction.bind(null, n.id)}>
                          <Button type="submit" size="sm" variant="outline">
                            Marcar leída
                          </Button>
                        </form>
                      ) : null}
                      <form action={deleteNotificationAdminAction.bind(null, n.id)}>
                        <Button type="submit" size="sm" variant="destructive">
                          Eliminar
                        </Button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <AdminPagination basePath="/admin/notifications" page={page} totalPages={totalPages(total)} searchParams={{ q, type, status }} />
    </div>
  );
}
