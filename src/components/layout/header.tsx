import Link from "next/link";
import { appConfig } from "@/lib/config";
import { ProjectSwitcher } from "@/components/layout/project-switcher";
import { UserMenu } from "@/components/layout/user-menu";
import { NotificationsBell } from "@/components/layout/notifications-bell";

export function Header({
  projects,
  currentProjectId,
  user,
  unreadNotifications,
}: {
  projects: { id: string; name: string }[];
  currentProjectId?: string;
  user: { name: string | null; email: string; role: string };
  unreadNotifications: number;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4">
      <Link href="/dashboard" className="shrink-0 text-sm font-semibold">
        {appConfig.name}
      </Link>
      <div className="flex-1" />
      <ProjectSwitcher projects={projects} currentProjectId={currentProjectId} />
      <NotificationsBell unreadCount={unreadNotifications} />
      <UserMenu name={user.name} email={user.email} isAdmin={user.role === "ADMIN" || user.role === "SUPER_ADMIN"} />
    </header>
  );
}
