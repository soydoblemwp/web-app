import "server-only";
import { prisma } from "@/lib/db/prisma";

const FREE_PLAN_DEFAULTS = {
  tier: "FREE" as const,
  name: "Gratis",
  maxProjects: 2,
  maxMembers: 3,
  maxAIGenerationsPerMonth: 50,
  maxAITokensPerMonth: 200_000,
  maxAutomations: 2,
  maxMonitors: 2,
  minMonitorFrequencyMinutes: 1440,
  maxIntegrations: 2,
  maxStorageMb: 500,
  maxCampaigns: 3,
  priceMonthlyCents: 0,
};

async function ensureFreePlan() {
  const existing = await prisma.plan.findUnique({ where: { tier: "FREE" } });
  if (existing) return existing;
  return prisma.plan.create({ data: FREE_PLAN_DEFAULTS });
}

function stripDiacritics(input: string): string {
  return Array.from(input)
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code < 0x0300 || code > 0x036f;
    })
    .join("");
}

function slugify(input: string): string {
  const base = stripDiacritics(input.toLowerCase().normalize("NFD"))
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return base || "workspace";
}

/**
 * Every user needs exactly one workspace to own projects. Created lazily on
 * first dashboard visit rather than at registration, so registration stays a
 * single fast write and this stays idempotent regardless of call site.
 */
export async function ensureWorkspaceForUser(userId: string, userName: string | null) {
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
  if (membership) return membership.workspace;

  const plan = await ensureFreePlan();
  const baseName = userName ? `Espacio de ${userName}` : "Mi espacio de trabajo";
  const baseSlug = slugify(baseName);
  let slug = baseSlug;
  let attempt = 0;
  while (await prisma.workspace.findUnique({ where: { slug } })) {
    attempt += 1;
    slug = `${baseSlug}-${attempt}`;
  }

  const workspace = await prisma.workspace.create({
    data: {
      name: baseName,
      slug,
      ownerId: userId,
      members: { create: { userId, role: "OWNER" } },
      subscription: { create: { planId: plan.id } },
    },
  });

  return workspace;
}
