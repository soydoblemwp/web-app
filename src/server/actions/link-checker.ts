"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/permissions";
import { assertSafeExternalUrl, UnsafeUrlError } from "@/lib/security/ssrf-guard";
import { executeLinkCheck } from "@/server/services/link-checker";

export interface LinkCheckFormState {
  error?: string;
}

export async function checkNewLinkAction(
  projectId: string,
  _prevState: LinkCheckFormState,
  formData: FormData
): Promise<LinkCheckFormState> {
  await requireProjectAccess(projectId, "EDITOR");

  const url = String(formData.get("url") ?? "").trim();
  if (!url) return { error: "La URL es obligatoria." };

  try {
    await assertSafeExternalUrl(url);
  } catch (error) {
    return { error: error instanceof UnsafeUrlError ? error.message : "URL no válida." };
  }

  const linkCheck = await prisma.linkCheck.create({ data: { projectId, url } });
  await executeLinkCheck(linkCheck.id);

  revalidatePath(`/dashboard/${projectId}/links`);
  return {};
}

export async function recheckLinkAction(projectId: string, linkCheckId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  await executeLinkCheck(linkCheckId);
  revalidatePath(`/dashboard/${projectId}/links`);
}

export async function toggleIgnoreLinkAction(projectId: string, linkCheckId: string, isIgnored: boolean) {
  await requireProjectAccess(projectId, "EDITOR");
  await prisma.linkCheck.update({ where: { id: linkCheckId }, data: { isIgnored } });
  revalidatePath(`/dashboard/${projectId}/links`);
}

export async function deleteLinkCheckAction(projectId: string, linkCheckId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  await prisma.linkCheck.delete({ where: { id: linkCheckId } });
  revalidatePath(`/dashboard/${projectId}/links`);
}
