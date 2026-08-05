"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { processSourceStageAction, retrySourceStageAction, cancelSourceProcessingAction } from "@/server/actions/knowledge-processing";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PROCESSING_STAGE_LABELS, isTerminalSourceStatus } from "@/components/knowledge/labels";
import type { KnowledgeProcessingStage } from "@/lib/knowledge/types";

const STAGE_ORDER: KnowledgeProcessingStage[] = ["REGISTER", "EXTRACT", "NORMALIZE", "CHUNK", "INDEX", "FINALIZE"];

/**
 * Drives a source's processing pipeline one stage at a time (spec section
 * 30: never one long-lived request) — calls processSourceStageAction
 * repeatedly, same "driving loop" shape as AI Agent Studio/Marketing
 * Brain's execution panels, until the source reaches a terminal status.
 */
export function ProcessingDriver({ projectId, sourceId, status, autoStart = true }: { projectId: string; sourceId: string; status: string; autoStart?: boolean }) {
  const router = useRouter();
  const [driving, setDriving] = useState(false);
  const [currentStage, setCurrentStage] = useState<KnowledgeProcessingStage | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const startedRef = useRef(false);

  const terminal = isTerminalSourceStatus(status);

  async function driveLoop() {
    if (driving) return;
    setDriving(true);
    cancelledRef.current = false;
    setError(null);

    try {
      while (!cancelledRef.current) {
        const result = await processSourceStageAction(projectId, sourceId);
        setCurrentStage(result.stage);
        if (result.conflict) {
          setError(result.errorMessage ?? "Procesamiento en curso en otra pestaña.");
          break;
        }
        if (result.done) {
          if (result.errorMessage) setError(result.errorMessage);
          break;
        }
      }
    } finally {
      setDriving(false);
      router.refresh();
    }
  }

  useEffect(() => {
    if (autoStart && !terminal && !startedRef.current) {
      startedRef.current = true;
      void driveLoop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, terminal]);

  async function handleCancel() {
    cancelledRef.current = true;
    await cancelSourceProcessingAction(projectId, sourceId);
    router.refresh();
  }

  async function handleRetry() {
    const result = await retrySourceStageAction(projectId, sourceId, "EXTRACT");
    if (!result.ok) {
      toast.error(result.errorMessage ?? "No se pudo reintentar.");
      return;
    }
    startedRef.current = false;
    setError(null);
    router.refresh();
    void driveLoop();
  }

  if (terminal && status !== "FAILED" && status !== "NEEDS_OCR") return null;

  const stageIndex = currentStage ? STAGE_ORDER.indexOf(currentStage) : -1;
  const percent = stageIndex >= 0 ? Math.round(((stageIndex + 1) / STAGE_ORDER.length) * 100) : status === "QUEUED" ? 5 : 0;

  if (status === "FAILED" || status === "NEEDS_OCR") {
    return (
      <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
        <p className="text-sm text-destructive">{error ?? "El procesamiento falló."}</p>
        {status === "FAILED" ? (
          <Button type="button" size="sm" variant="outline" onClick={handleRetry}>
            <RotateCcw className="size-3.5" /> Reintentar desde extracción
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center gap-2 text-sm">
        {driving ? <Loader2 className="size-4 animate-spin text-primary" /> : null}
        <span>{currentStage ? PROCESSING_STAGE_LABELS[currentStage] : "Preparando..."}</span>
      </div>
      <Progress value={percent} />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        {!driving ? (
          <Button type="button" size="sm" variant="outline" onClick={driveLoop}>
            Continuar procesamiento
          </Button>
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={handleCancel}>
            <X className="size-3.5" /> Cancelar
          </Button>
        )}
      </div>
    </div>
  );
}
