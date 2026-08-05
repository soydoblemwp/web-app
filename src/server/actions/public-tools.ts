"use server";

import { prisma } from "@/lib/db/prisma";
import { getCurrentUser, requireProjectAccess } from "@/lib/permissions";
import { listProjectsForUser } from "@/server/services/project";
import { revalidatePath } from "next/cache";

export interface WorkspaceSaveContext {
  authenticated: boolean;
  projects: { id: string; name: string }[];
}

/**
 * Lets a public tool page (e.g. the Reutilizador de contenido) know, without
 * ever gating the tool itself behind auth, whether "Guardar en tu Workspace"
 * should be offered at all (spec section 22: never hide the result behind
 * registration — this is purely an optional follow-up action for a visitor
 * who happens to already be signed in).
 */
export async function getWorkspaceSaveContextAction(): Promise<WorkspaceSaveContext> {
  const user = await getCurrentUser();
  if (!user) return { authenticated: false, projects: [] };
  const projects = await listProjectsForUser(user.id);
  return { authenticated: true, projects: projects.map((p) => ({ id: p.id, name: p.name })) };
}

export interface SaveToolResultInput {
  title: string;
  body: string;
  sourceTool: string;
}

/**
 * Persists a public tool's already-generated result as a ContentItem, only
 * on explicit user action, only for an authenticated user with real access
 * to the chosen project — reuses the existing Workspace/ContentItem model
 * instead of creating a second saved-content system (spec section 35).
 */
export async function saveToolResultToWorkspaceAction(projectId: string, input: SaveToolResultInput): Promise<{ error?: string; id?: string }> {
  const user = await requireProjectAccess(projectId, "EDITOR");

  if (!input.title.trim()) return { error: "Falta un título para guardar el resultado." };
  if (!input.body.trim()) return { error: "No hay contenido que guardar." };

  const contentItem = await prisma.contentItem.create({
    data: {
      projectId,
      authorId: user.id,
      type: "ARTICLE",
      title: input.title.slice(0, 120),
      body: input.body,
      sourceTool: input.sourceTool,
    },
  });

  revalidatePath(`/dashboard/${projectId}/workspace`);
  return { id: contentItem.id };
}
