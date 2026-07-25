import "dotenv/config";
import { prisma } from "../src/lib/db/prisma";
import { computeDefinitionHash, type CanonicalWorkflowDefinition } from "../src/lib/ai-workflows/definition-hash";
import type { WorkflowStep } from "../src/lib/ai-workflows/engine";

/**
 * One-off, idempotent backfill for the draft/publish lifecycle phase.
 *
 * Strategy (documented per the phase's own requirement to explain the
 * chosen approach): existing Workflows predate the draft/publish split —
 * their live `steps`/`name`/etc. columns were, structurally, already "the
 * production definition" under the old single-stage model. This script
 * snapshots that CURRENT state as each workflow's initial published
 * WorkflowRevision (v1) — it does NOT fabricate any historical revision
 * that never existed, and it does NOT touch WorkflowRun rows at all (their
 * own `workflowSnapshot` column, populated since Phase 21/22, already fully
 * captures what each historical run actually executed against — nothing
 * here needs to reconstruct that).
 *
 * Only ever touches a Workflow where `publishedVersion IS NULL` (never
 * migrated yet), it has at least one step (an empty workflow has nothing
 * meaningful to publish and is correctly left as an untouched DRAFT, exactly
 * like a brand-new one), AND it is project-scoped (`projectId` set) —
 * WorkflowRevision.projectId is required, and a GLOBAL workflow has no
 * single "current project" a migration script could pick deterministically
 * without guessing; those are safely left as unpublished drafts for the
 * user to publish explicitly from within whichever project they open it in.
 * Safe to run multiple times — a workflow already migrated
 * (publishedVersion set) is never touched again.
 *
 * Run with: npx tsx scripts/backfill-workflow-revisions.ts
 */

function toSteps(steps: unknown): WorkflowStep[] {
  return Array.isArray(steps) ? (steps as WorkflowStep[]) : [];
}

async function main() {
  const candidates = await prisma.workflow.findMany({
    where: { publishedVersion: null },
  });

  const eligible = candidates.filter((w) => toSteps(w.steps).length > 0 && w.projectId !== null);
  const skippedGlobal = candidates.filter((w) => toSteps(w.steps).length > 0 && w.projectId === null).length;
  console.log(`Found ${candidates.length} unmigrated workflow(s), ${eligible.length} eligible for an initial published revision (${skippedGlobal} global workflow(s) with steps skipped — publish those explicitly from within a project).`);

  let migrated = 0;
  for (const workflow of eligible) {
    const steps = toSteps(workflow.steps);
    const definition: CanonicalWorkflowDefinition = {
      name: workflow.name,
      description: workflow.description,
      category: workflow.category,
      tags: workflow.tags,
      steps,
      variables: workflow.variables,
      stopOnError: true,
    };
    const hash = computeDefinitionHash(definition);
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      const revision = await tx.workflowRevision.create({
        data: {
          workflowId: workflow.id,
          userId: workflow.userId,
          projectId: workflow.projectId!, // filtered to project-scoped workflows above
          version: 1,
          definitionSnapshot: definition as unknown as object,
          definitionHash: hash,
          changeSummary: { lines: ["Revisión inicial generada automáticamente a partir del estado existente."], stepsAdded: steps.length, stepsRemoved: 0, stepsMoved: 0, stepsChanged: 0, metadataChanged: 0, variablesAdded: workflow.variables.length, variablesRemoved: 0 },
          releaseNotes: "Backfill: estado existente antes del ciclo de vida borrador/publicación.",
          isActive: true,
          publishedAt: now,
        },
      });
      await tx.workflow.update({
        where: { id: workflow.id },
        data: {
          status: "PUBLISHED",
          publishedVersion: 1,
          activeRevisionId: revision.id,
          publishedHash: hash,
          draftHash: hash,
          hasUnpublishedChanges: false,
          lastPublishedAt: now,
        },
      });
    });
    migrated += 1;
  }

  console.log(`Backfilled ${migrated} workflow(s) with an initial published v1 revision.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
