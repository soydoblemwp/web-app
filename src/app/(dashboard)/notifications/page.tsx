import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Bell, ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/permissions";
import { prisma } from "@/lib/db/prisma";
import { markNotificationReadAction, markAllNotificationsReadAction } from "@/server/actions/notification";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Notificaciones" };

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Notificaciones</h1>
        </div>
        {notifications.some((n) => !n.isRead) ? (
          <form action={markAllNotificationsReadAction}>
            <Button type="submit" variant="outline" size="sm">
              Marcar todas como leídas
            </Button>
          </form>
        ) : null}
      </div>

      {notifications.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Bell className="size-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No tienes notificaciones.</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="divide-y rounded-lg border">
          {notifications.map((n) => (
            <li key={n.id} className={`flex items-start justify-between gap-3 px-4 py-3 ${n.isRead ? "" : "bg-muted/40"}`}>
              <div>
                <p className="text-sm font-medium">{n.title}</p>
                <p className="text-sm text-muted-foreground">{n.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">{n.createdAt.toLocaleString("es-ES")}</p>
              </div>
              {!n.isRead ? (
                <form action={markNotificationReadAction.bind(null, n.id)}>
                  <Button type="submit" size="sm" variant="ghost">
                    Marcar leída
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
