import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { prisma } from "@/lib/db/prisma";
import { ensureWorkspaceForUser } from "@/server/services/workspace";
import { listProjectsForUser } from "@/server/services/project";

export async function getDashboardContext() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await ensureWorkspaceForUser(user.id, user.name);
  const projects = await listProjectsForUser(user.id);
  const unreadNotifications = await prisma.notification.count({
    where: { userId: user.id, isRead: false },
  });

  return { user, workspace, projects, unreadNotifications };
}
