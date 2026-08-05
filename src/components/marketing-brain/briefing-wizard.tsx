"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Check, AlertTriangle, Sparkles } from "lucide-react";
import {
  updateMarketingBrainBriefingAction,
  updateMarketingBrainStagesConfigAction,
  confirmMarketingBrainPlanAction,
} from "@/server/actions/marketing-brain";
import { useEditorAutosave } from "@/components/editor/use-editor-autosave";
import { normalizeBriefing } from "@/lib/marketing-brain/normalize";
import { buildExecutionPlan, STAGE_DEFINITIONS, canDisableStage } from "@/lib/marketing-brain/plan";
import { MARKETING_BRAIN_APPROVAL_GATE_KEYS } from "@/lib/marketing-brain/types";
import type { StagesConfig, MarketingBrainStepKeyValue } from "@/lib/marketing-brain/types";
import { CAMPAIGN_CHANNELS } from "@/lib/campaign-studio/channels";
import { PerformanceContextSection } from "@/components/marketing-brain/performance-context-section";
import type { PerformanceContextSelectionInput } from "@/lib/marketing-brain/performance-context-types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import type { MarketingBrainBriefing } from "@/lib/marketing-brain/types";
import type { MarketingBrainRunDetailData } from "@/components/marketing-brain/types";

const csv = (arr: string[] | undefined) => (arr ?? []).join(", ");
const fromCsv = (value: string): string[] =>
  value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

