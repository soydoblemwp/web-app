"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Play, Save } from "lucide-react";
import { planWorkflowRun, type WorkflowStep, type WorkflowRunResult } from "@/lib/ai-workflows/engine";
import { saveWorkflowExecutionAction } from "@/server/actions/ai-workflows";
import { parseResultBlocks } from "@/lib/ai-workspace/blocks";
import { UniversalResultViewer } from "@/components/workspace/universal-result-viewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

/**
 * "Simular ejecución": resolves the workflow's full run PLAN locally via
 * the pure Workflow Engine — never a real AI call (see
 * src/lib/ai-workflows/engine.ts's own module doc). The resolved trace can
 * then optionally be saved into Workspace as a ContentItem, reusing the
 * exact same UniversalResultViewer every generated result already renders
 * through.
 */
export function WorkflowRunPanel({
  projectId,
  workflowId,
  workflowName,
  steps,
  variables,
}: {
  projectId: string;
  workflowId: string;
  workflowName: string;
  steps: WorkflowStep[];
  variables: string[];
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [run, setRun] = useState<WorkflowRunResult | null>(null);
  const [saving, setSaving] = useState(false);

  function handleRun() {
    setRun(planWorkflowRun(steps, values));
  }

  const traceText = useMemo(() => {
    if (!run || run.steps.length === 0) return "";
    return run.steps
      .map((step, index) => `### Paso ${index + 1} — ${step.label}\n${step.simulatedOutput}`)
      .join("\n\n");
  }, [run]);
  const traceBlocks = useMemo(() => parseResultBlocks(traceText), [traceText]);

  async function handleSaveToWorkspace() {
    if (!run || !traceText) return;
    setSaving(true);
    const result = await saveWorkflowExecutionAction({ projectId, workflowId, workflowName, body: traceText });
    setSaving(false);
    if (result.error) toast.error(result.error);
    else toast.success("Ejecución guardada en el Workspace.");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
        <Badge variant="secondary">Vista previa (simulada)</Badge>
        <p className="text-xs text-muted-foreground">
          No llama al motor de IA ni consume cuota — solo muestra cómo se resolverían variables y dependencias. Usa
          &quot;Ejecutar workflow&quot; para una ejecución real.
        </p>
      </div>

      {variables.length === 0 ? (
        <p className="text-sm text-muted-foreground">Este workflow no tiene variables de entrada.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {variables.map((name) => (
            <div key={name} className="space-y-1.5">
              <Label htmlFor={`workflow-var-${workflowId}-${name}`}>{`{{${name}}}`}</Label>
              <Input
                id={`workflow-var-${workflowId}-${name}`}
                value={values[name] ?? ""}
                onChange={(event) => setValues((prev) => ({ ...prev, [name]: event.target.value }))}
              />
            </div>
          ))}
        </div>
      )}

      <Button type="button" variant="outline" size="sm" onClick={handleRun}>
        <Play className="size-3.5" /> Simular ejecución
      </Button>

      {run ? (
        run.issues.length > 0 ? (
          <div className="space-y-1 rounded-lg border border-destructive/50 p-3">
            <p className="text-sm font-medium text-destructive">Este workflow no se puede ejecutar todavía:</p>
            {run.issues.map((issue, index) => (
              <p key={index} className="text-xs text-destructive">
                {issue.message}
              </p>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/30 p-3">
              <UniversalResultViewer blocks={traceBlocks} />
            </div>
            <Button type="button" variant="outline" size="sm" disabled={saving} onClick={handleSaveToWorkspace}>
              <Save className="size-3.5" /> {saving ? "Guardando..." : "Guardar en Workspace"}
            </Button>
          </div>
        )
      ) : null}
    </div>
  );
}
