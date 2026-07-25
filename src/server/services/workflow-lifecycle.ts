import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { deriveWorkflowVariables, type WorkflowStep } from "@/lib/ai-workflows/engine";
import { computeDefinitionHash, type CanonicalWorkflowDefinition } from "@/lib/ai-workflows/definition-hash";
import { diffWorkflowDefinitions, buildChangeSummary, type WorkflowChangeSummary } from "@/lib/ai-workflows/workflow-diff";
import {
  validateStepsForPublish,
  addSignificantChangeWarning,
  appendError,
  type PublishValidationResult,
} from "@/lib/ai-workflows/publish-validation";
import { buildAiToolBrandContext, buildResourcesForStep } from "@/server/services/workflow-resources";
import { getActiveRevisionForWorkflow, getRevisionForUser } from "@/server/services/workflow-revisions";
import { detectWorkflowCycle, type WorkflowDependencyEdge } from "@/lib/ai-workflows/workflow-graph";

export { getActiveRevisionForWorkflow, getRevisionForUser };

/**
 * Draft/publish lifecycle for AI Workflows — separates the editable DRAFT
 * (Workflow's own live columns: name/description/category/tags/steps) from
 * the immutable, stable PUBLISHED revision (WorkflowRevision) real
 * executions read from. Every function here requires an explicit
 * {userId, projectId, workflowId} and re-verifies ownership itself — never
 * trusts a caller-supplied authority.
 */

function toSteps(steps: unknown): WorkflowStep[] {
  return Array.isArray(steps) ? (steps as WorkflowStep[]) : [];
}

function toCanonicalDefinition(source: {
  name: string;
  description: string | null;
  category: string | null;
  tags: string[];
  steps: WorkflowStep[];
  variables: string[];
}): CanonicalWorkflowDefinition {
  return {
    name: source.name,
    description: source.description,
    category: source.category,
    tags: source.tags,
    steps: source.steps,
    variables: source.variables,
    stopOnError: true,
  };
}

async function getOwnedWorkflowRow(workflowId: string, userId: string) {
  const workflow = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (!workflow || workflow.userId !== userId) return null;
  return workflow;
}

/** Every "workflowId USES childWorkflowId" edge across ALL of this user's workflows — the whole graph is always user-scoped, since a "workflow" step can only ever reference a workflow the SAME user owns (see buildResourcesForStep's ownership check). Small/cheap: one indexed query, never a JSON scan. */
async function fetchDependencyEdgesForUser(userId: string): Promise<WorkflowDependencyEdge[]> {
  return prisma.workflowDependency.findMany({ where: { userId }, select: { workflowId: true, childWorkflowId: true } });
}

function uniqueChildWorkflowIds(steps: WorkflowStep[]): string[] {
  return [...new Set(steps.filter((s): s is WorkflowStep & { childWorkflowId: string } => s.type === "workflow" && Boolean(s.childWorkflowId)).map((s) => s.childWorkflowId))];
}

// ---------------------------------------------------------------------------
// Draft save — optimistic concurrency, server-derived hash/variables
// ---------------------------------------------------------------------------

export interface SaveWorkflowDraftInput {
  userId: string;
  projectId: string;
  workflowId: string;
  /** The editVersion the client last read — a mismatch means another tab saved first. */
  editVersion: number;
  name?: string;
  description?: string | null;
  category?: string | null;
  tags?: string[];
  isActive?: boolean;
  steps?: WorkflowStep[];
}

export type SaveWorkflowDraftResult =
  | { ok: true; editVersion: number; hasUnpublishedChanges: boolean; variables: string[] }
  | { ok: false; error: string; conflict?: boolean };

