import "server-only";
import { prisma } from "@/lib/db/prisma";

/** Every BrandProfile owned by this user — never another user's rows. Default profile (if any) sorts first. */
export async function listBrandProfilesForUser(userId: string) {
  return prisma.brandProfile.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
  });
}

export async function getBrandProfileForUser(id: string, userId: string) {
  const profile = await prisma.brandProfile.findUnique({ where: { id } });
  if (!profile || profile.userId !== userId) return null;
  return profile;
}

/**
 * The profile every integration (AI Center's automatic fallback, Chat IA,
 * Prompt Library's "Usar Brand Kit", AI Templates' {{brand_*}} auto-fill)
 * uses when nothing more specific was picked. Returns null when the user
 * hasn't created any Brand Kit yet — every caller must treat that as "no
 * brand context available", never as an error.
 */
export async function getDefaultBrandProfileForUser(userId: string) {
  return prisma.brandProfile.findFirst({ where: { userId, isDefault: true } });
}
