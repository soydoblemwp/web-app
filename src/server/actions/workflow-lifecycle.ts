"use server";

import { revalidatePath } from "next/cache";
import { requireProjectAccess } from "@/lib/permissions";
import { publishWorkflowSchema, restoreRevisionSchema } from "@/lib/validation/ai-workflows";
import type { PublishValidationResult } from "@/lib/ai-workflows/publish-validation";
import type { WorkflowDiffResult } from "@/lib/ai-workflows/workflow-diff";
import {
  validateWorkflowDraftForPublish,
  publishWorkflowDraft,
  listRevisionsForWorkflow,
  getRevisionForUser,
  compareDraftToActivePublished,
  compareTwoRevisions,
  restoreRevisionAsDraft,
  archiveWorkflow,
  restoreArchivedWorkflow,
  listWorkflowsUsedBy,
  listWorkflowsThatUse,
} from "@/server/services/workflow-lifecycle";

/**
 * "Publicar versión" / "Versiones" / "Restaurar esta versión" /
 * "Archivar" / "Restaurar Workflow" — every action here re-derives its own
 * authority from requireProjectAccess and the target workflowId; none ever
 * accepts a userId from the caller. Publishing and rollback additionally
 * verify the target workflow/revision belongs to the SAME workflowId the
 * caller is acting on, never a foreign one.
 */

function workflowsPath(projectId: string) {
  return `/dashboard/${projectId}/ai-workflows`;
}

export async function validateWorkflowForPublishAction(
  projectId: string,
  workflowId: string
): Promise<{ error: string } | { data: PublishValidationResult }> {
  const user = await requireProjectAccess(projectId, "VIEWER");
  const result = await validateWorkflowDraftForPublish({ userId: user.id, projectId, workflowId });
  if ("error" in result) return { error: result.error };
  return { data: result.result };
}

export interface PublishWorkflowActionInput {
  projectId: string;
  workflowId: string;
  releaseNotes?: string;
}

export async function publishWorkflowAction(input: PublishWorkflowActionInput) {
  const user = await requireProjectAccess(input.projectId, "VIEWER");
  const parsed = publishWorkflowSchema.safeParse({ workflowId: input.workflowId, releaseNotes: input.releaseNotes });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const result = await publishWorkflowDraft({
    userId: user.id,
    projectId: input.projectId,
    workflowId: parsed.data.workflowId,
    releaseNotes: parsed.data.releaseNotes || undefined,
  });

  if (!result.ok) return { error: result.error, validation: result.validation };

  revalidatePath(workflowsPath(input.projectId));
  return { data: { revisionId: result.revisionId, version: result.version, changeSummary: result.changeSummary } };
}

export async function listWorkflowRevisionsAction(projectId: string, workflowId: string) {
  const user = await requireProjectAccess(projectId, "VIEWER");
  return listRevisionsForWorkflow({ userId: user.id, projectId, workflowId });
}

export async function getWorkflowRevisionAction(projectId: string, workflowId: string, revisionId: string) {
  const user = await requireProjectAccess(projectId, "VIEWER");
  const revision = await getRevisionForUser({ userId: user.id, projectId, workflowId, revisionId });
  if (!revision) return { error: "Revisión no encontrada." };
  return { data: revision };
}

export async function compareDraftToPublishedAction(
  projectId: string,
  workflowId: string
): Promise<{ error: string } | { data: { diff: WorkflowDiffResult } }> {
  const user = await requireProjectAccess(projectId, "VIEWER");
  const result = await compareDraftToActivePublished({ userId: user.id, projectId, workflowId });
  if ("error" in result) return { error: result.error };
  return { data: { diff: result.diff } };
}

export async function compareWorkflowRevisionsAction(
  projectId: string,
  workflowId: string,
  fromRevisionId: string,
  toRevisionId: string
): Promise<{ error: string } | { data: { diff: WorkflowDiffResult } }> {
  const user = await requireProjectAccess(projectId, "VIEWER");
  const result = await compareTwoRevisions({ userId: user.id, projectId, workflowId, fromRevisionId, toRevisionId });
  if ("error" in result) return { error: result.error };
  return { data: { diff: result.diff } };
}

export interface RestoreRevisionActionInput {
  projectId: string;
  workflowId: string;
  revisionId: string;
}

/** "Restaurar esta versión" — creates/replaces the DRAFT with the chosen revision's content; never touches the revision itself, never changes publishedVersion, and never removes any later revision. A subsequent "Publicar" is what actually creates a new, higher version number. */
export async function restoreRevisionAsDraftAction(input: RestoreRevisionActionInput) {
  const user = await requireProjectAccess(input.projectId, "VIEWER");
  const parsed = restoreRevisionSchema.safeParse({ workflowId: input.workflowId, revisionId: input.revisionId });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const result = await restoreRevisionAsDraft({ userId: user.id, projectId: input.projectId, workflowId: parsed.data.workflowId, revisionId: parsed.data.revisionId });
  if (!result.ok) return { error: result.error };

  revalidatePath(workflowsPath(input.projectId));
  return { data: { editVersion: result.editVersion } };
}

/** "Usa a:" — every workflow this workflow's active published revision uses as a SubWorkflow. */
export async function listWorkflowsUsedByAction(projectId: string, workflowId: string) {
  const user = await requireProjectAccess(projectId, "VIEWER");
  return listWorkflowsUsedBy({ userId: user.id, workflowId });
}

/** "Usado por:" — every workflow that uses this one as a SubWorkflow. Called before archiving so the user sees the impact first. */
export async function listWorkflowsThatUseAction(projectId: string, workflowId: string) {
  const user = await requireProjectAccess(projectId, "VIEWER");
  return listWorkflowsThatUse({ userId: user.id, workflowId });
}

export async function archiveWorkflowAction(projectId: string, workflowId: string) {
  const user = await requireProjectAccess(projectId, "VIEWER");
  const result = await archiveWorkflow({ userId: user.id, projectId, workflowId });
  if (!result.ok) return { error: result.error };
  revalidatePath(workflowsPath(projectId));
  return {};
}

export async function restoreArchivedWorkflowAction(projectId: string, workflowId: string) {
  const user = await requireProjectAccess(projectId, "VIEWER");
  const result = await restoreArchivedWorkflow({ userId: user.id, projectId, workflowId });
  if (!result.ok) return { error: result.error };
  revalidatePath(workflowsPath(projectId));
  return {};
}
