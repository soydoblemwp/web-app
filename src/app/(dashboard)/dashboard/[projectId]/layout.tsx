import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { prisma } from "@/lib/db/prisma";
import { listProjectsForUser, getProjectForUser } from "@/server/services/project";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const isPlatformAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  const project = await getProjectForUser(user.id, projectId, isPlatformAdmin);
  if (!project) notFound();

  const [projects, unreadNotifications] = await Promise.all([
    listProjectsForUser(user.id),
    prisma.notification.count({ where: { userId: user.id, isRead: false } }),
  ]);

  return (
    <div className="flex min-h-svh flex-col">
      <Header
        projects={projects}
        currentProjectId={project.id}
        user={user}
        unreadNotifications={unreadNotifications}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar projectId={project.id} />
        <main className="flex-1 overflow-y-auto px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
