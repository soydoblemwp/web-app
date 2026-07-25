import "server-only";
import { prisma } from "@/lib/db/prisma";

/**
 * Low-level, DB-only revision lookups — split out from workflow-lifecycle.ts
 * so workflow-resources.ts (which needs these to resolve a "workflow" step's
 * frozen child reference) can import them without creating a circular
 * dependency (workflow-lifecycle.ts itself imports FROM workflow-resources.ts
 * for publish-time validation). workflow-lifecycle.ts re-exports both
 * functions so every existing importer's path keeps working unchanged.
 */

async function getOwnedWorkflowRow(workflowId: string, userId: string) {
  const workflow = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (!workflow || workflow.userId !== userId) return null;
  return workflow;
}

/** The single active, PUBLISHED revision for a workflow — the one real ("published") executions read from. Ownership-checked twice over (workflow row + revision row), "not mine"/"doesn't exist" both resolve to null. */
export async function getActiveRevisionForWorkflow(workflowId: string, userId: string) {
  const workflow = await getOwnedWorkflowRow(workflowId, userId);
  if (!workflow || !workflow.activeRevisionId) return null;
  const revision = await prisma.workflowRevision.findUnique({ where: { id: workflow.activeRevisionId } });
  if (!revision || revision.userId !== userId) return null;
  return revision;
}

/** Any specific, historical revision — used for "specific version" SubWorkflow references and for the Versions/rollback UI. */
export async function getRevisionForUser(input: { userId: string; projectId: string; workflowId: string; revisionId: string }) {
  const revision = await prisma.workflowRevision.findUnique({ where: { id: input.revisionId } });
  if (!revision || revision.userId !== input.userId || revision.workflowId !== input.workflowId || revision.projectId !== input.projectId) {
    return null;
  }
  return revision;
}
