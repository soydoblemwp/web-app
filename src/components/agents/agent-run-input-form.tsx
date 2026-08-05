"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Check, AlertTriangle, ArrowRight } from "lucide-react";
import { updateAgentRunInputAction, confirmAgentRunAction } from "@/server/actions/agent-runs";
import { useEditorAutosave } from "@/components/editor/use-editor-autosave";
import { DynamicInputForm } from "@/components/agents/dynamic-input-form";
import { ContextBuilder } from "@/components/agents/context-builder";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AgentInputFieldSpec, AgentContextSelection } from "@/lib/agents/types";
import type { AgentRunDetailData } from "@/components/agents/types";

export function AgentRunInputForm({
  projectId,
  run,
  entryAgentName,
  requiredInputs,
  optionalInputs,
  brandProfiles,
}: {
  projectId: string;
  run: AgentRunDetailData;
  entryAgentName: string;
  requiredInputs: AgentInputFieldSpec[];
  optionalInputs: AgentInputFieldSpec[];
  brandProfiles: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, unknown>>(run.input.values ?? {});
  const [context, setContext] = useState<AgentContextSelection>(run.input.context ?? {});
  const draftRef = useRef({ values, context });
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const autosave = useEditorAutosave(async () => {
    const result = await updateAgentRunInputAction(projectId, run.id, draftRef.current);
    if (result.error) throw new Error(result.error);
  });

  function patchValues(key: string, value: unknown) {
    setValues((prev) => {
      const merged = { ...prev, [key]: value };
      draftRef.current = { values: merged, context: draftRef.current.context };
      autosave.notifyChange(JSON.stringify(draftRef.current));
      return merged;
    });
  }

  function patchContext(next: Partial<AgentContextSelection>) {
    setContext((prev) => {
      const merged = { ...prev, ...next };
      draftRef.current = { values: draftRef.current.values, context: merged };
      autosave.notifyChange(JSON.stringify(draftRef.current));
      return merged;
    });
  }

  async function handleConfirm() {
    setConfirming(true);
    setConfirmError(null);
    const result = await confirmAgentRunAction(projectId, run.id);
    if (result.error) {
      setConfirmError(result.error);
      toast.error(result.error);
      setConfirming(false);
      return;
    }
    toast.success("Entrada confirmada — revisa el resumen antes de iniciar.");
    router.refresh();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{entryAgentName}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <DynamicInputForm projectId={projectId} fields={requiredInputs} values={values} onChange={patchValues} brandProfiles={brandProfiles} />
            {optionalInputs.length > 0 ? (
              <>
                <p className="text-xs font-medium text-muted-foreground">Opcional</p>
                <DynamicInputForm projectId={projectId} fields={optionalInputs} values={values} onChange={patchValues} brandProfiles={brandProfiles} />
              </>
            ) : null}
          </CardContent>
        </Card>
        <ContextBuilder projectId={projectId} context={context} onChange={patchContext} />
      </div>

      <div className="space-y-3">
        <Card>
          <CardContent className="space-y-2 py-4 text-xs">
            <p className="flex items-center gap-1.5 font-medium text-muted-foreground">
              {autosave.status === "saving" ? (
                <>
                  <Loader2 className="size-3 animate-spin" /> Guardando...
                </>
              ) : autosave.status === "saved" ? (
                <>
                  <Check className="size-3 text-emerald-600" /> Guardado
                </>
              ) : autosave.status === "error" ? (
                <>
                  <AlertTriangle className="size-3 text-destructive" /> Error al guardar
                </>
              ) : autosave.status === "pending" ? (
                "Cambios pendientes..."
              ) : (
                "Sin cambios"
              )}
            </p>
          </CardContent>
        </Card>
        {confirmError ? <p className="text-xs text-destructive">{confirmError}</p> : null}
        <Button type="button" className="w-full" disabled={confirming} onClick={handleConfirm}>
          {confirming ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />} Confirmar y ver resumen
        </Button>
      </div>
    </div>
  );
}
