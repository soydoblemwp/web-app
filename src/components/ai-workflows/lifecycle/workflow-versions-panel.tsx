"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import {
  listWorkflowRevisionsAction,
  compareWorkflowRevisionsAction,
  restoreRevisionAsDraftAction,
} from "@/server/actions/workflow-lifecycle";
import { getVersionMetricsAction } from "@/server/actions/workflow-analytics";
import type { VersionMetricsRow } from "@/server/services/workflow-analytics";
import { WorkflowDiffView } from "@/components/ai-workflows/lifecycle/workflow-diff-view";
import type { WorkflowDiffResult } from "@/lib/ai-workflows/workflow-diff";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type RevisionSummary = Awaited<ReturnType<typeof listWorkflowRevisionsAction>>[number];

function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}
function formatPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

/**
 * "Versiones" — every published revision of this Workflow, most recent
 * first, each showing its execution metrics reused verbatim from the
 * existing analytics service (no second metrics calculation). Opening a
 * revision compares it against the one immediately before it; "Restaurar
 * esta versión" replaces the current DRAFT with that revision's content —
 * it never rewrites history or deletes later revisions.
 */
export function WorkflowVersionsPanel({
  projectId,
  workflowId,
  onDraftRestored,
}: {
  projectId: string;
  workflowId: string;
  onDraftRestored: () => void;
}) {
  const [revisions, setRevisions] = useState<RevisionSummary[]>([]);
  const [versionMetrics, setVersionMetrics] = useState<VersionMetricsRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openRevisionId, setOpenRevisionId] = useState<string | null>(null);
  const [diffByRevisionId, setDiffByRevisionId] = useState<Record<string, WorkflowDiffResult>>({});
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listWorkflowRevisionsAction(projectId, workflowId),
      getVersionMetricsAction(projectId, workflowId, { preset: "90d" }),
    ]).then(([revs, metrics]) => {
      if (cancelled) return;
      setRevisions(revs);
      setVersionMetrics("data" in metrics ? metrics.data : []);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, workflowId]);

  async function handleToggle(revision: RevisionSummary, index: number) {
    const open = openRevisionId === revision.id;
    setOpenRevisionId(open ? null : revision.id);
    if (open || diffByRevisionId[revision.id]) return;
    const previous = revisions[index + 1]; // list is sorted desc by version
    if (!previous) return;
    const result = await compareWorkflowRevisionsAction(projectId, workflowId, previous.id, revision.id);
    if ("data" in result) setDiffByRevisionId((prev) => ({ ...prev, [revision.id]: result.data.diff }));
  }

  async function handleRestore(revisionId: string) {
    setRestoring(revisionId);
    const result = await restoreRevisionAsDraftAction({ projectId, workflowId, revisionId });
    setRestoring(null);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success("Borrador restaurado desde esta versión. Publica para crear una versión nueva.");
    onDraftRestored();
  }

  if (!loaded) return <p className="text-sm text-muted-foreground">Cargando versiones...</p>;
  if (revisions.length === 0) {
    return <p className="text-sm text-muted-foreground">Este workflow todavía no tiene ninguna versión publicada.</p>;
  }

  return (
    <div className="space-y-2">
      {revisions.map((revision, index) => {
        const open = openRevisionId === revision.id;
        const metrics = versionMetrics.find((m) => m.version === revision.version);
        const changeSummary = revision.changeSummary as { lines: string[] } | null;
        return (
          <div key={revision.id} className="rounded-lg border">
            <button
              type="button"
              onClick={() => handleToggle(revision, index)}
              className="flex w-full flex-wrap items-center justify-between gap-2 p-3 text-left text-sm"
            >
              <div className="flex items-center gap-2">
                <Badge variant={revision.isActive ? "default" : "outline"}>v{revision.version}</Badge>
                {revision.isActive ? <Badge variant="secondary">Activa</Badge> : null}
                <span className="text-xs text-muted-foreground">
                  {revision.publishedAt ? new Date(revision.publishedAt).toLocaleString("es-ES") : "—"}
                </span>
              </div>
              {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </button>

            {open ? (
              <div className="space-y-3 border-t p-3 text-sm">
                {revision.releaseNotes ? (
                  <p className="text-xs italic text-muted-foreground">&quot;{revision.releaseNotes}&quot;</p>
                ) : null}
                {changeSummary && changeSummary.lines.length > 0 ? (
                  <ul className="list-inside list-disc text-xs text-muted-foreground">
                    {changeSummary.lines.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                ) : null}

                {metrics ? (
                  <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <span>Ejecuciones: {metrics.totalRuns}</span>
                    <span>Éxito: {formatPct(metrics.successRate)}</span>
                    <span>Duración media: {formatMs(metrics.avgDurationMs)}</span>
                    <span>Uso IA: {metrics.aiUsage}</span>
                  </div>
                ) : null}

                {diffByRevisionId[revision.id] ? (
                  <div className="rounded-md bg-muted/30 p-2">
                    <p className="mb-1 text-xs font-medium">Cambios respecto a la versión anterior</p>
                    <WorkflowDiffView diff={diffByRevisionId[revision.id]} />
                  </div>
                ) : null}

                <Button type="button" variant="outline" size="sm" disabled={restoring === revision.id} onClick={() => handleRestore(revision.id)}>
                  <RotateCcw className="size-3.5" /> {restoring === revision.id ? "Restaurando..." : "Restaurar esta versión"}
                </Button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
