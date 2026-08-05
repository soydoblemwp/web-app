"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil, Rocket, AlertTriangle } from "lucide-react";
import { updateMarketingBrainBriefingAction, startMarketingBrainRunAction } from "@/server/actions/marketing-brain";
import { normalizeBriefing } from "@/lib/marketing-brain/normalize";
import { buildExecutionPlan } from "@/lib/marketing-brain/plan";
import { campaignChannelLabel } from "@/lib/campaign-studio/channels";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { MarketingBrainRunDetailData } from "@/components/marketing-brain/types";
import type { StagesConfig } from "@/lib/marketing-brain/types";

export function PlanConfirmation({ projectId, run }: { projectId: string; run: MarketingBrainRunDetailData }) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [editing, setEditing] = useState(false);

  const normalized = normalizeBriefing(run.approvedBriefing ?? run.briefing);
  const plan = buildExecutionPlan(normalized, run.stagesConfig as StagesConfig);

  async function handleStart() {
    setStarting(true);
    const result = await startMarketingBrainRunAction(projectId, run.id);
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
    const result = await updateMarketingBrainBriefingAction(projectId, run.id, {});
    if (result.error) toast.error(result.error);
    router.refresh();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Confirmación previa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Campaña">{run.campaign?.name ?? (normalized.campaignMode === "new" ? "Se creará una nueva" : "Se reutilizará")}</Field>
            <Field label="Rango">
              {normalized.startDate} → {normalized.endDate}
            </Field>
            <Field label="Zona horaria">{normalized.timezone}</Field>
            <Field label="Plataformas">{normalized.platforms.map((p) => campaignChannelLabel(p)).join(", ")}</Field>
            <Field label="Brand Profile">{normalized.brandProfileId ? "Configurado" : "Ninguno"}</Field>
            <Field label="Idioma">{normalized.language}</Field>
            <Field label="Pilares estimados">{plan.totals.pillars}</Field>
            <Field label="Piezas estimadas">{plan.totals.pieces}</Field>
            <Field label="Borradores (ContentItem)">{plan.totals.contentItems}</Field>
            <Field label="Adaptaciones">{plan.totals.adaptations}</Field>
            <Field label="Publicaciones (SocialPost)">{plan.totals.socialPosts}</Field>
            <Field label="Generaciones de IA">{plan.totals.aiGenerations}</Field>
            <Field label="Aprobación">{normalized.requireApproval ? "Requerida" : "No requerida"}</Field>
            <Field label="Programación">{normalized.schedulingMode === "automatic" ? "Automática" : "Manual"}</Field>
          </dl>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Etapas activas</p>
            <div className="flex flex-wrap gap-1.5">
              {plan.stages.map((s) => (
                <Badge key={s.key} variant={s.enabled ? "secondary" : "outline"}>
                  {s.label}
                  {s.requiresApproval ? " · aprobación" : ""}
                </Badge>
              ))}
            </div>
          </div>

          {plan.warnings.length > 0 ? (
            <div className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
              {plan.warnings.map((w, i) => (
                <p key={i} className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {w}
                </p>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <Button type="button" className="w-full" disabled={starting || plan.exceedsVolumeLimit} onClick={handleStart}>
          {starting ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />} Iniciar ejecución
        </Button>
        <Button type="button" variant="outline" className="w-full" disabled={editing} onClick={handleEdit}>
          <Pencil className="size-4" /> Editar briefing
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}
