"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requireProjectAccess } from "@/lib/permissions";
import { createWorkflowSchema, updateWorkflowSchema } from "@/lib/validation/ai-workflows";
import { deriveWorkflowVariables, type WorkflowStep } from "@/lib/ai-workflows/engine";
import { computeDefinitionHash } from "@/lib/ai-workflows/definition-hash";
import { saveWorkflowDraft } from "@/server/services/workflow-lifecycle";
import { listWorkflowsForUser } from "@/server/services/ai-workflows";
import { LOCAL_MODEL_ID } from "@/lib/ai/local/model-config";

/** Prisma's `Json` column is typed as unknown at the boundary — steps are always written as a validated WorkflowStep[] and read back as the same shape, so this cast pair is safe here and nowhere else (mirrors toSteps in src/server/services/ai-workflows.ts). */
function toJson(steps: WorkflowStep[]): Prisma.InputJsonValue {
  return steps as unknown as Prisma.InputJsonValue;
}

export interface WorkflowActionState {
  error?: string;
  /** The real, server-created/duplicated Workflow id — the UI must use this, never a client-guessed value. */
  id?: string;
  /** True specifically when the save was rejected because editVersion was stale (another tab saved first) — lets the UI show "conflicto, recarga" instead of a generic validation error. */
  conflict?: boolean;
  /** The Workflow's new editVersion after a successful draft save — the client must remember this to save again without triggering a false conflict. */
  editVersion?: number;
  hasUnpublishedChanges?: boolean;
}

function workflowsPath(projectId: string) {
  return `/dashboard/${projectId}/ai-workflows`;
}

/** Same "not mine == doesn't exist" shape as getOwnedPrompt/getOwnedTemplate/getOwnedProfile — no cross-user existence leak. */
async function getOwnedWorkflow(id: string, userId: string) {
  const workflow = await prisma.workflow.findUnique({ where: { id } });
  if (!workflow || workflow.userId !== userId) return null;
  return workflow;
}

/**
 * Read-only fetch for client components that need a pickable list of the
 * user's own workflows without a Server Component round-trip — the AI
 * Workflows step editor's "workflow" (SubWorkflow) step reuses this exact
 * list (see requirement "no duplicar datos"), never a second listing query.
 * `excludeWorkflowId` (the workflow currently being edited) is filtered out
 * client-side-equivalent here so a step can never even be OFFERED a direct
 * self-reference in the picker — real protection is still the publish-time
 * cycle check, this is just a better default UX.
 */
export async function listWorkflowsForSelectAction(projectId: string, excludeWorkflowId?: string) {
  const user = await requireProjectAccess(projectId, "VIEWER");
  const workflows = await listWorkflowsForUser(user.id, projectId);
  return workflows
    .filter((w) => w.id !== excludeWorkflowId)
    .map((w) => ({
      id: w.id,
      name: w.name,
      status: w.status,
      publishedVersion: w.publishedVersion,
      isFavorite: w.isFavorite,
      category: w.category,
      /** The child's own currently-declared run-time inputs (live draft) — a purely-editing-time convenience so the step editor's input-mapping fields can be pre-populated without a second round-trip; the actual mapping is validated for real at publish time against whatever revision childRevisionMode resolves to. */
      variables: w.variables,
    }));
}

export interface CreateWorkflowInput {
  /** The project the AI Workflows page is currently open in — always access-checked, regardless of `scope`. */
  projectId: string;
  scope: "project" | "global";
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  isActive?: boolean;
  steps: WorkflowStep[];
}