export async function saveWorkflowDraft(input: SaveWorkflowDraftInput): Promise<SaveWorkflowDraftResult> {
  const existing = await getOwnedWorkflowRow(input.workflowId, input.userId);
  if (!existing) return { ok: false, error: "Workflow no encontrado." };
  if (existing.status === "ARCHIVED") return { ok: false, error: "Este workflow está archivado. Restáuralo antes de editarlo." };

  // Optimistic concurrency: the client must present the exact editVersion it
  // last read. A stale value means someone else (another tab) already saved
  // — reject rather than silently overwrite their work.
  if (existing.editVersion !== input.editVersion) {
    return {
      ok: false,
      conflict: true,
      error: "Este workflow se modificó en otra pestaña o sesión desde que lo abriste. Recarga para ver los cambios más recientes antes de guardar.",
    };
  }

  const nextSteps = input.steps ?? toSteps(existing.steps);
  const nextName = input.name ?? existing.name;
  const nextDescription = input.description !== undefined ? input.description : existing.description;
  const nextCategory = input.category !== undefined ? input.category : existing.category;
  const nextTags = input.tags ?? existing.tags;
  // Always server-derived from the real steps — never trusted from the client.
  const nextVariables = deriveWorkflowVariables(nextSteps);

  const draftHash = computeDefinitionHash(
    toCanonicalDefinition({ name: nextName, description: nextDescription, category: nextCategory, tags: nextTags, steps: nextSteps, variables: nextVariables })
  );
  const hasUnpublishedChanges = draftHash !== existing.publishedHash;

  const updated = await prisma.workflow.update({
    where: { id: input.workflowId },
    data: {
      name: nextName,
      description: nextDescription,
      category: nextCategory,
      tags: nextTags,
      isActive: input.isActive ?? existing.isActive,
      steps: nextSteps as unknown as Prisma.InputJsonValue,
      variables: nextVariables,
      draftHash,
      hasUnpublishedChanges,
      editVersion: { increment: 1 },
    },
  });

  return { ok: true, editVersion: updated.editVersion, hasUnpublishedChanges: updated.hasUnpublishedChanges, variables: nextVariables };
}

// ---------------------------------------------------------------------------
// Pre-publish validation (structural + resource-ownership)
// ---------------------------------------------------------------------------

/** Full validation a publish would perform, exposed standalone so the UI can show errors/warnings via "Validar" without actually publishing. Resource-ownership errors (a referenced Prompt/Template/Brand Kit that's missing or foreign) are resolved with the exact same function real execution uses — never a looser, separate check. */
export async function validateWorkflowDraftForPublish(input: {
  userId: string;
  projectId: string;
  workflowId: string;
}): Promise<{ result: PublishValidationResult } | { error: string }> {
  const workflow = await getOwnedWorkflowRow(input.workflowId, input.userId);
  if (!workflow) return { error: "Workflow no encontrado." };

  const steps = toSteps(workflow.steps);
  let result = validateStepsForPublish(steps);

  const brandContext = await buildAiToolBrandContext(input.projectId, input.userId);
  for (const step of steps) {
    const resolved = await buildResourcesForStep(step, input.userId, input.projectId, brandContext);
    if ("error" in resolved) {
      result = appendError(result, "resource_unavailable", `${resolved.error} (paso "${step.label}")`, step.id);
    }
  }

  // Recursion protection — both direct (A→A) and indirect (A→B→C→A) cycles,
  // detected BEFORE publish is allowed to ever create one. Uses the exact
  // same pure algorithm real execution's own belt-and-suspenders ancestor
  // check (src/server/actions/workflow-execution.ts) is modeled on, applied
  // here against the full, already-published dependency graph plus this
  // draft's OWN new outgoing edges (its published edges get wholesale
  // replaced by these on a successful publish, so the check excludes its
  // stale prior edges from the "existing" graph before evaluating).
  const newChildIds = uniqueChildWorkflowIds(steps);
  if (newChildIds.length > 0) {
    const existingEdges = (await fetchDependencyEdgesForUser(input.userId)).filter((edge) => edge.workflowId !== input.workflowId);
    const cycle = detectWorkflowCycle(existingEdges, input.workflowId, newChildIds);
    if (cycle.hasCycle) {
      result = appendError(
        result,
        "circular_workflow_reference",
        `Publicar esta versión crearía una referencia circular entre workflows: ${(cycle.path ?? []).join(" → ")}.`
      );
    }
  }

  if (workflow.activeRevisionId) {
    const activeRevision = await prisma.workflowRevision.findUnique({ where: { id: workflow.activeRevisionId } });
    if (activeRevision) {
      const publishedDef = activeRevision.definitionSnapshot as unknown as CanonicalWorkflowDefinition;
      const draftDef = toCanonicalDefinition({
        name: workflow.name,
        description: workflow.description,
        category: workflow.category,
        tags: workflow.tags,
        steps,
        variables: workflow.variables,
      });
      const diff = diffWorkflowDefinitions(publishedDef, draftDef);
      result = addSignificantChangeWarning(result, diff, steps.length);
    }
  }

  return { result };
}

