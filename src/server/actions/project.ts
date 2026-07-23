"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, requireProjectAccess } from "@/lib/permissions";
import { prisma } from "@/lib/db/prisma";
import { ensureWorkspaceForUser } from "@/server/services/workspace";
import { createProject } from "@/server/services/project";
import { createProjectSchema } from "@/lib/validation/project";

export interface ProjectFormState {
  error?: string;
}

export async function createProjectAction(
  _prevState: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  const user = await requireUser();
  const workspace = await ensureWorkspaceForUser(user.id, user.name);

  const parsed = createProjectSchema.safeParse({
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

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }

  let project;
  try {
    project = await createProject(user.id, workspace.id, parsed.data);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo crear el proyecto." };
  }

  revalidatePath("/dashboard");
  redirect(`/dashboard/${project.id}`);
}

export async function archiveProjectAction(projectId: string) {
  await requireProjectAccess(projectId, "OWNER");
  await prisma.project.update({ where: { id: projectId }, data: { status: "ARCHIVED" } });
  revalidatePath("/dashboard");
}
