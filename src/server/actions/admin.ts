"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireAdmin, requireSuperAdmin, ForbiddenError } from "@/lib/permissions";

async function logAdminAction(actorId: string, action: string, targetType: string, targetId: string, metadata?: object) {
  await prisma.auditLog.create({
    data: { actorId, action, targetType, targetId, metadata: metadata ? (metadata as object) : undefined },
  });
}

export async function suspendUserAction(userId: string, suspend: boolean) {
  const admin = await requireAdmin();
  const target = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (target.role === "SUPER_ADMIN" && admin.role !== "SUPER_ADMIN") {
    throw new ForbiddenError("Solo un SUPER_ADMIN puede modificar a otro SUPER_ADMIN.");
  }

  await prisma.user.update({ where: { id: userId }, data: { isSuspended: suspend } });
  await logAdminAction(admin.id, suspend ? "user.suspend" : "user.reactivate", "User", userId);
  revalidatePath("/admin");
}

export async function changeUserRoleAction(userId: string, role: string) {
  const admin = await requireSuperAdmin();
  const validRoles = ["USER", "EDITOR", "ADMIN", "SUPER_ADMIN"];
  if (!validRoles.includes(role)) return;

  await prisma.user.update({ where: { id: userId }, data: { role: role as never } });
  await logAdminAction(admin.id, "user.role_change", "User", userId, { newRole: role });
  revalidatePath("/admin");
}
