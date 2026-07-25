import { createHash } from "node:crypto";
import type { WorkflowStep } from "@/lib/ai-workflows/engine";

/**
 * The canonical, executable definition of a Workflow at a point in time —
 * every field that affects behavior (and, by design, every metadata field a
 * user might also want to know changed), never a timestamp or an id. This
 * is the single shape both draft-save (Workflow.draftHash), publish
 * (WorkflowRevision.definitionHash / Workflow.publishedHash), and the
 * comparator (src/lib/ai-workflows/workflow-diff.ts) all hash/diff — never
 * a second, slightly different representation.
 */
export interface CanonicalWorkflowDefinition {
  name: string;
  description: string | null;
  category: string | null;
  tags: string[];
  steps: WorkflowStep[];
  variables: string[];
  stopOnError: boolean;
}

/** Deterministic, key-order-independent canonicalization — object keys are sorted recursively, `undefined` values are dropped (so an omitted optional field hashes identically to one explicitly set to undefined), and array ORDER is always preserved (step order and tag order are both meaningful as given — callers that want set-like tag/variable comparisons must sort before calling). */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      if (obj[key] === undefined) continue;
      result[key] = canonicalize(obj[key]);
    }
    return result;
  }
  return value;
}

/** The exact JSON text a definition hashes to — exposed mainly for tests that want to assert canonicalization directly, without re-deriving a hex digest by hand. */
export function canonicalDefinitionJson(definition: CanonicalWorkflowDefinition): string {
  return JSON.stringify(
    canonicalize({
      name: definition.name,
      description: definition.description,
      category: definition.category,
      tags: [...definition.tags].sort(),
      steps: definition.steps,
      variables: [...definition.variables].sort(),
      stopOnError: definition.stopOnError,
    })
  );
}

/**
 * SHA-256 of the canonical definition — server-only in practice (every
 * caller is a server action/service), deterministic, and never dependent on
 * timestamps, ids, or accidental JSON key order. Used to detect "hay
 * cambios sin publicar" (draftHash !== publishedHash), to refuse a publish
 * that changes nothing, and to verify a revision's stored snapshot wasn't
 * tampered with.
 */
export function computeDefinitionHash(definition: CanonicalWorkflowDefinition): string {
  return createHash("sha256").update(canonicalDefinitionJson(definition)).digest("hex");
}
