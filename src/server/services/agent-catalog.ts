import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { findAgentDefinition, listAgentDefinitions, OFFICIAL_TEAM_BLUEPRINTS } from "@/lib/agents/registry";
import type { AgentDefinition, AgentInputFieldSpec, OutputFieldSpec } from "@/lib/agents/types";
import type { CreateAgentInput } from "@/lib/validation/agents";

const memberSelect = { id: true, name: true, email: true, image: true } as const;

/** A resolved agent — either the official code-defined one or a custom DB row, normalized into the same shape callers need (spec section 26: official agents referenced by stable key, custom ones persisted). */
export interface ResolvedAgent {
  ref: string;
  isOfficial: boolean;
  name: string;
  description: string;
  category: string;
  systemInstructions: string;
  requiredInputs: AgentInputFieldSpec[];
  optionalInputs: AgentInputFieldSpec[];
  outputType: string;
  outputFields: OutputFieldSpec[];
  brandProfileId: string | null;
  language: string;
  requireApproval: boolean;
  status: string;
}

function fromOfficial(def: AgentDefinition): ResolvedAgent {
  return {
    ref: def.key,
    isOfficial: true,
    name: def.name,
    description: def.description,
    category: def.category,
    systemInstructions: def.systemInstructions,
    requiredInputs: def.requiredInputs,
    optionalInputs: def.optionalInputs,
    outputType: def.outputType,
    outputFields: def.outputFields,
    brandProfileId: null,
    language: def.defaultLanguage,
    requireApproval: false,
    status: def.active ? "ACTIVE" : "INACTIVE",
  };
}

function fromCustom(agent: NonNullable<Awaited<ReturnType<typeof prisma.aiAgent.findUnique>>>): ResolvedAgent {
  return {
    ref: agent.id,
    isOfficial: false,
    name: agent.name,
    description: agent.description,
    category: agent.category,
    systemInstructions: agent.systemInstructions,
    requiredInputs: (agent.inputSchema as unknown as AgentInputFieldSpec[]).filter((f) => f.required),
    optionalInputs: (agent.inputSchema as unknown as AgentInputFieldSpec[]).filter((f) => !f.required),
    outputType: agent.outputType.toLowerCase(),
    // Custom agents don't declare a marker-field output schema in the UI (too advanced for a form) — they reuse the generic single "text" output field, still going through the exact same validated pipeline as official agents.
    outputFields: [{ marker: "RESULTADO", field: "text", kind: "text", maxLength: 20000 }],
    brandProfileId: agent.brandProfileId,
    language: agent.language,
    requireApproval: agent.requireApproval,
    status: agent.status,
  };
}

/** Resolves an agentRef (official key OR custom AiAgent.id) into a normalized shape — the single place a run/team-member reference gets turned into something executable. Returns null for an unknown/inactive/other-project agent, never trusting the ref blindly. */
export async function resolveAgent(projectId: string, agentRef: string): Promise<ResolvedAgent | null> {
  const official = findAgentDefinition(agentRef);
  if (official) return official.active ? fromOfficial(official) : null;

  const custom = await prisma.aiAgent.findUnique({ where: { id: agentRef } });
  if (!custom || custom.projectId !== projectId) return null;
  return fromCustom(custom);
}

export function listOfficialAgents() {
  return listAgentDefinitions();
}

export async function listCustomAgents(projectId: string) {
  return prisma.aiAgent.findMany({
    where: { projectId, status: { not: "ARCHIVED" } },
    orderBy: { updatedAt: "desc" },
    include: { createdBy: { select: memberSelect } },
  });
}

export async function getCustomAgent(projectId: string, agentId: string) {
  const agent = await prisma.aiAgent.findUnique({ where: { id: agentId }, include: { createdBy: { select: memberSelect } } });
  if (!agent || agent.projectId !== projectId) return null;
  return agent;
}

