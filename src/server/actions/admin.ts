"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireAdmin, requireSuperAdmin } from "@/lib/permissions";
import { assertCanModifyTarget, assertNotSelf, assertNotLastSuperAdmin as assertRoleNotLastSuperAdmin } from "@/lib/admin/guards";
import type { CampaignStatus, ProjectStatus } from "@/generated/prisma/enums";

async function logAdminAction(actorId: string, action: string, targetType: string, targetId: string, metadata?: object) {
  await prisma.auditLog.create({
    data: { actorId, action, targetType, targetId, metadata: metadata ? (metadata as object) : undefined },
  });
}

/** Refuses the action if it would leave the platform with zero SUPER_ADMIN accounts. */
async function assertNotLastSuperAdmin(userId: string) {
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (target?.role !== "SUPER_ADMIN") return;
  const remaining = await prisma.user.count({ where: { role: "SUPER_ADMIN", id: { not: userId } } });
  assertRoleNotLastSuperAdmin(target.role, remaining);
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function suspendUserAction(userId: string, suspend: boolean) {
  const admin = await requireAdmin();
  const target = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  assertCanModifyTarget(admin.role, target.role);
  if (suspend) {
    assertNotSelf(admin.id, userId, "No puedes suspenderte a ti mismo.");
    await assertNotLastSuperAdmin(userId);
  }

  await prisma.user.update({ where: { id: userId }, data: { isSuspended: suspend } });
  await logAdminAction(admin.id, suspend ? "user.suspend" : "user.reactivate", "User", userId);
  revalidatePath("/admin");
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
}

export async function changeUserRoleAction(userId: string, role: string) {
  const admin = await requireSuperAdmin();
  const validRoles = ["USER", "EDITOR", "ADMIN", "SUPER_ADMIN"];
  if (!validRoles.includes(role)) return;

  if (role !== "SUPER_ADMIN") {
    await assertNotLastSuperAdmin(userId);
  }

  await prisma.user.update({ where: { id: userId }, data: { role: role as never } });
  await logAdminAction(admin.id, "user.role_change", "User", userId, { newRole: role });
  revalidatePath("/admin");
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
}

/** Revokes every active session for a user — e.g. after a role change or a suspected compromise. */
export async function closeUserSessionsAction(userId: string) {
  const admin = await requireSuperAdmin();
  await prisma.session.deleteMany({ where: { userId } });
  await logAdminAction(admin.id, "user.sessions_revoked", "User", userId);
  revalidatePath(`/admin/users/${userId}`);
}

/**
 * Scrubs personal data instead of hard-deleting the row: several tables
 * (content, campaigns, social posts...) reference the user without a
 * cascading delete, so a hard delete would fail with a foreign-key error.
 * Anonymizing keeps referential integrity while satisfying "eliminar o
 * anonimizar una cuenta."
 */
export async function anonymizeUserAction(userId: string) {
  const admin = await requireSuperAdmin();
  assertNotSelf(admin.id, userId, "No puedes eliminar o anonimizar tu propia cuenta.");
  await assertNotLastSuperAdmin(userId);

  await prisma.user.update({
    where: { id: userId },
    data: {
      name: "Usuario eliminado",
      email: `deleted-${userId}@deleted.invalid`,
      passwordHash: null,
      image: null,
      isSuspended: true,
    },
  });
  await prisma.session.deleteMany({ where: { userId } });
  await logAdminAction(admin.id, "user.anonymized", "User", userId);
  revalidatePath("/admin");
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

const VALID_PROJECT_STATUSES: ProjectStatus[] = ["ACTIVE", "PAUSED", "ARCHIVED"];

export async function setProjectStatusAdminAction(projectId: string, status: ProjectStatus) {
  const admin = await requireSuperAdmin();
  if (!VALID_PROJECT_STATUSES.includes(status)) return;

  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { status: true } });
  await prisma.project.update({ where: { id: projectId }, data: { status } });
  await logAdminAction(admin.id, "project.status_change", "Project", projectId, {
    previousStatus: project.status,
    newStatus: status,
  });
  revalidatePath("/admin/projects");
  revalidatePath(`/admin/projects/${projectId}`);
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

export async function archiveContentAdminAction(contentId: string) {
  const admin = await requireAdmin();
  await prisma.contentItem.update({ where: { id: contentId }, data: { isArchived: true } });
  await logAdminAction(admin.id, "content.archived", "ContentItem", contentId);
  revalidatePath("/admin/content");
}

export async function restoreContentAdminAction(contentId: string) {
  const admin = await requireAdmin();
  await prisma.contentItem.update({ where: { id: contentId }, data: { isArchived: false } });
  await logAdminAction(admin.id, "content.restored", "ContentItem", contentId);
  revalidatePath("/admin/content");
}

export async function softDeleteContentAdminAction(contentId: string) {
  const admin = await requireAdmin();
  await prisma.contentItem.update({ where: { id: contentId }, data: { deletedAt: new Date() } });
  await logAdminAction(admin.id, "content.soft_deleted", "ContentItem", contentId);
  revalidatePath("/admin/content");
}

export async function restoreDeletedContentAdminAction(contentId: string) {
  const admin = await requireAdmin();
  await prisma.contentItem.update({ where: { id: contentId }, data: { deletedAt: null } });
  await logAdminAction(admin.id, "content.restored_from_trash", "ContentItem", contentId);
  revalidatePath("/admin/content");
}

// ---------------------------------------------------------------------------
// Campaigns & social posts
// ---------------------------------------------------------------------------

const VALID_CAMPAIGN_STATUSES: CampaignStatus[] = ["DRAFT", "PLANNED", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"];

export async function setCampaignStatusAdminAction(campaignId: string, status: CampaignStatus) {
  const admin = await requireAdmin();
  if (!VALID_CAMPAIGN_STATUSES.includes(status)) return;

  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId }, select: { status: true } });
  await prisma.campaign.update({ where: { id: campaignId }, data: { status } });
  await logAdminAction(admin.id, "campaign.status_change", "Campaign", campaignId, {
    previousStatus: campaign.status,
    newStatus: status,
  });
  revalidatePath("/admin/campaigns");
}

