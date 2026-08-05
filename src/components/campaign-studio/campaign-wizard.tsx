"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { updateCampaignBriefingAction, finalizeCampaignWizardAction } from "@/server/actions/campaign-studio";
import { useEditorAutosave, type AutosaveStatus } from "@/components/editor/use-editor-autosave";
import { BrandProfileSelect } from "@/components/brand-profiles/brand-profile-select";
import { CAMPAIGN_CHANNELS } from "@/lib/campaign-studio/channels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { CampaignBriefingInput } from "@/lib/validation/campaign-studio";

const STEPS = [
  { id: "basics", label: "Información básica" },
  { id: "audience", label: "Audiencia" },
  { id: "strategy", label: "Estrategia" },
  { id: "channels", label: "Canales" },
  { id: "frequency", label: "Frecuencia" },
  { id: "confirm", label: "Confirmación" },
] as const;

const AUTOSAVE_LABEL: Record<AutosaveStatus, string> = {
  idle: "",
  pending: "Cambios pendientes",
  saving: "Guardando...",
  saved: "Borrador guardado",
  error: "Error al guardar — reintentando",
};

const WEEKDAYS = [
  { id: "MON", label: "Lun" },
  { id: "TUE", label: "Mar" },
  { id: "WED", label: "Mié" },
  { id: "THU", label: "Jue" },
  { id: "FRI", label: "Vie" },
  { id: "SAT", label: "Sáb" },
  { id: "SUN", label: "Dom" },
];

