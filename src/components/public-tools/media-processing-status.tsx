"use client";

import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import type { ProcessingStep } from "@/lib/public-tools/media/ffmpeg-progress";

const STEP_LABELS: Record<ProcessingStep, string> = {
  "loading-core": "Descargando el motor multimedia (puede tardar la primera vez)...",
  initializing: "Inicializando el motor multimedia...",
  "writing-input": "Preparando el archivo...",
  processing: "Procesando...",
  "reading-output": "Leyendo el resultado...",
  finalizing: "Finalizando...",
  done: "Listo.",
};

/** Shared FFmpeg progress display (spec section 17: real percent from processed time, indeterminate otherwise; spec section 37: shows the core-download step explicitly, never hides that the first load fetches a large same-origin asset). */
export function MediaProcessingStatus({
  step,
  percent,
  onCancel,
}: {
  step: ProcessingStep | null;
  percent: number | null;
  onCancel?: () => void;
}) {
  if (!step) return null;
  return (
    <div aria-live="polite" className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
      <p>{STEP_LABELS[step]}</p>
      {percent !== null ? <Progress value={percent} /> : <p className="text-xs text-muted-foreground">Progreso no determinable para este paso.</p>}
      {onCancel && step !== "done" ? (
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
      ) : null}
    </div>
  );
}
