import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { WorkflowStep } from "@/lib/ai-workflows/engine";
import { ASSISTANT_CONTEXT_WORKFLOW_LIMIT } from "@/lib/ai-workflows/assistant-context";

/** Prisma's `Json` column is typed as unknown at the boundary — steps are always written by createWorkflowAction/updateWorkflowAction as a validated WorkflowStep[], so this cast is safe here and nowhere else. */
function toSteps(steps: unknown): WorkflowStep[] {
  return Array.isArray(steps) ? (steps as WorkflowStep[]) : [];
}

/** Every Workflow visible to this user within the given project: their own global workflows (projectId null) plus their own workflows scoped to this project. Never another user's rows. */
export async function listWorkflowsForUser(userId: string, projectId: string) {
  const rows = await prisma.workflow.findMany({
    where: { userId, OR: [{ projectId }, { projectId: null }] },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map((row) => ({ ...row, steps: toSteps(row.steps) }));
}

export async function getWorkflowForUser(id: string, userId: string) {
  const row = await prisma.workflow.findUnique({ where: { id } });
  if (!row || row.userId !== userId) return null;
  return { ...row, steps: toSteps(row.steps) };
}

/** Bounded, favorites-first selection used to build Chat IA's assistant context (see src/lib/ai-workflows/assistant-context.ts). */
export async function listWorkflowsForAssistantContext(userId: string, projectId: string) {
  const rows = await prisma.workflow.findMany({
    where: { userId, OR: [{ projectId }, { projectId: null }] },
    orderBy: [{ isFavorite: "desc" }, { updatedAt: "desc" }],
    take: ASSISTANT_CONTEXT_WORKFLOW_LIMIT,
  });
  return rows.map((row) => ({ ...row, steps: toSteps(row.steps) }));
}
