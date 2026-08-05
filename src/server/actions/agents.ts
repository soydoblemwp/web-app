"use server";

import { requireProjectAccess } from "@/lib/permissions";
import { createAgentSchema, updateAgentSchema } from "@/lib/validation/agents";
import {
  createCustomAgent,
  updateCustomAgent,
  duplicateCustomAgent,
  setCustomAgentStatus,
  deleteCustomAgent,
  saveCustomAgentAsTemplate,
  toggleAgentFavorite,
} from "@/server/services/agent-catalog";

export async function createAgentAction(projectId: string, input: unknown): Promise<{ error?: string; id?: string }> {
  const parsed = createAgentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  const user = await requireProjectAccess(projectId, "EDITOR");
  const agent = await createCustomAgent(projectId, user.id, parsed.data);
  return { id: agent.id };
}

export async function updateAgentAction(projectId: string, agentId: string, input: unknown): Promise<{ error?: string }> {
  const parsed = updateAgentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  await requireProjectAccess(projectId, "EDITOR");
  return updateCustomAgent(projectId, agentId, parsed.data);
}

export async function duplicateAgentAction(projectId: string, agentId: string): Promise<{ error?: string; id?: string }> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  return duplicateCustomAgent(projectId, user.id, agentId);
}

export async function setAgentStatusAction(projectId: string, agentId: string, status: "ACTIVE" | "INACTIVE" | "ARCHIVED"): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  return setCustomAgentStatus(projectId, agentId, status);
}

export async function deleteAgentAction(projectId: string, agentId: string): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  return deleteCustomAgent(projectId, agentId);
}

export async function saveAgentAsTemplateAction(projectId: string, agentId: string): Promise<{ error?: string; id?: string }> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  return saveCustomAgentAsTemplate(projectId, user.id, agentId);
}

export async function toggleAgentFavoriteAction(projectId: string, agentRef: string): Promise<{ favorited: boolean }> {
  const user = await requireProjectAccess(projectId, "VIEWER");
  return toggleAgentFavorite(user.id, projectId, agentRef);
}
