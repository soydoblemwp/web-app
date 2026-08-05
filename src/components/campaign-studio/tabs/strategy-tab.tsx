"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Sparkles, Loader2, RotateCcw, Save } from "lucide-react";
import { useLocalAI } from "@/hooks/use-local-ai";
import { LocalAIStatusPanel } from "@/components/ai/local-ai-status";
import {
  buildCampaignStrategySystemPrompt,
  buildCampaignStrategyUserPrompt,
  parseCampaignStrategyText,
  type ParsedCampaignStrategy,
} from "@/lib/campaign-studio/strategy-ai";
import { buildBrandProfileContext } from "@/lib/brand-profiles/context";
import { listBrandProfilesForSelectAction } from "@/server/actions/brand-profiles";
import { saveCampaignStrategyAction } from "@/server/actions/campaign-studio";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CampaignDetailData, CampaignStrategyData } from "@/components/campaign-studio/types";

const SECTIONS: { field: keyof ParsedCampaignStrategy; label: string; list: boolean }[] = [
  { field: "summary", label: "Resumen estratégico", list: false },
  { field: "audienceProfile", label: "Perfil de audiencia", list: false },
  { field: "valueProposition", label: "Propuesta de valor", list: false },
  { field: "mainMessage", label: "Mensaje principal", list: false },
  { field: "objectives", label: "Objetivos", list: true },
  { field: "themes", label: "Temas", list: true },
  { field: "creativeAngles", label: "Ángulos creativos", list: true },
  { field: "cta", label: "CTA", list: false },
  { field: "risks", label: "Riesgos", list: true },
  { field: "recommendations", label: "Recomendaciones", list: true },
  { field: "suggestedMetrics", label: "Métricas sugeridas", list: true },
];

function toEmptyStrategy(existing: CampaignStrategyData | null): ParsedCampaignStrategy {
  return {
    summary: existing?.summary ?? "",
    audienceProfile: existing?.audienceProfile ?? "",
    valueProposition: existing?.valueProposition ?? "",
    mainMessage: existing?.mainMessage ?? "",
    objectives: existing?.objectives ?? [],
    themes: existing?.themes ?? [],
    creativeAngles: existing?.creativeAngles ?? [],
    cta: existing?.cta ?? "",
    risks: existing?.risks ?? [],
    recommendations: existing?.recommendations ?? [],
    suggestedMetrics: existing?.suggestedMetrics ?? [],
  };
}

export function StrategyTab({
  projectId,
  campaign,
  strategy: initialStrategy,
}: {
  projectId: string;
  campaign: CampaignDetailData;
  strategy: CampaignStrategyData | null;
}) {
  const ai = useLocalAI();
  const [strategy, setStrategy] = useState<ParsedCampaignStrategy>(toEmptyStrategy(initialStrategy));
  const [regeneratingField, setRegeneratingField] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [versionDialogOpen, setVersionDialogOpen] = useState(false);
  const [versionNote, setVersionNote] = useState("");
  const busy = ai.status === "loading" || ai.status === "generating";

  async function resolveBrandContext(): Promise<string> {
    if (!campaign.brandProfileId) return "";
    const profiles = await listBrandProfilesForSelectAction(projectId);
    const profile = profiles.find((p) => p.id === campaign.brandProfileId);
    return profile ? buildBrandProfileContext(profile) : "";
  }

  async function generateAll() {
    const brandContext = await resolveBrandContext();
    const system = buildCampaignStrategySystemPrompt(brandContext);
    const prompt = buildCampaignStrategyUserPrompt({
      name: campaign.name,
      description: campaign.description ?? "",
      productOrService: "",
      objective: campaign.objective ?? "",
      audience: campaign.audience ?? "",
      valueProposition: campaign.valueProposition ?? "",
      mainMessage: campaign.mainMessage ?? "",
      offer: campaign.offer ?? "",
      tone: campaign.tone ?? "",
      channels: campaign.channels,
    });
    const result = await ai.generate({ system, prompt, maxTokens: 2048 });
    if (!result) return;
    setStrategy(parseCampaignStrategyText(result));
  }

  async function regenerateSection(field: keyof ParsedCampaignStrategy) {
    setRegeneratingField(field);
    const brandContext = await resolveBrandContext();
    const system = buildCampaignStrategySystemPrompt(brandContext, [field]);
    const prompt = buildCampaignStrategyUserPrompt({
      name: campaign.name,
      description: campaign.description ?? "",
      productOrService: "",
      objective: campaign.objective ?? "",
      audience: campaign.audience ?? "",
      valueProposition: campaign.valueProposition ?? "",
      mainMessage: campaign.mainMessage ?? "",
      offer: campaign.offer ?? "",
      tone: campaign.tone ?? "",
      channels: campaign.channels,
    });
    const result = await ai.generate({ system, prompt });
    setRegeneratingField(null);
    if (!result) return;
    const parsed = parseCampaignStrategyText(result);
    setStrategy((prev) => ({ ...prev, [field]: parsed[field] }));
  }

  function updateField(field: keyof ParsedCampaignStrategy, value: string | string[]) {
    setStrategy((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave(createVersion: boolean) {
    setSaving(true);
    const result = await saveCampaignStrategyAction(projectId, campaign.id, {
      sections: strategy,
      createVersion,
      note: versionNote || undefined,
    });
    setSaving(false);
    setVersionDialogOpen(false);
    setVersionNote("");
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Estrategia guardada.");
  }

  const hasContent = Object.values(strategy).some((v) => (Array.isArray(v) ? v.length > 0 : v.trim().length > 0));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={generateAll} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {hasContent ? "Regenerar estrategia completa" : "Generar estrategia con IA"}
        </Button>
        <Button type="button" variant="outline" onClick={() => handleSave(false)} disabled={saving || !hasContent}>
          <Save className="size-4" /> Guardar
        </Button>
        <Button type="button" variant="outline" onClick={() => setVersionDialogOpen(true)} disabled={saving || !hasContent}>
          Guardar como versión
        </Button>
      </div>

      {busy ? <LocalAIStatusPanel ai={ai} /> : null}

      {!hasContent && !busy ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Todavía no hay estrategia. Genera una con IA a partir del briefing de la campaña, respetando el Brand Profile seleccionado.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {SECTIONS.map(({ field, label, list }) => (
            <Card key={field}>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm">{label}</CardTitle>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  title="Regenerar esta sección"
                  disabled={busy}
                  onClick={() => regenerateSection(field)}
                >
                  {regeneratingField === field ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
                </Button>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={list ? (strategy[field] as string[]).join("\n") : (strategy[field] as string)}
                  onChange={(e) => updateField(field, list ? e.target.value.split("\n") : e.target.value)}
                  rows={list ? 4 : 3}
                  placeholder={list ? "Un elemento por línea" : undefined}
                  className="text-sm"
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={versionDialogOpen} onOpenChange={setVersionDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Guardar versión de la estrategia</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="strategy-version-note">Nota (opcional)</Label>
            <Input id="strategy-version-note" value={versionNote} onChange={(e) => setVersionNote(e.target.value)} maxLength={300} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setVersionDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={saving} onClick={() => handleSave(true)}>
              Guardar versión
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