// ---------------------------------------------------------------------------
// Publish — transactional, rejects a no-op, creates exactly one active revision
// ---------------------------------------------------------------------------

export interface PublishWorkflowInput {
  userId: string;
  projectId: string;
  workflowId: string;
  releaseNotes?: string;
}

export type PublishWorkflowResult =
  | { ok: true; revisionId: string; version: number; changeSummary: WorkflowChangeSummary }
  | { ok: false; error: string; validation?: PublishValidationResult };

export async function publishWorkflowDraft(input: PublishWorkflowInput): Promise<PublishWorkflowResult> {
  const workflow = await getOwnedWorkflowRow(input.workflowId, input.userId);
  if (!workflow) return { ok: false, error: "Workflow no encontrado." };
  if (workflow.status === "ARCHIVED") return { ok: false, error: "Este workflow está archivado. Restáuralo antes de publicarlo." };

  const validated = await validateWorkflowDraftForPublish({ userId: input.userId, projectId: input.projectId, workflowId: input.workflowId });
  if ("error" in validated) return { ok: false, error: validated.error };
  if (!validated.result.canPublish) {
    return { ok: false, error: validated.result.errors[0]?.message ?? "El workflow tiene errores de validación.", validation: validated.result };
  }

  const steps = toSteps(workflow.steps);
  const draftDef = toCanonicalDefinition({
    name: workflow.name,
    description: workflow.description,
    category: workflow.category,
    tags: workflow.tags,
    steps,
    variables: workflow.variables,
  });
  const draftHash = computeDefinitionHash(draftDef);

  // Reject a publish that would produce no real change — the hash (never a
  // client-supplied one; always recomputed here) is the authority.
  if (workflow.publishedHash !== null && draftHash === workflow.publishedHash) {
    return { ok: false, error: "No hay cambios sin publicar respecto a la versión activa." };
  }

  let changeSummary: WorkflowChangeSummary = { lines: [], stepsAdded: 0, stepsRemoved: 0, stepsMoved: 0, stepsChanged: 0, metadataChanged: 0, variablesAdded: 0, variablesRemoved: 0 };
  if (workflow.activeRevisionId) {
    const activeRevision = await prisma.workflowRevision.findUnique({ where: { id: workflow.activeRevisionId } });
    if (activeRevision) {
      const publishedDef = activeRevision.definitionSnapshot as unknown as CanonicalWorkflowDefinition;
      changeSummary = buildChangeSummary(diffWorkflowDefinitions(publishedDef, draftDef));
    }
  } else {
    changeSummary = { lines: ["Primera publicación."], stepsAdded: steps.length, stepsRemoved: 0, stepsMoved: 0, stepsChanged: 0, metadataChanged: 0, variablesAdded: workflow.variables.length, variablesRemoved: 0 };
  }

  const nextVersion = (workflow.publishedVersion ?? 0) + 1;
  const now = new Date();
  const releaseNotes = input.releaseNotes?.trim() || null;

  const revision = await prisma.$transaction(async (tx) => {
    if (workflow.activeRevisionId) {
      await tx.workflowRevision.update({ where: { id: workflow.activeRevisionId }, data: { isActive: false } });
    }
    const created = await tx.workflowRevision.create({
      data: {
        workflowId: workflow.id,
        userId: input.userId,
        projectId: input.projectId,
        version: nextVersion,
        definitionSnapshot: draftDef as unknown as Prisma.InputJsonValue,
        definitionHash: draftHash,
        changeSummary: changeSummary as unknown as Prisma.InputJsonValue,
        releaseNotes,
        isActive: true,
        publishedAt: now,
      },
    });
    await tx.workflow.update({
      where: { id: workflow.id },
      data: {
        status: "PUBLISHED",
        publishedVersion: nextVersion,
        activeRevisionId: created.id,
        publishedHash: draftHash,
        hasUnpublishedChanges: false,
        lastPublishedAt: now,
      },
    });

    // Wholesale-recompute this workflow's OUTGOING dependency edges from the
    // definition that just became active — always reflects the newly
    // PUBLISHED revision's own "workflow" steps, never the draft. Same
    // transaction as the publish itself, so the graph and the active
    // revision can never observably disagree.
    await tx.workflowDependency.deleteMany({ where: { workflowId: workflow.id } });
    const childIds = uniqueChildWorkflowIds(steps);
    if (childIds.length > 0) {
      await tx.workflowDependency.createMany({
        data: childIds.map((childWorkflowId) => ({ workflowId: workflow.id, childWorkflowId, userId: input.userId, projectId: input.projectId })),
      });
    }

    return created;
  });

  return { ok: true, revisionId: revision.id, version: nextVersion, changeSummary };
}

