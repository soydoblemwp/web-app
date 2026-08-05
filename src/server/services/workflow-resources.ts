import "server-only";
import { prisma } from "@/lib/db/prisma";
import { buildBrandContext } from "@/lib/ai/brand-context";
import { getDefaultBrandProfileForUser, getBrandProfileForUser } from "@/server/services/brand-profiles";
import { buildBrandProfileContext, buildBrandProfileTemplateVariables } from "@/lib/brand-profiles/context";
import { getSavedPromptForUser } from "@/server/services/prompt-library";
import { getAiTemplateForUser } from "@/server/services/ai-templates";
import { getWorkflowForUser } from "@/server/services/ai-workflows";
import { getActiveRevisionForWorkflow, getRevisionForUser } from "@/server/services/workflow-revisions";
import { searchKnowledge } from "@/server/services/knowledge-search";
import type { WorkflowStep } from "@/lib/ai-workflows/engine";
import type { ExecutionResourceContext } from "@/lib/ai-workflows/execution-resolver";
import type { WorkflowSnapshot } from "@/lib/ai-workflows/snapshot";

/**
 * Shared, DB-backed resource resolution for building an execution snapshot
 * — used by real execution (src/server/actions/workflow-execution.ts) AND
 * by publish-time validation (src/server/services/workflow-lifecycle.ts),
 * so publishing can genuinely verify every referenced resource exists and
 * is owned by the caller using the EXACT same resolution real execution
 * will later use, never a second/looser check.
 */

/** Project brand context + the user's default Brand Kit — the same combination every ai_tool generation gets everywhere else in this app. Resolved ONCE per run (at start/retry/publish-validation time) and frozen into the run's snapshot — never re-resolved live mid-run. */
export async function buildAiToolBrandContext(projectId: string, userId: string): Promise<string> {
  const [project, brandKit, defaultProfile] = await Promise.all([
    prisma.project.findUniqueOrThrow({ where: { id: projectId } }),
    prisma.brandKit.findUnique({ where: { projectId }, include: { terms: true } }),
    getDefaultBrandProfileForUser(userId),
  ]);
  const projectContext = buildBrandContext(project, brandKit);
  const profileContext = defaultProfile ? buildBrandProfileContext(defaultProfile) : "";
  return [projectContext, profileContext].filter(Boolean).join("\n\n");
}

