"use server";

import { requireProjectAccess } from "@/lib/permissions";
import { createAgentMemorySchema } from "@/lib/validation/agents";
import { saveAgentMemory, setAgentMemoryActive, deleteAgentMemory, updateAgentMemoryContent } from "@/server/services/agent-memory";

/** Saving IS the user's approval — there is no separate "approve a pending proposal" step; a proposal the user didn't save never becomes a row (spec section 15). */
export async function saveAgentMemoryAction(projectId: string, input: unknown): Promise<{ error?: string; id?: string }> {
  const parsed = createAgentMemorySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  const user = await requireProjectAccess(projectId, "EDITOR");
  const memory = await saveAgentMemory(projectId, user.id, parsed.data);
  return { id: memory.id };
}

export async function setAgentMemoryActiveAction(projectId: string, memoryId: string, isActive: boolean): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  return setAgentMemoryActive(projectId, memoryId, isActive);
}

export async function deleteAgentMemoryAction(projectId: string, memoryId: string): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  return deleteAgentMemory(projectId, memoryId);
}

export async function updateAgentMemoryContentAction(projectId: string, memoryId: string, content: string): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  if (!content.trim()) return { error: "El contenido no puede estar vacío." };
  return updateAgentMemoryContent(projectId, memoryId, content.trim());
}
