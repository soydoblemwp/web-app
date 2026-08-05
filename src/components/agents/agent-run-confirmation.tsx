"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil, Play } from "lucide-react";
import { updateAgentRunInputAction, startAgentRunAction } from "@/server/actions/agent-runs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AgentIcon } from "@/components/agents/agent-icon";
import type { AgentRunDetailData } from "@/components/agents/types";

export function AgentRunConfirmation({
  projectId,
  run,
  stepLabels,
}: {
  projectId: string;
  run: AgentRunDetailData;
  stepLabels: { agentRef: string; name: string; icon: string | null }[];
}) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [editing, setEditing] = useState(false);

  async function handleStart() {
    setStarting(true);
    const result = await startAgentRunAction(projectId, run.id);
    if (result.error) {
      toast.error(result.error);
      setStarting(false);
      return;
    }
    toast.success("Ejecución iniciada.");
    router.refresh();
  }

  async function handleEdit() {
    setEditing(true);
    const result = await updateAgentRunInputAction(projectId, run.id, { values: {}, context: {} });
    if (result.error) toast.error(result.error);
    router.refresh();
  }

  const values = run.approvedInput?.values ?? {};

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumen antes de ejecutar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Flujo</p>
            <div className="flex flex-wrap items-center gap-2">
              {stepLabels.map((s, i) => (
                <span key={`${s.agentRef}-${i}`} className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
                  <AgentIcon agentRef={s.agentRef} customIconName={s.icon} className="size-3.5" /> {s.name}
                </span>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Entrada</p>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              {Object.entries(values)
                .filter(([, v]) => v !== undefined && v !== null && v !== "")
                .map(([key, v]) => (
                  <div key={key}>
                    <dt className="text-muted-foreground">{key}</dt>
                    <dd className="truncate font-medium">{Array.isArray(v) ? v.join(", ") : String(v)}</dd>
                  </div>
                ))}
            </dl>
          </div>
          {run.brandProfile ? <Badge variant="outline">Brand Profile: {run.brandProfile.name}</Badge> : null}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <Button type="button" className="w-full" disabled={starting} onClick={handleStart}>
          {starting ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} Iniciar ejecución
        </Button>
        <Button type="button" variant="outline" className="w-full" disabled={editing} onClick={handleEdit}>
          <Pencil className="size-4" /> Editar entrada
        </Button>
      </div>
    </div>
  );
}
