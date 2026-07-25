"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/permissions";
import { createBrandProfileSchema, updateBrandProfileSchema } from "@/lib/validation/brand-profiles";
import { listBrandProfilesForUser } from "@/server/services/brand-profiles";

export interface BrandProfileActionState {
  error?: string;
  /** The real, server-created/duplicated BrandProfile id — the UI must use this, never a client-guessed value. */
  id?: string;
}

function brandKitsPath(projectId: string) {
  return `/dashboard/${projectId}/brand-kits`;
}

/** Same "not mine == doesn't exist" shape as getOwnedPrompt/getOwnedTemplate — no cross-user existence leak. */
async function getOwnedProfile(id: string, userId: string) {
  const profile = await prisma.brandProfile.findUnique({ where: { id } });
  if (!profile || profile.userId !== userId) return null;
  return profile;
}

function toNullableFields(data: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value || null]));
}

export interface CreateBrandProfileInput {
  /** The project the Brand Kits page is currently open in — access-checked; BrandProfile itself is user-scoped, not project-scoped. */
  projectId: string;
  name: string;
  description?: string;
  mission?: string;
  vision?: string;
  values?: string[];
  targetAudience?: string;
  tone?: string;
  personality?: string;
  primaryLanguage?: string;
  country?: string;
  allowedWords?: string[];
  forbiddenWords?: string[];
  writingStyle?: string;
  preferredCTAs?: string[];
  socialLinks?: string[];
  website?: string;
  email?: string;
  colors?: string[];
  typography?: string;
  logoUrl?: string;
  internalNotes?: string;
}

/** The user's very first Brand Kit is always their default — there's no meaningful "no default" state once at least one exists. */
export async function createBrandProfileAction(input: CreateBrandProfileInput): Promise<BrandProfileActionState> {
  const user = await requireProjectAccess(input.projectId, "VIEWER");

  const parsed = createBrandProfileSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const existingCount = await prisma.brandProfile.count({ where: { userId: user.id } });

  const {
    description,
    mission,
    vision,
    targetAudience,
    tone,
    personality,
    primaryLanguage,
    country,
    writingStyle,
    website,
    email,
    typography,
    logoUrl,
    internalNotes,
    ...rest
  } = parsed.data;

  const created = await prisma.brandProfile.create({
    data: {
      userId: user.id,
      name: parsed.data.name,
      ...toNullableFields({
        description,
        mission,
        vision,
        targetAudience,
        tone,
        personality,
        primaryLanguage,
        country,
        writingStyle,
        website,
        email,
        typography,
        logoUrl,
        internalNotes,
      }),
      values: rest.values,
      allowedWords: rest.allowedWords,
      forbiddenWords: rest.forbiddenWords,
      preferredCTAs: rest.preferredCTAs,
      socialLinks: rest.socialLinks,
      colors: rest.colors,
      isDefault: existingCount === 0,
    },
  });

  revalidatePath(brandKitsPath(input.projectId));
  return { id: created.id };
}