export function BriefingWizard({
  projectId,
  run,
  members,
  campaigns,
  brandProfiles,
}: {
  projectId: string;
  run: MarketingBrainRunDetailData;
  members: { id: string; name: string | null; email: string }[];
  campaigns: { id: string; name: string }[];
  brandProfiles: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [briefing, setBriefing] = useState<MarketingBrainBriefing>(run.briefing);
  const briefingRef = useRef(briefing);
  const [stagesConfig, setStagesConfig] = useState<StagesConfig>(run.stagesConfig as StagesConfig);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const autosave = useEditorAutosave(async () => {
    const result = await updateMarketingBrainBriefingAction(projectId, run.id, briefingRef.current);
    if (result.error) throw new Error(result.error);
  });

  function patch(next: Partial<MarketingBrainBriefing>) {
    setBriefing((prev) => {
      const merged = { ...prev, ...next };
      briefingRef.current = merged;
      return merged;
    });
    autosave.notifyChange(JSON.stringify({ ...briefingRef.current, ...next }));
  }

  const normalized = normalizeBriefing(briefing);
  const mode = briefing.mode ?? "quick";
  const plan = buildExecutionPlan(normalized, stagesConfig);

  async function toggleStage(key: MarketingBrainStepKeyValue) {
    const nextEnabled = { ...stagesConfig.enabled, [key]: stagesConfig.enabled[key] === false };
    const next = { ...stagesConfig, enabled: nextEnabled };
    setStagesConfig(next);
    const result = await updateMarketingBrainStagesConfigAction(projectId, run.id, next);
    if (result.error) toast.error(result.error);
  }

  async function toggleApprovalGate(key: MarketingBrainStepKeyValue) {
    const has = stagesConfig.approvalGates.includes(key);
    const next = { ...stagesConfig, approvalGates: has ? stagesConfig.approvalGates.filter((k) => k !== key) : [...stagesConfig.approvalGates, key] };
    setStagesConfig(next);
    const result = await updateMarketingBrainStagesConfigAction(projectId, run.id, next);
    if (result.error) toast.error(result.error);
  }

  async function handleConfirm() {
    setConfirming(true);
    setConfirmError(null);
    const result = await confirmMarketingBrainPlanAction(projectId, run.id);
    if (result.error) {
      setConfirmError(result.error);
      toast.error(result.error);
      setConfirming(false);
      return;
    }
    toast.success("Plan confirmado — revisa el resumen antes de iniciar.");
    router.refresh();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <Tabs value={mode} onValueChange={(v) => v && patch({ mode: v as "quick" | "advanced" | "performance" })}>
          <TabsList>
            <TabsTrigger value="quick">Briefing rápido</TabsTrigger>
            <TabsTrigger value="advanced">Briefing avanzado</TabsTrigger>
            <TabsTrigger value="performance">Contexto de rendimiento</TabsTrigger>
          </TabsList>

          <TabsContent value="quick" className="space-y-4 pt-3">
            <div className="space-y-1.5">
              <Label htmlFor="mb-description">Describe lo que quieres lograr</Label>
              <Textarea
                id="mb-description"
                rows={3}
                value={briefing.description ?? ""}
                onChange={(e) => patch({ description: e.target.value })}
                placeholder="Quiero promocionar un curso de inglés durante septiembre en Instagram, TikTok y email."
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="mb-product">Producto, servicio o marca</Label>
                <Input id="mb-product" value={briefing.productOrService ?? ""} onChange={(e) => patch({ productOrService: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mb-objective">Objetivo principal</Label>
                <Input id="mb-objective" value={briefing.objective ?? ""} onChange={(e) => patch({ objective: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mb-start">Fecha inicial</Label>
                <Input id="mb-start" type="date" value={briefing.startDate ?? ""} onChange={(e) => patch({ startDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mb-end">Fecha final</Label>
                <Input id="mb-end" type="date" value={briefing.endDate ?? ""} onChange={(e) => patch({ endDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mb-language">Idioma</Label>
                <Input id="mb-language" value={briefing.language ?? ""} onChange={(e) => patch({ language: e.target.value })} placeholder="es" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mb-timezone">Zona horaria</Label>
                <Input id="mb-timezone" value={briefing.timezone ?? ""} onChange={(e) => patch({ timezone: e.target.value })} placeholder="UTC" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Plataformas</Label>
              <div className="flex flex-wrap gap-3">
                {CAMPAIGN_CHANNELS.map((channel) => {
                  const checked = (briefing.platforms ?? []).includes(channel.id);
                  return (
                    <label key={channel.id} className="flex items-center gap-1.5 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => {
                          const current = briefing.platforms ?? [];
                          patch({ platforms: checked ? current.filter((p) => p !== channel.id) : [...current, channel.id] });
                        }}
                      />
                      {channel.label}
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Brand Profile</Label>
              <Select value={briefing.brandProfileId ?? "__none__"} onValueChange={(v) => v && patch({ brandProfileId: v === "__none__" ? null : v })}>
                <SelectTrigger className="w-full" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Ninguno</SelectItem>
                  {brandProfiles.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Campaña</Label>
              <div className="flex flex-wrap gap-3 text-sm">
                {(["new", "existing", "duplicate"] as const).map((option) => (
                  <label key={option} className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="campaignMode"
                      checked={(briefing.campaignMode ?? "new") === option}
                      onChange={() => patch({ campaignMode: option })}
                    />
                    {option === "new" ? "Crear nueva" : option === "existing" ? "Reutilizar existente" : "Duplicar existente"}
                  </label>
                ))}
              </div>
              {briefing.campaignMode && briefing.campaignMode !== "new" ? (
                <Select value={briefing.existingCampaignId ?? ""} onValueChange={(v) => v && patch({ existingCampaignId: v })}>
                  <SelectTrigger className="w-full" size="sm">
                    <SelectValue placeholder="Selecciona una campaña" />
                  </SelectTrigger>
                  <SelectContent>
                    {campaigns.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </div>
          </TabsContent>

          <TabsContent value="advanced" className="space-y-4 pt-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Audiencia objetivo</Label>
                <Textarea rows={2} value={briefing.audience ?? ""} onChange={(e) => patch({ audience: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Ubicación</Label>
                <Input value={briefing.audienceLocation ?? ""} onChange={(e) => patch({ audienceLocation: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Rango de edad</Label>
                <Input value={briefing.audienceAgeRange ?? ""} onChange={(e) => patch({ audienceAgeRange: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Intereses (separados por coma)</Label>
                <Input value={csv(briefing.audienceInterests)} onChange={(e) => patch({ audienceInterests: fromCsv(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>Problemas</Label>
                <Input value={csv(briefing.audiencePainPoints)} onChange={(e) => patch({ audiencePainPoints: fromCsv(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>Necesidades</Label>
                <Input value={csv(briefing.audienceNeeds)} onChange={(e) => patch({ audienceNeeds: fromCsv(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>Objeciones</Label>
                <Input value={csv(briefing.audienceObjections)} onChange={(e) => patch({ audienceObjections: fromCsv(e.target.value) })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Nivel de conocimiento</Label>
                <Input value={briefing.audienceAwareness ?? ""} onChange={(e) => patch({ audienceAwareness: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Propuesta de valor</Label>
                <Textarea rows={2} value={briefing.valueProposition ?? ""} onChange={(e) => patch({ valueProposition: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Oferta</Label>
                <Input value={briefing.offer ?? ""} onChange={(e) => patch({ offer: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>CTA principal</Label>
                <Input value={briefing.primaryCTA ?? ""} onChange={(e) => patch({ primaryCTA: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Tono</Label>
                <Input value={briefing.tone ?? ""} onChange={(e) => patch({ tone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Palabras prohibidas</Label>
                <Input value={csv(briefing.forbiddenWords)} onChange={(e) => patch({ forbiddenWords: fromCsv(e.target.value) })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Competidores de referencia</Label>
                <Input value={csv(briefing.competitors)} onChange={(e) => patch({ competitors: fromCsv(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>Presupuesto (opcional)</Label>
                <Input
                  type="number"
                  value={briefing.budget ?? ""}
                  onChange={(e) => patch({ budget: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Frecuencia (piezas/semana)</Label>
                <Input
                  type="number"
                  value={briefing.frequencyPerWeek ?? ""}
                  onChange={(e) => patch({ frequencyPerWeek: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Días preferidos</Label>
                <Input value={csv(briefing.preferredDays)} onChange={(e) => patch({ preferredDays: fromCsv(e.target.value) })} placeholder="lunes, miércoles" />
              </div>
              <div className="space-y-1.5">
                <Label>Horas preferidas</Label>
                <Input value={csv(briefing.preferredHours)} onChange={(e) => patch({ preferredHours: fromCsv(e.target.value) })} placeholder="09:00, 18:00" />
              </div>
              <div className="space-y-1.5">
                <Label>Formatos deseados</Label>
                <Input value={csv(briefing.desiredFormats)} onChange={(e) => patch({ desiredFormats: fromCsv(e.target.value) })} placeholder="reel, carrusel" />
              </div>
              <div className="space-y-1.5">
                <Label>Métricas objetivo</Label>
                <Input value={csv(briefing.targetMetrics)} onChange={(e) => patch({ targetMetrics: fromCsv(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>Cantidad máxima de piezas</Label>
                <Input
                  type="number"
                  value={briefing.maxPieces ?? ""}
                  onChange={(e) => patch({ maxPieces: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Responsable</Label>
                <Select value={briefing.assigneeId ?? "__none__"} onValueChange={(v) => v && patch({ assigneeId: v === "__none__" ? null : v })}>
                  <SelectTrigger className="w-full" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin asignar</SelectItem>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name || m.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Aprobador</Label>
                <Select value={briefing.approverId ?? "__none__"} onValueChange={(v) => v && patch({ approverId: v === "__none__" ? null : v })}>
                  <SelectTrigger className="w-full" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin asignar</SelectItem>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name || m.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2 rounded-lg border p-3">
              <ToggleRow label="Requiere aprobación antes de publicar" checked={briefing.requireApproval ?? false} onChange={(v) => patch({ requireApproval: v })} />
              <ToggleRow label="Generar borradores automáticamente" checked={briefing.autoGenerateDrafts ?? true} onChange={(v) => patch({ autoGenerateDrafts: v })} />
              <ToggleRow label="Adaptar automáticamente a otras plataformas" checked={briefing.autoAdaptPlatforms ?? false} onChange={(v) => patch({ autoAdaptPlatforms: v })} />
              <ToggleRow label="Crear publicaciones automáticamente" checked={briefing.autoCreatePublications ?? true} onChange={(v) => patch({ autoCreatePublications: v })} />
              <div className="flex items-center justify-between gap-4">
                <Label className="text-sm">Programación</Label>
                <Select value={briefing.schedulingMode ?? "manual"} onValueChange={(v) => v && patch({ schedulingMode: v as "manual" | "automatic" })}>
                  <SelectTrigger size="sm" className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="automatic">Automática</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="performance" className="pt-3">
            <PerformanceContextSection
              projectId={projectId}
              runId={run.id}
              campaignId={briefing.campaignMode !== "new" ? (briefing.existingCampaignId ?? null) : run.campaign?.id ?? null}
              selection={briefing.performanceContext ?? { mode: "NONE" }}
              onChange={(next: PerformanceContextSelectionInput) => patch({ performanceContext: next })}
            />
          </TabsContent>
        </Tabs>
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

        {normalized.inferredFields.length > 0 ? (
          <Card>
            <CardContent className="space-y-1 py-3 text-xs">
              <p className="font-medium">Sugerencias de la IA (editables)</p>
              <p className="text-muted-foreground">Campos completados automáticamente: {normalized.inferredFields.join(", ")}</p>
            </CardContent>
          </Card>
        ) : null}

        {normalized.warnings.length > 0 ? (
          <Card className="border-amber-500/40">
            <CardContent className="space-y-1 py-3 text-xs">
              {normalized.warnings.map((w, i) => (
                <p key={i} className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" /> {w}
                </p>
              ))}
            </CardContent>
          </Card>
        ) : null}

        {normalized.errors.length > 0 ? (
          <Card className="border-destructive/40">
            <CardContent className="space-y-1 py-3 text-xs text-destructive">
              {normalized.errors.map((e, i) => (
                <p key={i}>{e}</p>
              ))}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardContent className="space-y-2 py-3">
            <p className="text-xs font-medium">Etapas ({plan.totals.aiGenerations} generaciones de IA estimadas)</p>
            {STAGE_DEFINITIONS.map((def) => {
              const enabled = stagesConfig.enabled[def.key] !== false;
              const canDisable = canDisableStage(def.key, stagesConfig);
              const canGate = MARKETING_BRAIN_APPROVAL_GATE_KEYS.includes(def.key);
              return (
                <div key={def.key} className="flex items-center justify-between gap-2 text-xs">
                  <label className="flex min-w-0 flex-1 items-center gap-1.5">
                    <Checkbox
                      checked={enabled}
                      disabled={!def.toggleable || (!canDisable && enabled)}
                      onCheckedChange={() => toggleStage(def.key)}
                    />
                    <span className="truncate">{def.label}</span>
                  </label>
                  {canGate && enabled ? (
                    <label className="flex shrink-0 items-center gap-1 text-muted-foreground" title="Requerir aprobación antes de esta etapa">
                      <Checkbox checked={stagesConfig.approvalGates.includes(def.key)} onCheckedChange={() => toggleApprovalGate(def.key)} />
                      Aprobar
                    </label>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>

        {plan.exceedsVolumeLimit ? (
          <Card className="border-destructive/40">
            <CardContent className="py-3 text-xs text-destructive">
              Esta configuración supera el máximo de generaciones de IA permitidas. Reduce piezas o plataformas.
            </CardContent>
          </Card>
        ) : null}

        {confirmError ? <p className="text-xs text-destructive">{confirmError}</p> : null}

        <Button type="button" className="w-full" disabled={confirming || normalized.errors.length > 0 || plan.exceedsVolumeLimit} onClick={handleConfirm}>
          {confirming ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Ver plan y confirmar
        </Button>
      </div>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label className="text-sm">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
