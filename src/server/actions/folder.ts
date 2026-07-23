"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/permissions";

export async function createFolderAction(projectId: string, formData: FormData) {
  await requireProjectAccess(projectId, "EDITOR");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await prisma.folder.create({ data: { projectId, name: name.slice(0, 120) } });
  revalidatePath(`/dashboard/${projectId}/library`);
}

export async function deleteFolderAction(projectId: string, folderId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  await prisma.folder.delete({ where: { id: folderId } });
  revalidatePath(`/dashboard/${projectId}/library`);
}