export async function updateBrandProfileAction(
  projectId: string,
  id: string,
  input: Partial<Omit<CreateBrandProfileInput, "projectId">>
): Promise<BrandProfileActionState> {
  const user = await requireProjectAccess(projectId, "VIEWER");

  const existing = await getOwnedProfile(id, user.id);
  if (!existing) return { error: "Brand Kit no encontrado." };

  const parsed = updateBrandProfileSchema.safeParse({ id, ...input });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const {
    name,
    description,
    mission,
    vision,
    values,
    targetAudience,
    tone,
    personality,
    primaryLanguage,
    country,
    allowedWords,
    forbiddenWords,
    writingStyle,
    preferredCTAs,
    socialLinks,
    website,
    email,
    colors,
    typography,
    logoUrl,
    internalNotes,
  } = parsed.data;

  await prisma.brandProfile.update({
    where: { id },
    data: {
      name: name ?? existing.name,
      description: description !== undefined ? description || null : existing.description,
      mission: mission !== undefined ? mission || null : existing.mission,
      vision: vision !== undefined ? vision || null : existing.vision,
      values: values ?? existing.values,
      targetAudience: targetAudience !== undefined ? targetAudience || null : existing.targetAudience,
      tone: tone !== undefined ? tone || null : existing.tone,
      personality: personality !== undefined ? personality || null : existing.personality,
      primaryLanguage: primaryLanguage !== undefined ? primaryLanguage || null : existing.primaryLanguage,
      country: country !== undefined ? country || null : existing.country,
      allowedWords: allowedWords ?? existing.allowedWords,
      forbiddenWords: forbiddenWords ?? existing.forbiddenWords,
      writingStyle: writingStyle !== undefined ? writingStyle || null : existing.writingStyle,
      preferredCTAs: preferredCTAs ?? existing.preferredCTAs,
      socialLinks: socialLinks ?? existing.socialLinks,
      website: website !== undefined ? website || null : existing.website,
      email: email !== undefined ? email || null : existing.email,
      colors: colors ?? existing.colors,
      typography: typography !== undefined ? typography || null : existing.typography,
      logoUrl: logoUrl !== undefined ? logoUrl || null : existing.logoUrl,
      internalNotes: internalNotes !== undefined ? internalNotes || null : existing.internalNotes,
    },
  });

  revalidatePath(brandKitsPath(projectId));
  return { id };
}

export async function deleteBrandProfileAction(projectId: string, id: string): Promise<BrandProfileActionState> {
  const user = await requireProjectAccess(projectId, "VIEWER");

  const existing = await getOwnedProfile(id, user.id);
  if (!existing) return { error: "Brand Kit no encontrado." };

  await prisma.brandProfile.delete({ where: { id } });

  revalidatePath(brandKitsPath(projectId));
  return {};
}

export async function duplicateBrandProfileAction(projectId: string, id: string): Promise<BrandProfileActionState> {
  const user = await requireProjectAccess(projectId, "VIEWER");

  const existing = await getOwnedProfile(id, user.id);
  if (!existing) return { error: "Brand Kit no encontrado." };

  const copy = await prisma.brandProfile.create({
    data: {
      userId: user.id,
      name: `${existing.name} (copia)`,
      description: existing.description,
      mission: existing.mission,
      vision: existing.vision,
      values: existing.values,
      targetAudience: existing.targetAudience,
      tone: existing.tone,
      personality: existing.personality,
      primaryLanguage: existing.primaryLanguage,
      country: existing.country,
      allowedWords: existing.allowedWords,
      forbiddenWords: existing.forbiddenWords,
      writingStyle: existing.writingStyle,
      preferredCTAs: existing.preferredCTAs,
      socialLinks: existing.socialLinks,
      website: existing.website,
      email: existing.email,
      colors: existing.colors,
      typography: existing.typography,
      logoUrl: existing.logoUrl,
      internalNotes: existing.internalNotes,
      // A duplicate never silently steals the default — the user picks explicitly via setDefaultBrandProfileAction.
      isDefault: false,
    },
  });

  revalidatePath(brandKitsPath(projectId));
  return { id: copy.id };
}

/**
 * Read-only fetch for client components that need the user's Brand Kits
 * without a Server Component round-trip — the "Seleccionar Brand Kit"
 * control every AI Center tool gets via AiGenerationForm calls this on
 * mount. Reuses listBrandProfilesForUser (never a second query).
 */
export async function listBrandProfilesForSelectAction(projectId: string) {
  const user = await requireProjectAccess(projectId, "VIEWER");
  return listBrandProfilesForUser(user.id);
}

/** Exactly one BrandProfile per user can be default at a time — unset every other one in the same transaction. */
export async function setDefaultBrandProfileAction(projectId: string, id: string): Promise<BrandProfileActionState> {
  const user = await requireProjectAccess(projectId, "VIEWER");

  const existing = await getOwnedProfile(id, user.id);
  if (!existing) return { error: "Brand Kit no encontrado." };

  await prisma.$transaction([
    prisma.brandProfile.updateMany({ where: { userId: user.id, isDefault: true }, data: { isDefault: false } }),
    prisma.brandProfile.update({ where: { id }, data: { isDefault: true } }),
  ]);

  revalidatePath(brandKitsPath(projectId));
  return { id };
}
