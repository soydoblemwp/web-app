"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/permissions";
import { updateProjectSchema } from "@/lib/validation/project";

export interface ProjectSettingsFormState {
  error?: string;
  success?: string;
}

export async function updateProjectSettingsAction(
  projectId: string,
  _prevState: ProjectSettingsFormState,
  formData: FormData
): Promise<ProjectSettingsFormState> {
  await requireProjectAccess(projectId, "MANAGER");

  const parsed = updateProjectSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    website: formData.get("website") ?? "",
    industry: formData.get("industry") ?? "",
    targetAudience: formData.get("targetAudience") ?? "",
    primaryLanguage: formData.get("primaryLanguage") || "es",
    market: formData.get("market") ?? "",
    timezone: formData.get("timezone") || "UTC",
    tone: formData.get("tone") ?? "",
    goals: formData.get("goals") ?? "",
  });

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };

  const data = parsed.data;
  await prisma.project.update({
    where: { id: projectId },
    data: {
      name: data.name,
      description: data.description || null,
      website: data.website || null,
      industry: data.industry || null,
      targetAudience: data.targetAudience || null,
      primaryLanguage: data.primaryLanguage,
      market: data.market || null,
      timezone: data.timezone,
      tone: data.tone || null,
      goals: data.goals || null,
    },
  });

  revalidatePath(`/dashboard/${projectId}/settings`);
  return { success: "Proyecto actualizado." };
}

export interface AddMemberFormState {
  error?: string;
  success?: string;
}

export async function addProjectMemberAction(
  projectId: string,
  _prevState: AddMemberFormState,
  formData: FormData
): Promise<AddMemberFormState> {
  await requireProjectAccess(projectId, "MANAGER");

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "EDITOR");
  if (!email) return { error: "Introduce un correo electrónico." };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return { error: "No existe ninguna cuenta con ese correo. La persona debe registrarse primero." };

  const existing = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
  });
  if (existing) return { error: "Esta persona ya es miembro del proyecto." };

  await prisma.projectMember.create({ data: { projectId, userId: user.id, role: role as never } });
  revalidatePath(`/dashboard/${projectId}/settings`);
  return { success: `${email} añadido al proyecto.` };
}

export async function removeProjectMemberAction(projectId: string, memberId: string) {
  await requireProjectAccess(projectId, "MANAGER");
  await prisma.projectMember.delete({ where: { id: memberId } });
  revalidatePath(`/dashboard/${projectId}/settings`);
}

export async function archiveProjectSettingsAction(projectId: string) {
  await requireProjectAccess(projectId, "OWNER");
  await prisma.project.update({ where: { id: projectId }, data: { status: "ARCHIVED" } });
  revalidatePath("/dashboard");
}