// ---------------------------------------------------------------------------
// Revisions — read-only listing/detail, always ownership-scoped
// ---------------------------------------------------------------------------

export async function listRevisionsForWorkflow(input: { userId: string; projectId: string; workflowId: string }) {
  const workflow = await getOwnedWorkflowRow(input.workflowId, input.userId);
  if (!workflow || workflow.projectId !== input.projectId) return [];
  // Never selects definitionSnapshot — a listing only needs number/date/status, not the full definition.
  return prisma.workflowRevision.findMany({
    where: { workflowId: input.workflowId, userId: input.userId, projectId: input.projectId },
    orderBy: { version: "desc" },
    select: { id: true, version: true, isActive: true, createdAt: true, publishedAt: true, archivedAt: true, releaseNotes: true, changeSummary: true, definitionHash: true },
  });
}

export async function compareDraftToActivePublished(input: {
  userId: string;
  projectId: string;
  workflowId: string;
}): Promise<{ diff: ReturnType<typeof diffWorkflowDefinitions>; changeSummary: WorkflowChangeSummary } | { error: string }> {
  const workflow = await getOwnedWorkflowRow(input.workflowId, input.userId);
  if (!workflow) return { error: "Workflow no encontrado." };

  const draftDef = toCanonicalDefinition({
    name: workflow.name,
    description: workflow.description,
    category: workflow.category,
    tags: workflow.tags,
    steps: toSteps(workflow.steps),
    variables: workflow.variables,
  });

  let publishedDef: CanonicalWorkflowDefinition = { name: "", description: null, category: null, tags: [], steps: [], variables: [], stopOnError: true };
  if (workflow.activeRevisionId) {
    const activeRevision = await prisma.workflowRevision.findUnique({ where: { id: workflow.activeRevisionId } });
    if (activeRevision) publishedDef = activeRevision.definitionSnapshot as unknown as CanonicalWorkflowDefinition;
  }

  const diff = diffWorkflowDefinitions(publishedDef, draftDef);
  return { diff, changeSummary: buildChangeSummary(diff) };
}

export async function compareTwoRevisions(input: {
  userId: string;
  projectId: string;
  workflowId: string;
  fromRevisionId: string;
  toRevisionId: string;
}): Promise<{ diff: ReturnType<typeof diffWorkflowDefinitions> } | { error: string }> {
  const [from, to] = await Promise.all([
    getRevisionForUser({ userId: input.userId, projectId: input.projectId, workflowId: input.workflowId, revisionId: input.fromRevisionId }),
    getRevisionForUser({ userId: input.userId, projectId: input.projectId, workflowId: input.workflowId, revisionId: input.toRevisionId }),
  ]);
  if (!from || !to) return { error: "Revisión no encontrada." };
  return {
    diff: diffWorkflowDefinitions(
      from.definitionSnapshot as unknown as CanonicalWorkflowDefinition,
      to.definitionSnapshot as unknown as CanonicalWorkflowDefinition
    ),
  };
}

// ---------------------------------------------------------------------------
// Rollback — restores a historical revision AS A NEW DRAFT, never rewrites history
// ---------------------------------------------------------------------------

export type RestoreRevisionResult = { ok: true; editVersion: number } | { ok: false; error: string };

