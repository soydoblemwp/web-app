"use client";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { UseLocalAIResult } from "@/hooks/use-local-ai";

type LocalAIStatusProps = Pick<
  UseLocalAIResult,
  "status" | "progress" | "progressText" | "error" | "modelSizeLabel" | "cancel" | "retry"
>;

/**
 * Shared status/consent UI for every local-AI form: the pre-download notice,
 * download/init progress with a cancel button, a generating indicator, and
 * the WebGPU-unsupported and error/retry states. No AI form should roll its
 * own copy of these strings.
 */
export function LocalAIStatusPanel({ ai }: { ai: LocalAIStatusProps }) {
  if (ai.status === "unsupported") {
    return (
      <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
        Este dispositivo o navegador no admite la IA local. Utiliza una versión reciente de Chrome o Edge en un
        equipo compatible.
      </p>
    );
  }

  if (ai.status === "idle") {
    return (
      <p className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
        La IA funciona gratuitamente en tu dispositivo. La primera vez será necesario descargar el modelo
        {ai.modelSizeLabel ? ` (descarga aproximada: ${ai.modelSizeLabel})` : ""}. El rendimiento depende de tu
        equipo.
      </p>
    );
  }

  if (ai.status === "loading" || ai.status === "generating") {
    const isLoading = ai.status === "loading";
    return (
      <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
        <p>{isLoading ? ai.progressText || "Descargando e inicializando el modelo local..." : "Generando con IA local..."}</p>
        {isLoading ? <Progress value={Math.round(ai.progress * 100)} /> : null}
        <Button type="button" variant="outline" size="sm" onClick={ai.cancel}>
          Cancelar
        </Button>
      </div>
    );
  }

  if (ai.status === "error") {
    return (
      <div role="alert" className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
        <p>{ai.error ?? "No se pudo generar contenido con la IA local."}</p>
        <Button type="button" variant="outline" size="sm" onClick={ai.retry}>
          Reintentar
        </Button>
      </div>
    );
  }

  return null;
}