export async function createWorkflowAction(input: CreateWorkflowInput): Promise<WorkflowActionState> {
  const user = await requireProjectAccess(input.projectId, "VIEWER");

  const parsed = createWorkflowSchema.safeParse({
    projectId: input.scope === "project" ? input.projectId : null,
    name: input.name,
    description: input.description,
    category: input.category,
    tags: input.tags ?? [],
    isActive: input.isActive ?? true,
    steps: input.steps,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const steps = parsed.data.steps as WorkflowStep[];
  const variables = deriveWorkflowVariables(steps);
  // A brand-new Workflow always starts as an unpublished DRAFT (schema
  // defaults: status DRAFT, editVersion 1, publishedVersion/activeRevisionId
  // null) — nothing here is published until an explicit "Publicar versión".
  const draftHash = computeDefinitionHash({
    name: parsed.data.name,
    description: parsed.data.description || null,
    category: parsed.data.category || null,
    tags: parsed.data.tags,
    steps,
    variables,
    stopOnError: true,
  });
  const created = await prisma.workflow.create({
    data: {
      userId: user.id,
      projectId: parsed.data.projectId,
      name: parsed.data.name,
      description: parsed.data.description || null,
      category: parsed.data.category || null,
      tags: parsed.data.tags,
      isActive: parsed.data.isActive,
      steps: toJson(steps),
      // Always derived server-side from the real steps — never trusted from the client.
      variables,
      draftHash,
      hasUnpublishedChanges: true,
    },
  });

  revalidatePath(workflowsPath(input.projectId));
  return { id: created.id };
}

/**
 * "Guardar borrador" — updates the DRAFT only, protected by optimistic
 * concurrency (editVersion). Never publishes, never touches
 * publishedVersion/activeRevisionId/publishedHash, and never bumps the
 * legacy `version` counter — only an explicit publishWorkflowAction does
 * that. See saveWorkflowDraft in src/server/services/workflow-lifecycle.ts
 * for the concurrency check and hash/variable recomputation.
 */
export async function updateWorkflowAction(
  projectId: string,
  id: string,
  input: {
    name?: string;
    description?: string;
    category?: string;
    tags?: string[];
    isActive?: boolean;
    steps?: WorkflowStep[];
    editVersion: number;
  }
): Promise<WorkflowActionState> {
  const user = await requireProjectAccess(projectId, "VIEWER");

  const parsed = updateWorkflowSchema.safeParse({ id, ...input });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const result = await saveWorkflowDraft({
    userId: user.id,
    projectId,
    workflowId: id,
    editVersion: parsed.data.editVersion,
    name: parsed.data.name,
    description: parsed.data.description !== undefined ? parsed.data.description || null : undefined,
    category: parsed.data.category !== undefined ? parsed.data.category || null : undefined,
    tags: parsed.data.tags,
    isActive: parsed.data.isActive,
    steps: parsed.data.steps as WorkflowStep[] | undefined,
  });
  if (!result.ok) return { error: result.error, conflict: result.conflict };

  revalidatePath(workflowsPath(projectId));
  return { id, editVersion: result.editVersion, hasUnpublishedChanges: result.hasUnpublishedChanges };
}

export async function deleteWorkflowAction(projectId: string, id: string): Promise<WorkflowActionState> {
  const user = await requireProjectAccess(projectId, "VIEWER");

  const existing = await getOwnedWorkflow(id, user.id);
  if (!existing) return { error: "Workflow no encontrado." };

  await prisma.workflow.delete({ where: { id } });

  revalidatePath(workflowsPath(projectId));
  return {};
}

/** A duplicate is a brand-new Workflow with its own independent lifecycle — it starts as an unpublished DRAFT (its own draftHash, no revisions, no publishedVersion) even when the source was already published, since publishing an entity is never implicit. */
export async function duplicateWorkflowAction(projectId: string, id: string): Promise<WorkflowActionState> {
  const user = await requireProjectAccess(projectId, "VIEWER");

  const existing = await getOwnedWorkflow(id, user.id);
  if (!existing) return { error: "Workflow no encontrado." };

  const steps = existing.steps as unknown as WorkflowStep[];
  const name = `${existing.name} (copia)`;
  const draftHash = computeDefinitionHash({
    name,
    description: existing.description,
    category: existing.category,
    tags: existing.tags,
    steps,
    variables: existing.variables,
    stopOnError: true,
  });

  const copy = await prisma.workflow.create({
    data: {
      userId: user.id,
      projectId: existing.projectId,
      name,
      description: existing.description,
      category: existing.category,
      tags: existing.tags,
      isActive: existing.isActive,
      steps: existing.steps as unknown as Prisma.InputJsonValue,
      variables: existing.variables,
      isFavorite: false,
      draftHash,
      hasUnpublishedChanges: true,
    },
  });

  revalidatePath(workflowsPath(projectId));
  return { id: copy.id };
}

export async function toggleFavoriteWorkflowAction(projectId: string, id: string, next: boolean): Promise<WorkflowActionState> {
  const user = await requireProjectAccess(projectId, "VIEWER");

  const existing = await getOwnedWorkflow(id, user.id);
  if (!existing) return { error: "Workflow no encontrado." };

  await prisma.workflow.update({ where: { id }, data: { isFavorite: next } });

  revalidatePath(workflowsPath(projectId));
  return {};
}

export async function toggleActiveWorkflowAction(projectId: string, id: string, next: boolean): Promise<WorkflowActionState> {
  const user = await requireProjectAccess(projectId, "VIEWER");

  const existing = await getOwnedWorkflow(id, user.id);
  if (!existing) return { error: "Workflow no encontrado." };

  await prisma.workflow.update({ where: { id }, data: { isActive: next } });

  revalidatePath(workflowsPath(projectId));
  return {};
}

/**
 * "Guardar en Workspace": persists an already-computed, client-resolved
 * execution plan (see planWorkflowRun in src/lib/ai-workflows/engine.ts) as
 * a ContentItem, reusing the exact same table/history every other tool's
 * result lives in — no second "execution history" table. Never re-runs or
 * re-validates the plan itself (that already happened locally); only
 * re-verifies the workflow is still the caller's own before writing.
 */
export interface SaveWorkflowExecutionInput {
  projectId: string;
  workflowId: string;
  workflowName: string;
  body: string;
}

export async function saveWorkflowExecutionAction(input: SaveWorkflowExecutionInput): Promise<WorkflowActionState> {
  const user = await requireProjectAccess(input.projectId, "VIEWER");

  const workflow = await getOwnedWorkflow(input.workflowId, user.id);
  if (!workflow) return { error: "Workflow no encontrado." };
  if (!input.body.trim()) return { error: "No hay ningún resultado de ejecución que guardar." };

  const created = await prisma.contentItem.create({
    data: {
      projectId: input.projectId,
      authorId: user.id,
      type: "OTHER",
      title: `Workflow: ${input.workflowName}`.slice(0, 120),
      body: input.body,
      language: "es",
      sourceTool: `workflow:${workflow.id}`,
    },
  });

  await prisma.aIUsage.create({
    data: {
      projectId: input.projectId,
      userId: user.id,
      kind: "CONTENT_GENERATION",
      provider: "local-browser",
      model: LOCAL_MODEL_ID,
    },
  });

  revalidatePath(`/dashboard/${input.projectId}/workspace`);
  return { id: created.id };
}
