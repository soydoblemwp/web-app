import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { AiAgentMemoryType } from "@/generated/prisma/enums";

/**
 * Controlled memory (spec section 15) — never auto-saved. `saveMemory`'s
 * `approvedById` argument IS the user's approval; there is no separate
 * "propose then later approve" persistence step because a proposal that
 * was never saved leaves no row at all (the agent's suggestion lives only
 * in the run's transient UI state until the user clicks "Guardar como
 * memoria"). Always scoped to (projectId, agentRef) — never mixed across
 * projects or agents.
 */

export async function listAgentMemory(projectId: string, agentRef?: string) {
  return prisma.aiAgentMemory.findMany({
    where: { projectId, agentRef, isActive: true },
    orderBy: { createdAt: "desc" },
    include: { approvedBy: { select: { id: true, name: true, email: true } } },
  });
}

export async function saveAgentMemory(
  projectId: string,
  approvedById: string,
  input: { agentRef: string; type: AiAgentMemoryType; content: string; sourceRunId?: string | null }
) {
  return prisma.aiAgentMemory.create({
    data: {
      projectId,
      agentRef: input.agentRef,
      type: input.type,
      content: input.content,
      sourceRunId: input.sourceRunId ?? null,
      approvedById,
    },
  });
}

export async function setAgentMemoryActive(projectId: string, memoryId: string, isActive: boolean) {
  const memory = await prisma.aiAgentMemory.findUnique({ where: { id: memoryId } });
  if (!memory || memory.projectId !== projectId) return { error: "Memoria no encontrada." };
  await prisma.aiAgentMemory.update({ where: { id: memoryId }, data: { isActive } });
  return {};
}

export async function deleteAgentMemory(projectId: string, memoryId: string) {
  const memory = await prisma.aiAgentMemory.findUnique({ where: { id: memoryId } });
  if (!memory || memory.projectId !== projectId) return { error: "Memoria no encontrada." };
  await prisma.aiAgentMemory.delete({ where: { id: memoryId } });
  return {};
}

export async function updateAgentMemoryContent(projectId: string, memoryId: string, content: string) {
  const memory = await prisma.aiAgentMemory.findUnique({ where: { id: memoryId } });
  if (!memory || memory.projectId !== projectId) return { error: "Memoria no encontrada." };
  await prisma.aiAgentMemory.update({ where: { id: memoryId }, data: { content } });
  return {};
}

/** Renders active memory as extra system-prompt instructions for a given agent — small, bounded (active memory rows only), never the full history. */
export async function buildMemoryInstructions(projectId: string, agentRef: string): Promise<string[]> {
  const memories = await prisma.aiAgentMemory.findMany({ where: { projectId, agentRef, isActive: true }, orderBy: { createdAt: "desc" }, take: 20 });
  if (memories.length === 0) return [];
  return [`Memoria aprobada para este agente en este proyecto (respétala siempre):\n${memories.map((m) => `- (${m.type}) ${m.content}`).join("\n")}`];
}
