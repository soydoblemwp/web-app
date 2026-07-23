"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/permissions";
import { updateBrandKitSchema } from "@/lib/validation/brand-kit";

export interface BrandKitFormState {
  error?: string;
  success?: boolean;
}

export async function updateBrandKitAction(
  projectId: string,
  _prevState: BrandKitFormState,
  formData: FormData
): Promise<BrandKitFormState> {
  await requireProjectAccess(projectId, "EDITOR");

  const colorsRaw = formData.get("colors");
  const colors =
    typeof colorsRaw === "string" && colorsRaw.trim().length > 0
      ? colorsRaw
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean)
      : [];

  const parsed = updateBrandKitSchema.safeParse({
    name: formData.get("name") ?? "",
    tagline: formData.get("tagline") ?? "",
    description: formData.get("description") ?? "",
    personality: formData.get("personality") ?? "",
    tone: formData.get("tone") ?? "",
    valueProposition: formData.get("valueProposition") ?? "",
    commonCTAs: formData.get("commonCTAs") ?? "",
    primaryLinks: formData.get("primaryLinks") ?? "",
    colors,
    fontReferences: formData.get("fontReferences") ?? "",
    competitors: formData.get("competitors") ?? "",
    additionalNotes: formData.get("additionalNotes") ?? "",
    approvedExamples: formData.get("approvedExamples") ?? "",
    isActiveForAI: formData.get("isActiveForAI") === "on",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }

  const data = parsed.data;
  await prisma.brandKit.update({
    where: { projectId },
    data: {
      name: data.name || null,
      tagline: data.tagline || null,
      description: data.description || null,
      personality: data.personality || null,
      tone: data.tone || null,
      valueProposition: data.valueProposition || null,
      commonCTAs: data.commonCTAs || null,
      primaryLinks: data.primaryLinks || null,
      colors: data.colors,
      fontReferences: data.fontReferences || null,
      competitors: data.competitors || null,
      additionalNotes: data.additionalNotes || null,
      approvedExamples: data.approvedExamples || null,
      isActiveForAI: data.isActiveForAI,
    },
  });

  revalidatePath(`/dashboard/${projectId}/brand-kit`);
  return { success: true };
}

export async function addBrandTermAction(projectId: string, formData: FormData) {
  await requireProjectAccess(projectId, "EDITOR");
  const term = String(formData.get("term") ?? "").trim();
  if (!term) return;
  const isForbidden = formData.get("isForbidden") === "on";

  const brandKit = await prisma.brandKit.findUnique({ where: { projectId } });
  if (!brandKit) return;

  await prisma.brandTerm.create({ data: { brandKitId: brandKit.id, term, isForbidden } });
  revalidatePath(`/dashboard/${projectId}/brand-kit`);
}

export async function deleteBrandTermAction(projectId: string, termId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  await prisma.brandTerm.delete({ where: { id: termId } });
  revalidatePath(`/dashboard/${projectId}/brand-kit`);
}