export async function createCustomAgent(projectId: string, userId: string, input: CreateAgentInput) {
  return prisma.aiAgent.create({
    data: {
      projectId,
      createdById: userId,
      name: input.name,
      description: input.description,
      icon: input.icon,
      category: input.category,
      objective: input.objective || null,
      systemInstructions: input.systemInstructions,
      inputSchema: input.inputSchema as unknown as Prisma.InputJsonValue,
      outputType: input.outputType.toUpperCase() as never,
      brandProfileId: input.brandProfileId ?? null,
      language: input.language,
      creativity: input.creativity,
      allowedTools: input.allowedTools,
      reviewerAgentRef: input.reviewerAgentRef ?? null,
      requireApproval: input.requireApproval,
      maxSteps: input.maxSteps,
      visibility: input.visibility,
    },
  });
}

export async function updateCustomAgent(projectId: string, agentId: string, input: Partial<CreateAgentInput>) {
  const agent = await getCustomAgent(projectId, agentId);
  if (!agent) return { error: "Agente no encontrado." };

  await prisma.aiAgent.update({
    where: { id: agentId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.icon !== undefined ? { icon: input.icon } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.objective !== undefined ? { objective: input.objective || null } : {}),
      ...(input.systemInstructions !== undefined ? { systemInstructions: input.systemInstructions } : {}),
      ...(input.inputSchema !== undefined ? { inputSchema: input.inputSchema as unknown as Prisma.InputJsonValue } : {}),
      ...(input.outputType !== undefined ? { outputType: input.outputType.toUpperCase() as never } : {}),
      ...(input.brandProfileId !== undefined ? { brandProfileId: input.brandProfileId } : {}),
      ...(input.language !== undefined ? { language: input.language } : {}),
      ...(input.creativity !== undefined ? { creativity: input.creativity } : {}),
      ...(input.allowedTools !== undefined ? { allowedTools: input.allowedTools } : {}),
      ...(input.reviewerAgentRef !== undefined ? { reviewerAgentRef: input.reviewerAgentRef } : {}),
      ...(input.requireApproval !== undefined ? { requireApproval: input.requireApproval } : {}),
      ...(input.maxSteps !== undefined ? { maxSteps: input.maxSteps } : {}),
      ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
    },
  });
  return {};
}

export async function duplicateCustomAgent(projectId: string, userId: string, agentId: string) {
  const agent = await getCustomAgent(projectId, agentId);
  if (!agent) return { error: "Agente no encontrado." };

  const created = await prisma.aiAgent.create({
    data: {
      projectId,
      createdById: userId,
      name: `${agent.name} (copia)`,
      description: agent.description,
      icon: agent.icon,
      category: agent.category,
      objective: agent.objective,
      systemInstructions: agent.systemInstructions,
      inputSchema: agent.inputSchema as Prisma.InputJsonValue,
      outputType: agent.outputType,
      brandProfileId: agent.brandProfileId,
      language: agent.language,
      creativity: agent.creativity,
      allowedTools: agent.allowedTools,
      reviewerAgentRef: agent.reviewerAgentRef,
      requireApproval: agent.requireApproval,
      maxSteps: agent.maxSteps,
      visibility: agent.visibility,
    },
  });
  return { id: created.id };
}

export async function setCustomAgentStatus(projectId: string, agentId: string, status: "ACTIVE" | "INACTIVE" | "ARCHIVED") {
  const agent = await getCustomAgent(projectId, agentId);
  if (!agent) return { error: "Agente no encontrado." };
  await prisma.aiAgent.update({ where: { id: agentId }, data: { status } });
  return {};
}

/** Safe delete — refuses if the agent has run history (archive instead), never orphans AiAgentRun rows. */
export async function deleteCustomAgent(projectId: string, agentId: string) {
  const agent = await getCustomAgent(projectId, agentId);
  if (!agent) return { error: "Agente no encontrado." };
  const runCount = await prisma.aiAgentRun.count({ where: { customAgentId: agentId } });
  if (runCount > 0) return { error: "Este agente tiene ejecuciones asociadas — archívalo en vez de eliminarlo." };
  await prisma.aiAgent.delete({ where: { id: agentId } });
  return {};
}

