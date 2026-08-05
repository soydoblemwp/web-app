"use server";

import { requireProjectAccess } from "@/lib/permissions";
import { createTeamSchema, updateTeamSchema } from "@/lib/validation/agents";
import { createTeam, updateTeam, duplicateTeam, setTeamStatus } from "@/server/services/agent-catalog";

export async function createAgentTeamAction(projectId: string, input: unknown): Promise<{ error?: string; id?: string }> {
  const parsed = createTeamSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  const user = await requireProjectAccess(projectId, "EDITOR");
  return createTeam(projectId, user.id, parsed.data);
}

export async function updateAgentTeamAction(projectId: string, teamId: string, input: unknown): Promise<{ error?: string }> {
  const parsed = updateTeamSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  await requireProjectAccess(projectId, "EDITOR");
  return updateTeam(projectId, teamId, parsed.data);
}

export async function duplicateAgentTeamAction(projectId: string, teamId: string): Promise<{ error?: string; id?: string }> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  return duplicateTeam(projectId, user.id, teamId);
}

export async function setAgentTeamStatusAction(projectId: string, teamId: string, status: "ACTIVE" | "INACTIVE" | "ARCHIVED"): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  return setTeamStatus(projectId, teamId, status);
}
