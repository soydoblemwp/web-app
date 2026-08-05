"use server";

import { requireProjectAccess } from "@/lib/permissions";
import { listAgentRuns, getAgentRunDetail, type AgentRunFilters } from "@/server/services/agent-runs";
import { listCustomAgents, getCustomAgent, listTeams, getTeam, listOfficialAgents, listFavoriteAgentRefs } from "@/server/services/agent-catalog";
import { listAgentMemory } from "@/server/services/agent-memory";

export async function listAgentRunsAction(projectId: string, filters: AgentRunFilters = {}) {
  await requireProjectAccess(projectId, "VIEWER");
  return listAgentRuns(projectId, filters);
}

export async function getAgentRunDetailAction(projectId: string, runId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  const run = await getAgentRunDetail(runId);
  if (!run || run.projectId !== projectId) return null;
  return run;
}

export async function listOfficialAgentsAction(projectId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return listOfficialAgents().map((a) => ({
    key: a.key,
    name: a.name,
    description: a.description,
    category: a.category,
    capabilities: a.capabilities,
    outputType: a.outputType,
    active: a.active,
  }));
}

export async function listCustomAgentsAction(projectId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return listCustomAgents(projectId);
}

export async function getCustomAgentAction(projectId: string, agentId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return getCustomAgent(projectId, agentId);
}

export async function listAgentTeamsAction(projectId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return listTeams(projectId);
}

export async function getAgentTeamAction(projectId: string, teamId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return getTeam(projectId, teamId);
}

export async function listAgentMemoryAction(projectId: string, agentRef?: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return listAgentMemory(projectId, agentRef);
}

export async function listFavoriteAgentRefsAction(projectId: string) {
  const user = await requireProjectAccess(projectId, "VIEWER");
  return listFavoriteAgentRefs(user.id);
}