/** Resolves everything a step needs beyond its own inputTemplate — fetching + ownership-checking Prompt Library/AI Template/Brand Kit resources server-side. Called once per step at snapshot-build time (start/retry/draft-test/publish-validation), never per prepare — the frozen result is what every prepare call for that step reuses. Returns a plain error string on any ownership/availability failure, never throws. */
export async function buildResourcesForStep(
  step: WorkflowStep,
  userId: string,
  projectId: string,
  brandContext: string
): Promise<ExecutionResourceContext | { error: string }> {
  switch (step.type) {
    case "prompt_library": {
      if (!step.promptId) return { error: "Falta el prompt de Prompt Library de este paso." };
      const prompt = await getSavedPromptForUser(step.promptId, userId);
      if (!prompt) return { error: "El prompt de este paso no existe o no te pertenece." };
      if (prompt.projectId && prompt.projectId !== projectId) {
        return { error: "El prompt de este paso pertenece a otro proyecto." };
      }
      let brandProfileContext: string | undefined;
      if (prompt.useBrandKit) {
        const profile = await getDefaultBrandProfileForUser(userId);
        brandProfileContext = profile ? buildBrandProfileContext(profile) : undefined;
      }
      return { brandContext, promptContent: prompt.content, promptUseBrandKit: prompt.useBrandKit, brandProfileContext };
    }
    case "ai_template": {
      if (!step.templateId) return { error: "Falta el AI Template de este paso." };
      const template = await getAiTemplateForUser(step.templateId, userId);
      if (!template) return { error: "El AI Template de este paso no existe o no te pertenece." };
      if (template.projectId && template.projectId !== projectId) {
        return { error: "El AI Template de este paso pertenece a otro proyecto." };
      }
      const defaultProfile = await getDefaultBrandProfileForUser(userId);
      const templateBrandVariables = defaultProfile ? buildBrandProfileTemplateVariables(defaultProfile) : {};
      return { brandContext, templateContent: template.content, templateBrandVariables };
    }
    case "brand_kit": {
      const profile =
        step.brandProfileId && step.brandProfileId !== "default"
          ? await getBrandProfileForUser(step.brandProfileId, userId)
          : await getDefaultBrandProfileForUser(userId);
      if (!profile) return { error: "El Brand Kit de este paso no existe, no te pertenece, o no tienes ninguno predeterminado." };
      return { brandContext, brandProfileContext: buildBrandProfileContext(profile) };
    }
    case "workflow": {
      if (!step.childWorkflowId) return { error: "Falta el workflow hijo de este paso." };
      const child = await getWorkflowForUser(step.childWorkflowId, userId);
      if (!child) return { error: "El workflow hijo de este paso no existe o no te pertenece." };
      if (child.projectId && child.projectId !== projectId) {
        return { error: "El workflow hijo de este paso pertenece a otro proyecto." };
      }
      if (child.status === "ARCHIVED") return { error: "El workflow hijo de este paso está archivado." };

      const revision =
        step.childRevisionMode === "specific" && step.childRevisionId
          ? await getRevisionForUser({ userId, projectId: child.projectId ?? projectId, workflowId: child.id, revisionId: step.childRevisionId })
          : await getActiveRevisionForWorkflow(child.id, userId);
      if (!revision) {
        return {
          error:
            step.childRevisionMode === "specific"
              ? "La versión específica del workflow hijo de este paso ya no está disponible."
              : "El workflow hijo de este paso todavía no tiene ninguna versión publicada.",
        };
      }

      return {
        brandContext,
        childWorkflowId: child.id,
        childRevisionId: revision.id,
        childDefinitionHash: revision.definitionHash,
        childWorkflowName: child.name,
      };
    }

    case "knowledge": {
      if (!step.knowledgeQuery?.trim()) return { error: "Falta la consulta de búsqueda de Knowledge Base de este paso." };
      if (!step.knowledgeCollectionIds?.length && !step.knowledgeSourceIds?.length) {
        return { error: "Este paso de Knowledge Base no tiene ninguna colección ni fuente seleccionada." };
      }
      const hits = await searchKnowledge({
        projectId,
        query: step.knowledgeQuery,
        collectionIds: step.knowledgeCollectionIds,
        sourceIds: step.knowledgeSourceIds,
        limit: 6,
      });
      const knowledgeSearchResult =
        hits.length > 0
          ? hits.map((h, i) => `[${i + 1}] (${h.sourceTitle}${h.locationLabel ? ` — ${h.locationLabel}` : ""}): ${h.snippet}`).join("\n\n")
          : "No se encontraron fragmentos relevantes en Knowledge Base para esta consulta.";
      return { brandContext, knowledgeSearchResult };
    }

    case "performance": {
      const performanceResult = await resolvePerformanceStepResult(step, projectId);
      if ("error" in performanceResult) return performanceResult;
      return { brandContext, performanceResult: performanceResult.text };
    }

    case "ai_tool":
    case "agent":
    case "transform":
    case "save_result":
    default:
      return { brandContext };
  }
}

