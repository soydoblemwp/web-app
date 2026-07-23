import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function NotificationsBell({ unreadCount }: { unreadCount: number }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      render={
        <Link href="/notifications" aria-label="Notificaciones">
          <Bell className="size-5" />
          {unreadCount > 0 ? (
            <Badge className="absolute -right-1 -top-1 h-4 min-w-4 justify-center rounded-full px-1 text-[10px]">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          ) : null}
        </Link>
      }
    />
  );
}
