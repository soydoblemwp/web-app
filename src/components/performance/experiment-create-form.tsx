"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createExperimentAction } from "@/server/actions/performance-experiments";
import { PERFORMANCE_METRIC_DEFINITIONS } from "@/lib/performance/metrics-catalog";
import { PERFORMANCE_EXPERIMENT_TYPES } from "@/lib/performance/types";
import type { ResourceOption } from "@/components/performance/manual-metric-form";

const EXPERIMENT_TYPE_LABELS: Record<string, string> = {
  TITLE: "Título",
  HOOK: "Hook",
  CTA: "Llamado a la acción",
  DESCRIPTION: "Descripción",
  FORMAT: "Formato",
  LENGTH: "Longitud",
  TONE: "Tono",
  PUBLISHING_TIME: "Horario de publicación",
  PLATFORM_ADAPTATION: "Adaptación de plataforma",
  CONTENT_VERSION: "Versión de contenido",
  CUSTOM: "Personalizado",
};

interface ExperimentCreateFormProps {
  projectId: string;
  contentItems: ResourceOption[];
  campaigns: ResourceOption[];
}

export function ExperimentCreateForm({ projectId, contentItems, campaigns }: ExperimentCreateFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [objective, setObjective] = useState("");
  const [type, setType] = useState<(typeof PERFORMANCE_EXPERIMENT_TYPES)[number]>("TITLE");
  const [primaryMetricKey, setPrimaryMetricKey] = useState(PERFORMANCE_METRIC_DEFINITIONS[0]?.key ?? "");
  const [resourceType, setResourceType] = useState<"CONTENT_ITEM" | "CAMPAIGN">("CONTENT_ITEM");
  const [contentItemId, setContentItemId] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [expectedSampleSize, setExpectedSampleSize] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit() {
    if (!name.trim() || !hypothesis.trim()) {
      toast.error("El nombre y la hipótesis son obligatorios.");
      return;
    }
    setPending(true);
    const result = await createExperimentAction(projectId, {
      name,
      hypothesis,
      objective: objective || undefined,
      type,
      primaryMetricKey,
      secondaryMetricKeys: [],
      resourceType,
      contentItemId: resourceType === "CONTENT_ITEM" && contentItemId ? contentItemId : undefined,
      campaignId: resourceType === "CAMPAIGN" && campaignId ? campaignId : undefined,
      expectedSampleSize: expectedSampleSize ? Number(expectedSampleSize) : undefined,
    });
    setPending(false);
    if (result.errorMessage) {
      toast.error(result.errorMessage);
      return;
    }
    toast.success("Experimento creado en borrador.");
    router.push(`/dashboard/${projectId}/performance/experiments/${result.id}`);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5 sm:col-span-2">
        <Label className="text-xs">Nombre</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Prueba de título para el post de lanzamiento" />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label className="text-xs">Hipótesis</Label>
        <Textarea value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} rows={2} placeholder="Un título con pregunta aumentará el engagement respecto al título actual." />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label className="text-xs">Objetivo (opcional)</Label>
        <Input value={objective} onChange={(e) => setObjective(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Tipo de experimento</Label>
        <Select value={type} onValueChange={(v) => v && setType(v as typeof type)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERFORMANCE_EXPERIMENT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {EXPERIMENT_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Métrica primaria</Label>
        <Select value={primaryMetricKey} onValueChange={(v) => v && setPrimaryMetricKey(v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERFORMANCE_METRIC_DEFINITIONS.map((d) => (
              <SelectItem key={d.key} value={d.key}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Recurso base</Label>
        <Select value={resourceType} onValueChange={(v) => v && setResourceType(v as typeof resourceType)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="CONTENT_ITEM">Contenido</SelectItem>
            <SelectItem value="CAMPAIGN">Campaña</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {resourceType === "CONTENT_ITEM" ? (
        <div className="space-y-1.5">
          <Label className="text-xs">Pieza de contenido (opcional)</Label>
          <Select value={contentItemId} onValueChange={(v) => v && setContentItemId(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Ninguna" />
            </SelectTrigger>
            <SelectContent>
              {contentItems.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label className="text-xs">Campaña (opcional)</Label>
          <Select value={campaignId} onValueChange={(v) => v && setCampaignId(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Ninguna" />
            </SelectTrigger>
            <SelectContent>
              {campaigns.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-1.5">
        <Label className="text-xs">Tamaño de muestra esperado (opcional)</Label>
        <Input type="number" min={1} value={expectedSampleSize} onChange={(e) => setExpectedSampleSize(e.target.value)} />
      </div>
      <div className="flex items-end sm:col-span-2">
        <Button type="button" disabled={pending} onClick={handleSubmit}>
          {pending ? "Creando…" : "Crear experimento (borrador)"}
        </Button>
      </div>
    </div>
  );
}