/** Real, read-only Performance Intelligence lookups for the "performance" workflow node (Fase 34 adapter) — resolved once at snapshot-build time, exactly like the "knowledge" step's search call above. Never writes anything (spec section 36: "no permitas registrar métricas falsas desde un workflow sin origen declarado" — this engine offers no write node at all, precisely to avoid that risk). */
async function resolvePerformanceStepResult(step: WorkflowStep, projectId: string): Promise<{ text: string } | { error: string }> {
  const { getInternalMetricsSnapshot } = await import("@/server/services/performance-internal-metrics");
  const { compareContentItems, compareCampaigns, compareSocialPosts } = await import("@/server/services/performance-comparisons");
  const { listRecommendations } = await import("@/server/services/performance-recommendations");
  const { getExperimentDetail } = await import("@/server/services/performance-experiments");

  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - (step.performancePeriodDays ?? 30) * 86_400_000);

  if (step.performanceOperation === "query") {
    const snapshot = await getInternalMetricsSnapshot(projectId, { start: periodStart, end: periodEnd });
    return { text: JSON.stringify(snapshot) };
  }

  if (step.performanceOperation === "compare") {
    if (!step.performanceResourceId || !step.performanceCompareResourceIds?.length) return { error: "Este paso de comparación no tiene recursos configurados." };
    const ids = [step.performanceResourceId, ...step.performanceCompareResourceIds];
    const metricKeys = step.performanceMetricKeys ?? [];
    const resourceType = step.performanceResourceType ?? "CONTENT_ITEM";
    const result =
      resourceType === "CAMPAIGN"
        ? await compareCampaigns(projectId, ids, metricKeys, periodStart, periodEnd)
        : resourceType === "SOCIAL_POST"
          ? await compareSocialPosts(projectId, ids, metricKeys, periodStart, periodEnd)
          : await compareContentItems(projectId, ids, metricKeys, periodStart, periodEnd);
    if ("error" in result) return { error: result.error };
    return { text: JSON.stringify(result) };
  }

  if (step.performanceOperation === "recommend") {
    const recommendations = await listRecommendations(projectId, { status: "NEW", limit: 20 });
    return { text: JSON.stringify(recommendations.map((r) => ({ id: r.id, title: r.title, category: r.category, priority: r.priority, actionProposed: r.actionProposed }))) };
  }

  if (step.performanceOperation === "experiment_result") {
    if (!step.performanceExperimentId) return { error: "Falta el experimento de este paso." };
    const experiment = await getExperimentDetail(projectId, step.performanceExperimentId);
    if (!experiment) return { error: "El experimento de este paso no existe o no pertenece a este proyecto." };
    return { text: JSON.stringify({ id: experiment.id, name: experiment.name, status: experiment.status, conclusion: experiment.conclusion, winnerVariantId: experiment.winnerVariantId }) };
  }

  return { error: "Este paso de Performance Intelligence no tiene una operación configurada." };
}

export interface WorkflowSnapshotSource {
  id: string;
  version: number;
  revisionId: string | null;
  isDraftTest: boolean;
  name: string;
  description: string | null;
  category: string | null;
  variables: string[];
  steps: WorkflowStep[];
}

/**
 * Builds the immutable snapshot a WorkflowRun executes against — resolves
 * and ownership-checks every referenced resource ONCE, server-side, and
 * freezes it. If anything referenced is unavailable, the whole run refuses
 * to start (fail fast) rather than failing deep into execution. Reused
 * verbatim by publish-time validation (with the result discarded — only
 * the errors matter there) so "would this actually run" is answered by the
 * same code real execution uses, never a second implementation.
 */
export async function buildWorkflowSnapshot(source: WorkflowSnapshotSource, userId: string, projectId: string): Promise<WorkflowSnapshot | { error: string }> {
  const brandContext = await buildAiToolBrandContext(projectId, userId);
  const resources: Record<string, ExecutionResourceContext> = {};
  for (const step of source.steps) {
    const resolved = await buildResourcesForStep(step, userId, projectId, brandContext);
    if ("error" in resolved) return { error: `${resolved.error} (paso "${step.label}")` };
    resources[step.id] = resolved;
  }
  return {
    workflowId: source.id,
    workflowVersion: source.version,
    revisionId: source.revisionId,
    isDraftTest: source.isDraftTest,
    name: source.name,
    description: source.description,
    category: source.category,
    variables: source.variables,
    stopOnError: true,
    steps: source.steps,
    brandContext,
    resources,
    createdAt: new Date().toISOString(),
  };
}
