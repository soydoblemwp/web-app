"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createManualMetricEntryAction } from "@/server/actions/performance-metrics";
import { PERFORMANCE_METRIC_DEFINITIONS } from "@/lib/performance/metrics-catalog";
import { PERFORMANCE_DUPLICATE_POLICIES } from "@/lib/performance/types";

export interface ResourceOption {
  id: string;
  label: string;
}

interface ManualMetricFormProps {
  projectId: string;
  resourceType: "CONTENT_ITEM" | "CAMPAIGN" | "CAMPAIGN_CONTENT_PIECE" | "SOCIAL_POST";
  resourceOptions: ResourceOption[];
  onSaved?: () => void;
}

const DUPLICATE_POLICY_LABELS: Record<string, string> = { SKIP: "Omitir si ya existe", REPLACE: "Reemplazar", MERGE_SUM: "Sumar (solo acumulables)", KEEP_BOTH: "Conservar ambas" };

/** Manual metric registration (spec section 11) — every field the spec requires, real validation server-side. */
export function ManualMetricForm({ projectId, resourceType, resourceOptions, onSaved }: ManualMetricFormProps) {
  const router = useRouter();
  const [resourceId, setResourceId] = useState(resourceOptions[0]?.id ?? "");
  const [metricKey, setMetricKey] = useState(PERFORMANCE_METRIC_DEFINITIONS[0]?.key ?? "");
  const [platform, setPlatform] = useState("");
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState("");
  const [measuredAt, setMeasuredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [duplicatePolicy, setDuplicatePolicy] = useState<(typeof PERFORMANCE_DUPLICATE_POLICIES)[number]>("SKIP");
  const [pending, setPending] = useState(false);

  const fkField = resourceType === "CONTENT_ITEM" ? "contentItemId" : resourceType === "CAMPAIGN" ? "campaignId" : resourceType === "CAMPAIGN_CONTENT_PIECE" ? "campaignContentPieceId" : "socialPostId";

  async function handleSubmit() {
    if (!resourceId || !metricKey || value.trim() === "") {
      toast.error("Completa recurso, métrica y valor.");
      return;
    }
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      toast.error("El valor debe ser numérico.");
      return;
    }
    setPending(true);
    const dayStart = new Date(`${measuredAt}T00:00:00.000Z`);
    const dayEnd = new Date(`${measuredAt}T23:59:59.999Z`);
    const result = await createManualMetricEntryAction(projectId, {
      resourceType,
      [fkField]: resourceId,
      metricKey,
      value: numericValue,
      platform: platform || undefined,
      currency: currency || undefined,
      measuredAt: dayStart.toISOString(),
      periodStart: dayStart.toISOString(),
      periodEnd: dayEnd.toISOString(),
      granularity: "DAY",
      notes: notes || undefined,
      duplicatePolicy,
    });
    setPending(false);
    if (result.errorMessage) {
      toast.error(result.errorMessage);
      return;
    }
    toast.success("Métrica registrada.");
    setValue("");
    setNotes("");
    onSaved?.();
    router.refresh();
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label className="text-xs">Recurso</Label>
        <Select value={resourceId} onValueChange={(v) => v && setResourceId(v)}>
          <SelectTrigger>
            <SelectValue placeholder="Selecciona un recurso" />
          </SelectTrigger>
          <SelectContent>
            {resourceOptions.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Métrica</Label>
        <Select value={metricKey} onValueChange={(v) => v && setMetricKey(v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERFORMANCE_METRIC_DEFINITIONS.filter((d) => d.compatibleResourceTypes.includes(resourceType)).map((d) => (
              <SelectItem key={d.key} value={d.key}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Plataforma (opcional)</Label>
        <Input value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="instagram, tiktok…" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Fecha de medición</Label>
        <Input type="date" value={measuredAt} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setMeasuredAt(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Valor</Label>
        <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Moneda (solo métricas monetarias)</Label>
        <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))} placeholder="USD" maxLength={3} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label className="text-xs">Notas (opcional)</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Si ya existe una medición equivalente</Label>
        <Select value={duplicatePolicy} onValueChange={(v) => v && setDuplicatePolicy(v as typeof duplicatePolicy)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERFORMANCE_DUPLICATE_POLICIES.map((p) => (
              <SelectItem key={p} value={p}>
                {DUPLICATE_POLICY_LABELS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-end sm:col-span-2">
        <Button type="button" disabled={pending} onClick={handleSubmit}>
          {pending ? "Guardando…" : "Registrar métrica"}
        </Button>
      </div>
    </div>
  );
}