export async function saveCustomAgentAsTemplate(projectId: string, userId: string, agentId: string) {
  const agent = await getCustomAgent(projectId, agentId);
  if (!agent) return { error: "Agente no encontrado." };
  const created = await prisma.aiAgent.create({
    data: {
      projectId,
      createdById: userId,
      name: `${agent.name} (plantilla)`,
      description: agent.description,
      icon: agent.icon,
      category: agent.category,
      objective: agent.objective,
      systemInstructions: agent.systemInstructions,
      inputSchema: agent.inputSchema as Prisma.InputJsonValue,
      outputType: agent.outputType,
      brandProfileId: agent.brandProfileId,
      language: agent.language,
      creativity: agent.creativity,
      allowedTools: agent.allowedTools,
      reviewerAgentRef: agent.reviewerAgentRef,
      requireApproval: agent.requireApproval,
      maxSteps: agent.maxSteps,
      visibility: agent.visibility,
      isTemplate: true,
      templateSourceId: agent.id,
    },
  });
  return { id: created.id };
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

export async function listTeams(projectId: string) {
  await ensureOfficialTeamBlueprints(projectId);
  return prisma.aiAgentTeam.findMany({
    where: { projectId, status: { not: "ARCHIVED" } },
    orderBy: { updatedAt: "desc" },
    include: { members: { orderBy: { order: "asc" } }, createdBy: { select: memberSelect } },
  });
}

export async function getTeam(projectId: string, teamId: string) {
  const team = await prisma.aiAgentTeam.findUnique({
    where: { id: teamId },
    include: { members: { orderBy: { order: "asc" } }, createdBy: { select: memberSelect } },
  });
  if (!team || team.projectId !== projectId) return null;
  return team;
}

interface TeamMemberInput {
  agentRef: string;
  order: number;
  enabled: boolean;
  requireApproval: boolean;
}
interface TeamInput {
  name: string;
  description?: string;
  objective?: string;
  coordinatorAgentRef: string;
  reviewerAgentRef?: string | null;
  errorStrategy: "STOP_ON_ERROR" | "CONTINUE_INDEPENDENT_BRANCHES";
  members: TeamMemberInput[];
}

export async function createTeam(projectId: string, userId: string, input: TeamInput) {
  const team = await prisma.aiAgentTeam.create({
    data: {
      projectId,
      createdById: userId,
      name: input.name,
      description: input.description || null,
      objective: input.objective || null,
      coordinatorAgentRef: input.coordinatorAgentRef,
      reviewerAgentRef: input.reviewerAgentRef ?? null,
      errorStrategy: input.errorStrategy,
      members: { create: input.members.map((m) => ({ agentRef: m.agentRef, order: m.order, enabled: m.enabled, requireApproval: m.requireApproval })) },
    },
  });
  return { id: team.id };
}

export async function updateTeam(projectId: string, teamId: string, input: Partial<TeamInput>) {
  const team = await getTeam(projectId, teamId);
  if (!team) return { error: "Equipo no encontrado." };

  await prisma.$transaction([
    prisma.aiAgentTeam.update({
      where: { id: teamId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(input.objective !== undefined ? { objective: input.objective || null } : {}),
        ...(input.coordinatorAgentRef !== undefined ? { coordinatorAgentRef: input.coordinatorAgentRef } : {}),
        ...(input.reviewerAgentRef !== undefined ? { reviewerAgentRef: input.reviewerAgentRef } : {}),
        ...(input.errorStrategy !== undefined ? { errorStrategy: input.errorStrategy } : {}),
      },
    }),
    ...(input.members
      ? [
          prisma.aiAgentTeamMember.deleteMany({ where: { teamId } }),
          prisma.aiAgentTeamMember.createMany({
            data: input.members.map((m) => ({ teamId, agentRef: m.agentRef, order: m.order, enabled: m.enabled, requireApproval: m.requireApproval })),
          }),
        ]
      : []),
  ]);
  return {};
}

export async function duplicateTeam(projectId: string, userId: string, teamId: string) {
  const team = await getTeam(projectId, teamId);
  if (!team) return { error: "Equipo no encontrado." };
  const created = await prisma.aiAgentTeam.create({
    data: {
      projectId,
      createdById: userId,
      name: `${team.name} (copia)`,
      description: team.description,
      objective: team.objective,
      coordinatorAgentRef: team.coordinatorAgentRef,
      reviewerAgentRef: team.reviewerAgentRef,
      errorStrategy: team.errorStrategy,
      members: { create: team.members.map((m) => ({ agentRef: m.agentRef, order: m.order, enabled: m.enabled, requireApproval: m.requireApproval })) },
    },
  });
  return { id: created.id };
}

export async function setTeamStatus(projectId: string, teamId: string, status: "ACTIVE" | "INACTIVE" | "ARCHIVED") {
  const team = await getTeam(projectId, teamId);
  if (!team) return { error: "Equipo no encontrado." };
  await prisma.aiAgentTeam.update({ where: { id: teamId }, data: { status } });
  return {};
}

/**
 * Favorites (spec section 2) — reuses the existing AiToolInteraction model
 * (already generic: a free-text `toolSlug` string + FAVORITE/RECENT_USE
 * type) instead of a new table, storing the agent's ref (official key or
 * custom AiAgent.id) in that same column. A dedicated function rather than
 * calling toggleAiToolFavoriteAction directly, since that one validates
 * against the AI Center tool registry, not this one.
 */
export async function toggleAgentFavorite(userId: string, projectId: string, agentRef: string) {
  const existing = await prisma.aiToolInteraction.findUnique({
    where: { userId_toolSlug_type: { userId, toolSlug: agentRef, type: "FAVORITE" } },
  });
  if (existing) {
    await prisma.aiToolInteraction.delete({ where: { id: existing.id } });
    return { favorited: false };
  }
  await prisma.aiToolInteraction.create({ data: { userId, projectId, toolSlug: agentRef, type: "FAVORITE" } });
  return { favorited: true };
}

export async function listFavoriteAgentRefs(userId: string): Promise<string[]> {
  const rows = await prisma.aiToolInteraction.findMany({ where: { userId, type: "FAVORITE" }, select: { toolSlug: true } });
  return rows.map((r) => r.toolSlug);
}

/** Creates the 3 official example teams (spec section 10) for a project the first time its team list is requested — idempotent via a name-based existence check, never duplicated on repeat visits. */
export async function ensureOfficialTeamBlueprints(projectId: string) {
  const existingNames = new Set(
    (await prisma.aiAgentTeam.findMany({ where: { projectId, name: { in: OFFICIAL_TEAM_BLUEPRINTS.map((b) => b.name) } }, select: { name: true } })).map(
      (t) => t.name
    )
  );
  const missing = OFFICIAL_TEAM_BLUEPRINTS.filter((b) => !existingNames.has(b.name));
  if (missing.length === 0) return;

  // A system-provisioned team still needs a createdById — the project owner is the closest honest attribution for a blueprint nobody personally authored.
  const owner = await prisma.projectMember.findFirst({ where: { projectId, role: "OWNER" }, select: { userId: true } });
  if (!owner) return;

  for (const blueprint of missing) {
    await prisma.aiAgentTeam.create({
      data: {
        projectId,
        createdById: owner.userId,
        name: blueprint.name,
        description: blueprint.description,
        coordinatorAgentRef: blueprint.coordinatorAgentRef,
        errorStrategy: "STOP_ON_ERROR",
        members: { create: blueprint.members.map((agentRef, index) => ({ agentRef, order: index, enabled: true, requireApproval: false })) },
      },
    });
  }
}
