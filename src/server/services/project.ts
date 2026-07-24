import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ForbiddenError, getProjectRole } from "@/lib/permissions";
import type { CreateProjectInput } from "@/lib/validation/project";

export async function listProjectsForUser(userId: string) {
  return prisma.project.findMany({
    where: { members: { some: { userId } } },
    orderBy: { updatedAt: "desc" },
  });
}

/**
 * Used by the normal (non-admin) app only. Deliberately requires real
 * membership regardless of platform role — ADMIN/SUPER_ADMIN see only their
 * own projects here, same as any other user. Global cross-user visibility
 * belongs exclusively to /admin (see src/app/admin/projects/[projectId]),
 * which queries Prisma directly instead of going through this function.
 */
export async function getProjectForUser(userId: string, projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { brandKit: true },
  });
  if (!project) return null;
  const role = await getProjectRole(userId, projectId);
  if (!role) return null;
  return project;
}

const FREE_PLAN_PROJECT_LIMIT_FALLBACK = 2;

export async function createProject(
  userId: string,
  workspaceId: string,
  input: CreateProjectInput
) {
  const subscription = await prisma.subscription.findUnique({
    where: { workspaceId },
    include: { plan: true },
  });
  const maxProjects = subscription?.plan.maxProjects ?? FREE_PLAN_PROJECT_LIMIT_FALLBACK;

  const currentCount = await prisma.project.count({ where: { workspaceId } });
  if (currentCount >= maxProjects) {
    throw new ForbiddenError(
      `Tu plan permite un máximo de ${maxProjects} proyectos. Actualiza tu plan para crear más.`
    );
  }

  return prisma.project.create({
    data: {
      workspaceId,
      ownerId: userId,
      name: input.name,
      description: input.description || null,
      website: input.website || null,
      industry: input.industry || null,
      targetAudience: input.targetAudience || null,
      primaryLanguage: input.primaryLanguage,
      market: input.market || null,
      timezone: input.timezone,
      tone: input.tone || null,
      goals: input.goals || null,
      members: { create: { userId, role: "OWNER" } },
      brandKit: { create: {} },
    },
  });
}