export async function restoreRevisionAsDraft(input: {
  userId: string;
  projectId: string;
  workflowId: string;
  revisionId: string;
}): Promise<RestoreRevisionResult> {
  const workflow = await getOwnedWorkflowRow(input.workflowId, input.userId);
  if (!workflow) return { ok: false, error: "Workflow no encontrado." };
  if (workflow.status === "ARCHIVED") return { ok: false, error: "Este workflow está archivado. Restáuralo antes de editar su borrador." };

  const revision = await getRevisionForUser({ userId: input.userId, projectId: input.projectId, workflowId: input.workflowId, revisionId: input.revisionId });
  if (!revision) return { ok: false, error: "Revisión no encontrada." };

  const def = revision.definitionSnapshot as unknown as CanonicalWorkflowDefinition;
  const draftHash = computeDefinitionHash(def);
  const hasUnpublishedChanges = draftHash !== workflow.publishedHash;

  const updated = await prisma.workflow.update({
    where: { id: input.workflowId },
    data: {
      name: def.name,
      description: def.description,
      category: def.category,
      tags: def.tags,
      steps: def.steps as unknown as Prisma.InputJsonValue,
      variables: def.variables,
      draftHash,
      hasUnpublishedChanges,
      editVersion: { increment: 1 },
    },
  });

  return { ok: true, editVersion: updated.editVersion };
}

// ---------------------------------------------------------------------------
// Dependencies — "quién depende de mí" / "de quién dependo", read-only,
// backed entirely by the indexed WorkflowDependency table recomputed on
// every publish above — never a JSON scan over every workflow's steps.
// ---------------------------------------------------------------------------

export interface WorkflowDependencyRow {
  id: string;
  name: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  publishedVersion: number | null;
  isFavorite: boolean;
}

const dependencyRowSelect = { id: true, name: true, status: true, publishedVersion: true, isFavorite: true } as const;

/** Every workflow THIS workflow's active published revision uses as a SubWorkflow ("de quién dependo"). */
export async function listWorkflowsUsedBy(input: { userId: string; workflowId: string }): Promise<WorkflowDependencyRow[]> {
  const rows = await prisma.workflowDependency.findMany({
    where: { workflowId: input.workflowId, userId: input.userId },
    include: { childWorkflow: { select: dependencyRowSelect } },
  });
  return rows.map((r) => r.childWorkflow);
}

/** Every workflow whose active published revision uses THIS workflow as a SubWorkflow ("quién depende de mí") — always checked before archiving. */
export async function listWorkflowsThatUse(input: { userId: string; workflowId: string }): Promise<WorkflowDependencyRow[]> {
  const rows = await prisma.workflowDependency.findMany({
    where: { childWorkflowId: input.workflowId, userId: input.userId },
    include: { workflow: { select: dependencyRowSelect } },
  });
  return rows.map((r) => r.workflow);
}

// ---------------------------------------------------------------------------
// Archive / restore
// ---------------------------------------------------------------------------

export async function archiveWorkflow(input: { userId: string; projectId: string; workflowId: string }): Promise<{ ok: boolean; error?: string }> {
  const workflow = await getOwnedWorkflowRow(input.workflowId, input.userId);
  if (!workflow) return { ok: false, error: "Workflow no encontrado." };
  if (workflow.status === "ARCHIVED") return { ok: true }; // already archived — idempotent no-op

  const now = new Date();
  await prisma.$transaction([
    prisma.workflow.update({ where: { id: input.workflowId }, data: { status: "ARCHIVED", archivedAt: now } }),
    prisma.workflowRevision.updateMany({ where: { workflowId: input.workflowId, archivedAt: null }, data: { archivedAt: now } }),
  ]);
  return { ok: true };
}

export async function restoreArchivedWorkflow(input: { userId: string; projectId: string; workflowId: string }): Promise<{ ok: boolean; error?: string }> {
  const workflow = await getOwnedWorkflowRow(input.workflowId, input.userId);
  if (!workflow) return { ok: false, error: "Workflow no encontrado." };
  if (workflow.status !== "ARCHIVED") return { ok: true }; // not archived — idempotent no-op

  await prisma.$transaction([
    prisma.workflow.update({
      where: { id: input.workflowId },
      data: { status: workflow.publishedVersion ? "PUBLISHED" : "DRAFT", archivedAt: null },
    }),
    prisma.workflowRevision.updateMany({ where: { workflowId: input.workflowId, archivedAt: { not: null } }, data: { archivedAt: null } }),
  ]);
  return { ok: true };
}

