import type { WorkflowStep } from "@/lib/ai-workflows/engine";
import type { ExecutionResourceContext } from "@/lib/ai-workflows/execution-resolver";

/**
 * The immutable, server-built copy of everything a WorkflowRun needs to
 * execute, frozen at the moment the run starts. Every real step of that run
 * reads from THIS, never from the live (possibly since-edited or deleted)
 * Workflow/Prompt/Template/BrandProfile rows — so editing or deleting any of
 * those later can never change a run already in flight or its history.
 *
 * Built once, server-side, in startWorkflowRunAction — the client never
 * sends one and never can replace it (every action re-reads it from
 * WorkflowRun.workflowSnapshot, an opaque Json column no action ever accepts
 * as input).
 */
export interface WorkflowSnapshot {
  workflowId: string;
  /** The published version number this snapshot represents — for a draft-test run, this is the workflow's current publishedVersion (0 if never published), purely informational since a draft test has no revision of its own. */
  workflowVersion: number;
  /** The WorkflowRevision this snapshot was built from — null for a draft-test run (built straight from the live, unpublished draft) and for legacy pre-lifecycle runs. */
  revisionId: string | null;
  /** True when this snapshot was built from the current DRAFT rather than an immutable, published WorkflowRevision — the one flag that must make "Probar borrador" impossible to confuse with a real production execution anywhere it's read. */
  isDraftTest: boolean;
  name: string;
  description: string | null;
  category: string | null;
  variables: string[];
  stopOnError: boolean;
  /** The exact, ordered step definitions this run executes — a copy, not a live reference. */
  steps: WorkflowStep[];
  /** Project brand context + the user's default BrandProfile context, resolved once and reused by every "ai_tool" step in this run. */
  brandContext: string;
  /** Per-step-id resolved resources (Prompt Library content, AI Template content+variables, Brand Kit context) — resolved and ownership-checked once, at start time. Absent entries mean the step type needs no external resource (ai_tool/transform/save_result). */
  resources: Record<string, ExecutionResourceContext>;
  createdAt: string;
}
