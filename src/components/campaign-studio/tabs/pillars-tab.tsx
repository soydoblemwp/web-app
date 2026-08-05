"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Loader2, Plus, Trash2, GripVertical, AlertTriangle } from "lucide-react";
import { useLocalAI } from "@/hooks/use-local-ai";
import { computePillarPercentageTotal } from "@/lib/campaign-studio/pillars";
import { buildCampaignPillarSystemPrompt, buildCampaignPillarUserPrompt, parseCampaignPillarsText } from "@/lib/campaign-studio/pillar-ai";
import {
  createCampaignPillarAction,
  updateCampaignPillarAction,
  deleteCampaignPillarAction,
  reorderCampaignPillarsAction,
  createCampaignPillarsFromDraftsAction,
} from "@/server/actions/campaign-pillars";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import type { CampaignDetailData, CampaignPillarData } from "@/components/campaign-studio/types";

export function PillarsTab({
  projectId,
  campaign,
  pillars: initialPillars,
}: {
  projectId: string;
  campaign: CampaignDetailData;
  pillars: CampaignPillarData[];
}) {
  const router = useRouter();
  const ai = useLocalAI();
  const [pillars, setPillars] = useState(initialPillars);
  const [generating, setGenerating] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const busy = ai.status === "loading" || ai.status === "generating";

  const total = useMemo(() => computePillarPercentageTotal(pillars), [pillars]);
  const balanced = total === 100 || pillars.every((p) => p.percentage === null);

  async function handleGenerate() {
    setGenerating(true);
    const system = buildCampaignPillarSystemPrompt("");
    const prompt = buildCampaignPillarUserPrompt({
      campaignName: campaign.name,
      objective: campaign.objective ?? "",
      audience: campaign.audience ?? "",
      channels: campaign.channels,
      count: 4,
    });
    const result = await ai.generate({ system, prompt });
    setGenerating(false);
    if (!result) return;
    const drafts = parseCampaignPillarsText(result);
    if (drafts.length === 0) {
      toast.error("No se pudieron generar pilares. Inténtalo de nuevo.");
      return;
    }
    const saveResult = await createCampaignPillarsFromDraftsAction(projectId, campaign.id, drafts);
    if (saveResult.error) {
      toast.error(saveResult.error);
      return;
    }
    router.refresh();
  }

  async function handleAdd() {
    const result = await createCampaignPillarAction(projectId, campaign.id, { name: "Nuevo pilar" });
    if (result.error) {
      toast.error(result.error);
      return;
    }
    if (result.id) {
      setPillars((prev) => [...prev, { id: result.id!, campaignId: campaign.id, name: "Nuevo pilar", description: null, objective: null, color: null, percentage: null, formats: [], platforms: [], topics: [], order: prev.length }]);
    }
  }

  function patchLocal(id: string, patch: Partial<CampaignPillarData>) {
    setPillars((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  async function handleFieldSave(id: string, patch: Partial<CampaignPillarData>) {
    const result = await updateCampaignPillarAction(projectId, campaign.id, id, patch);
    if (result.error) toast.error(result.error);
  }

  async function handleDelete(id: string) {
    setPillars((prev) => prev.filter((p) => p.id !== id));
    const result = await deleteCampaignPillarAction(projectId, campaign.id, id);
    if (result.error) toast.error(result.error);
  }

  function handleDrop(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    const current = [...pillars];
    const fromIndex = current.findIndex((p) => p.id === draggedId);
    const toIndex = current.findIndex((p) => p.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    const [moved] = current.splice(fromIndex, 1);
    current.splice(toIndex, 0, moved);
    setPillars(current);
    setDraggedId(null);
    void reorderCampaignPillarsAction(projectId, campaign.id, current.map((p) => p.id));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={handleGenerate} disabled={busy || generating}>
          {generating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Generar con IA
        </Button>
        <Button type="button" variant="outline" onClick={handleAdd}>
          <Plus className="size-4" /> Añadir pilar
        </Button>
      </div>

      {!balanced ? (
        <p className="flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="size-3.5 shrink-0" /> Los porcentajes suman {total}%, no 100%. Puedes guardar igualmente.
        </p>
      ) : null}

      {pillars.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Todavía no hay pilares de contenido. Genera algunos con IA o añade uno manualmente.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {pillars.map((pillar) => (
            <Card
              key={pillar.id}
              draggable
              onDragStart={() => setDraggedId(pillar.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(pillar.id)}
              className="cursor-grab"
            >
              <CardContent className="space-y-2 py-4">
                <div className="flex items-center gap-2">
                  <GripVertical className="size-4 shrink-0 text-muted-foreground" />
                  <Input
                    value={pillar.name}
                    onChange={(e) => patchLocal(pillar.id, { name: e.target.value })}
                    onBlur={() => handleFieldSave(pillar.id, { name: pillar.name })}
                    className="font-medium"
                  />
                  <Button type="button" variant="ghost" size="icon-xs" onClick={() => handleDelete(pillar.id)}>
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                </div>
                <Input
                  value={pillar.description ?? ""}
                  onChange={(e) => patchLocal(pillar.id, { description: e.target.value })}
                  onBlur={() => handleFieldSave(pillar.id, { description: pillar.description })}
                  placeholder="Descripción"
                  className="text-sm"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={pillar.objective ?? ""}
                    onChange={(e) => patchLocal(pillar.id, { objective: e.target.value })}
                    onBlur={() => handleFieldSave(pillar.id, { objective: pillar.objective })}
                    placeholder="Objetivo"
                  />
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      value={pillar.color ?? "#6366f1"}
                      onChange={(e) => {
                        patchLocal(pillar.id, { color: e.target.value });
                        handleFieldSave(pillar.id, { color: e.target.value });
                      }}
                      className="h-9 w-12 p-1"
                    />
                    <div className="relative flex-1">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={pillar.percentage ?? ""}
                        onChange={(e) => patchLocal(pillar.id, { percentage: e.target.value ? Number(e.target.value) : null })}
                        onBlur={() => handleFieldSave(pillar.id, { percentage: pillar.percentage })}
                        placeholder="%"
                      />
                    </div>
                  </div>
                </div>
                <Label className="text-xs text-muted-foreground">
                  Formatos: {pillar.formats.join(", ") || "—"} · Plataformas: {pillar.platforms.join(", ") || "—"}
                </Label>
                {pillar.topics.length > 0 ? <p className="text-xs text-muted-foreground">Temas: {pillar.topics.join(", ")}</p> : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