/** Only ever moves a FAILED post back to DRAFT — never publishes anything. */
export async function resetFailedSocialPostToDraftAction(postId: string) {
  const admin = await requireAdmin();
  const post = await prisma.socialPost.findUniqueOrThrow({ where: { id: postId }, select: { status: true } });
  if (post.status !== "FAILED") return;

  await prisma.socialPost.update({ where: { id: postId }, data: { status: "DRAFT" } });
  await logAdminAction(admin.id, "social_post.reset_to_draft", "SocialPost", postId);
  revalidatePath("/admin/campaigns");
}

// ---------------------------------------------------------------------------
// Automations & monitors
// ---------------------------------------------------------------------------

export async function setAutomationActiveAction(automationId: string, isActive: boolean) {
  const admin = await requireAdmin();
  await prisma.automation.update({ where: { id: automationId }, data: { isActive } });
  await logAdminAction(admin.id, isActive ? "automation.activated" : "automation.deactivated", "Automation", automationId);
  revalidatePath("/admin/operations");
}

export async function setMonitorActiveAction(monitorId: string, isActive: boolean) {
  const admin = await requireAdmin();
  await prisma.monitor.update({ where: { id: monitorId }, data: { isActive } });
  await logAdminAction(admin.id, isActive ? "monitor.activated" : "monitor.deactivated", "Monitor", monitorId);
  revalidatePath("/admin/operations");
}

// ---------------------------------------------------------------------------
// Integrations
// ---------------------------------------------------------------------------

export async function disconnectIntegrationAction(integrationId: string) {
  const admin = await requireAdmin();
  await prisma.integration.update({ where: { id: integrationId }, data: { status: "DISCONNECTED" } });
  await logAdminAction(admin.id, "integration.disconnected", "Integration", integrationId);
  revalidatePath("/admin/integrations");
}

/** Only for connections that are already broken — this never disconnects a healthy integration by deleting it. */
export async function deleteIntegrationAction(integrationId: string) {
  const admin = await requireAdmin();
  const integration = await prisma.integration.findUniqueOrThrow({
    where: { id: integrationId },
    select: { status: true },
  });
  if (integration.status !== "DISCONNECTED" && integration.status !== "ERROR") return;

  await prisma.integration.delete({ where: { id: integrationId } });
  await logAdminAction(admin.id, "integration.deleted", "Integration", integrationId);
  revalidatePath("/admin/integrations");
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export async function markNotificationReadAdminAction(notificationId: string) {
  await requireAdmin();
  await prisma.notification.update({ where: { id: notificationId }, data: { isRead: true } });
  revalidatePath("/admin/notifications");
}

export async function deleteNotificationAdminAction(notificationId: string) {
  await requireAdmin();
  await prisma.notification.delete({ where: { id: notificationId } });
  revalidatePath("/admin/notifications");
}

export async function deleteOldNotificationsAction(olderThanDays: number) {
  await requireAdmin();
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  await prisma.notification.deleteMany({ where: { createdAt: { lt: cutoff } } });
  revalidatePath("/admin/notifications");
}