function TagListEditor({ label, values, onChange, placeholder }: { label: string; values: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState("");

  function add() {
    const value = draft.trim();
    if (!value) return;
    onChange([...values, value]);
    setDraft("");
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-1.5">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="outline" onClick={add}>
          Añadir
        </Button>
      </div>
      {values.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v, i) => (
            <button
              key={`${v}-${i}`}
              type="button"
              onClick={() => onChange(values.filter((_, idx) => idx !== i))}
              className="rounded-full border bg-muted/50 px-2.5 py-0.5 text-xs hover:bg-destructive/10 hover:text-destructive"
              title="Quitar"
            >
              {v} ×
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function CampaignWizard({
  projectId,
  campaignId,
  initial,
}: {
  projectId: string;
  campaignId: string;
  initial: CampaignBriefingInput;
}) {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [briefing, setBriefing] = useState<CampaignBriefingInput>(initial);
  const [finalizing, setFinalizing] = useState(false);
  const briefingRef = useRef(initial);

  const autosave = useEditorAutosave(async () => {
    const result = await updateCampaignBriefingAction(projectId, campaignId, briefingRef.current);
    if (result.error) throw new Error(result.error);
  });

  function patch(next: Partial<CampaignBriefingInput>) {
    setBriefing((prev) => {
      const merged = { ...prev, ...next };
      briefingRef.current = merged;
      return merged;
    });
    autosave.notifyChange(`briefing:${JSON.stringify({ ...briefingRef.current, ...next })}`);
  }

  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (autosave.status === "pending" || autosave.status === "saving") {
        e.preventDefault();
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [autosave.status]);

  function toggleChannel(id: string) {
    const current = briefing.channels ?? [];
    patch({ channels: current.includes(id) ? current.filter((c) => c !== id) : [...current, id] });
  }

  function toggleListValue(field: keyof CampaignBriefingInput, id: string) {
    const current = (briefing[field] as string[] | undefined) ?? [];
    patch({ [field]: current.includes(id) ? current.filter((v) => v !== id) : [...current, id] } as Partial<CampaignBriefingInput>);
  }

  async function handleFinish() {
    setFinalizing(true);
    const result = await finalizeCampaignWizardAction(projectId, campaignId);
    setFinalizing(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Campaña creada. Ahora puedes generar la estrategia con IA.");
    router.refresh();
  }

  const step = STEPS[stepIndex];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between gap-2">
        <ol className="flex flex-1 flex-wrap gap-1.5">
          {STEPS.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setStepIndex(i)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  i === stepIndex ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                )}
              >
                {i + 1}. {s.label}
              </button>
            </li>
          ))}
        </ol>
      </div>
      <p className="text-xs text-muted-foreground">{AUTOSAVE_LABEL[autosave.status]}</p>

      <div className="space-y-4 rounded-xl border p-5">
        {step.id === "basics" ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="w-name">Nombre</Label>
              <Input id="w-name" value={briefing.name ?? ""} onChange={(e) => patch({ name: e.target.value })} maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="w-description">Descripción</Label>
              <Textarea id="w-description" value={briefing.description ?? ""} onChange={(e) => patch({ description: e.target.value })} rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="w-product">Producto o servicio</Label>
              <Input id="w-product" value={briefing.productOrService ?? ""} onChange={(e) => patch({ productOrService: e.target.value })} maxLength={300} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="w-objective">Objetivo principal</Label>
              <Input id="w-objective" value={briefing.objective ?? ""} onChange={(e) => patch({ objective: e.target.value })} maxLength={500} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="w-start">Fecha inicial</Label>
                <Input id="w-start" type="date" value={briefing.startDate ?? ""} onChange={(e) => patch({ startDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="w-end">Fecha final</Label>
                <Input id="w-end" type="date" value={briefing.endDate ?? ""} onChange={(e) => patch({ endDate: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="w-timezone">Zona horaria</Label>
                <Input id="w-timezone" value={briefing.timezone ?? ""} onChange={(e) => patch({ timezone: e.target.value })} placeholder="UTC" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="w-budget">Presupuesto (opcional)</Label>
                <Input
                  id="w-budget"
                  type="number"
                  min={0}
                  value={briefing.budget ?? ""}
                  onChange={(e) => patch({ budget: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
            </div>
            <BrandProfileSelect
              projectId={projectId}
              initialProfileId={briefing.brandProfileId}
              onContextChange={() => {}}
              onProfileChange={(profile) => patch({ brandProfileId: profile?.id ?? null })}
            />
          </div>
        ) : null}

        {step.id === "audience" ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="w-audience">Público objetivo</Label>
              <Textarea id="w-audience" value={briefing.audience ?? ""} onChange={(e) => patch({ audience: e.target.value })} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="w-location">Ubicación</Label>
                <Input id="w-location" value={briefing.audienceLocation ?? ""} onChange={(e) => patch({ audienceLocation: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="w-age">Rango de edad</Label>
                <Input id="w-age" value={briefing.audienceAgeRange ?? ""} onChange={(e) => patch({ audienceAgeRange: e.target.value })} placeholder="25-40" />
              </div>
            </div>
            <TagListEditor label="Intereses" values={briefing.audienceInterests ?? []} onChange={(v) => patch({ audienceInterests: v })} />
            <TagListEditor label="Problemas" values={briefing.audiencePainPoints ?? []} onChange={(v) => patch({ audiencePainPoints: v })} />
            <TagListEditor label="Necesidades" values={briefing.audienceNeeds ?? []} onChange={(v) => patch({ audienceNeeds: v })} />
            <TagListEditor label="Objeciones" values={briefing.audienceObjections ?? []} onChange={(v) => patch({ audienceObjections: v })} />
            <div className="space-y-1.5">
              <Label htmlFor="w-awareness">Nivel de conocimiento del producto</Label>
              <Input id="w-awareness" value={briefing.audienceAwareness ?? ""} onChange={(e) => patch({ audienceAwareness: e.target.value })} placeholder="Bajo, medio, alto..." />
            </div>
          </div>
        ) : null}

        {step.id === "strategy" ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="w-vp">Propuesta de valor</Label>
              <Textarea id="w-vp" value={briefing.valueProposition ?? ""} onChange={(e) => patch({ valueProposition: e.target.value })} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="w-message">Mensaje principal</Label>
              <Textarea id="w-message" value={briefing.mainMessage ?? ""} onChange={(e) => patch({ mainMessage: e.target.value })} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="w-offer">Oferta</Label>
              <Input id="w-offer" value={briefing.offer ?? ""} onChange={(e) => patch({ offer: e.target.value })} maxLength={500} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="w-cta">CTA principal</Label>
              <Input id="w-cta" value={briefing.primaryCTA ?? ""} onChange={(e) => patch({ primaryCTA: e.target.value })} maxLength={300} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="w-tone">Tono</Label>
              <Input id="w-tone" value={briefing.tone ?? ""} onChange={(e) => patch({ tone: e.target.value })} maxLength={200} />
            </div>
            <TagListEditor label="Palabras prohibidas" values={briefing.forbiddenWords ?? []} onChange={(v) => patch({ forbiddenWords: v })} />
            <TagListEditor label="Diferenciadores" values={briefing.differentiators ?? []} onChange={(v) => patch({ differentiators: v })} />
            <p className="text-xs text-muted-foreground">
              Las métricas objetivo se configuran desde la pestaña &quot;Rendimiento&quot; una vez creada la campaña.
            </p>
          </div>
        ) : null}

        {step.id === "channels" ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Selecciona uno o varios canales para esta campaña.</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {CAMPAIGN_CHANNELS.map((channel) => {
                const active = (briefing.channels ?? []).includes(channel.id);
                return (
                  <button
                    key={channel.id}
                    type="button"
                    onClick={() => toggleChannel(channel.id)}
                    className={cn(
                      "rounded-lg border p-3 text-sm font-medium transition-colors",
                      active ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"
                    )}
                  >
                    {active ? <Check className="mb-1 size-4" /> : null}
                    {channel.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {step.id === "frequency" ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="w-count">Cantidad de contenidos</Label>
                <Input
                  id="w-count"
                  type="number"
                  min={0}
                  value={briefing.contentCount ?? ""}
                  onChange={(e) => patch({ contentCount: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="w-freq">Frecuencia semanal</Label>
                <Input
                  id="w-freq"
                  type="number"
                  min={0}
                  value={briefing.frequencyPerWeek ?? ""}
                  onChange={(e) => patch({ frequencyPerWeek: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Días preferidos</Label>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((day) => {
                  const active = (briefing.preferredDays ?? []).includes(day.id);
                  return (
                    <button
                      key={day.id}
                      type="button"
                      onClick={() => toggleListValue("preferredDays", day.id)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium",
                        active ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"
                      )}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <TagListEditor label="Horas preferidas" values={briefing.preferredHours ?? []} onChange={(v) => patch({ preferredHours: v })} placeholder="09:00" />
            <TagListEditor label="Formatos deseados" values={briefing.desiredFormats ?? []} onChange={(v) => patch({ desiredFormats: v })} placeholder="reel, artículo..." />
          </div>
        ) : null}

        {step.id === "confirm" ? (
          <div className="space-y-4">
            <h3 className="font-medium">Resumen</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Nombre</dt>
              <dd>{briefing.name || "—"}</dd>
              <dt className="text-muted-foreground">Objetivo</dt>
              <dd>{briefing.objective || "—"}</dd>
              <dt className="text-muted-foreground">Fechas</dt>
              <dd>
                {briefing.startDate || "—"} → {briefing.endDate || "—"}
              </dd>
              <dt className="text-muted-foreground">Canales</dt>
              <dd>{(briefing.channels ?? []).join(", ") || "—"}</dd>
              <dt className="text-muted-foreground">Audiencia</dt>
              <dd className="line-clamp-2">{briefing.audience || "—"}</dd>
              <dt className="text-muted-foreground">Propuesta de valor</dt>
              <dd className="line-clamp-2">{briefing.valueProposition || "—"}</dd>
              <dt className="text-muted-foreground">Contenidos / frecuencia</dt>
              <dd>
                {briefing.contentCount ?? "—"} piezas, {briefing.frequencyPerWeek ?? "—"}/semana
              </dd>
            </dl>
            <Button type="button" className="w-full" disabled={finalizing || !briefing.name} onClick={handleFinish}>
              {finalizing ? "Creando..." : "Crear campaña"}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="flex justify-between">
        <Button type="button" variant="outline" disabled={stepIndex === 0} onClick={() => setStepIndex((i) => Math.max(0, i - 1))}>
          <ChevronLeft className="size-4" /> Atrás
        </Button>
        {step.id !== "confirm" ? (
          <Button type="button" onClick={() => setStepIndex((i) => Math.min(STEPS.length - 1, i + 1))}>
            Siguiente <ChevronRight className="size-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
