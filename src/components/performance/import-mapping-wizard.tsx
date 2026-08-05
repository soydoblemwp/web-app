"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { configureImportMappingAction } from "@/server/actions/performance-imports";
import { PERFORMANCE_METRIC_DEFINITIONS } from "@/lib/performance/metrics-catalog";
import { PERFORMANCE_RESOURCE_TYPES, PERFORMANCE_DUPLICATE_POLICIES, PERFORMANCE_PERIOD_GRANULARITIES } from "@/lib/performance/types";

type TargetField = "measuredAt" | "periodStart" | "periodEnd" | "resourceId" | "platform" | "externalReference" | "metricKey" | "value" | "currency" | "ignore";

const TARGET_FIELD_LABELS: Record<TargetField, string> = {
  measuredAt: "Fecha de medición",
  periodStart: "Inicio de periodo",
  periodEnd: "Fin de periodo",
  resourceId: "ID del recurso",
  platform: "Plataforma",
  externalReference: "Referencia externa",
  metricKey: "(no usado directamente)",
  value: "Valor de una métrica",
  currency: "Moneda",
  ignore: "Ignorar columna",
};

const DUPLICATE_POLICY_LABELS: Record<string, string> = { SKIP: "Omitir si ya existe", REPLACE: "Reemplazar", MERGE_SUM: "Sumar (solo acumulables)", KEEP_BOTH: "Conservar ambas" };

interface ImportMappingWizardProps {
  projectId: string;
  importId: string;
  kind: "CSV" | "JSON";
  headers: string[];
  sampleRows: Record<string, unknown>[];
}

interface ColumnMapping {
  targetField: TargetField;
  metricKey: string;
}

export function ImportMappingWizard({ projectId, importId, kind, headers, sampleRows }: ImportMappingWizardProps) {
  const router = useRouter();
  const [mapping, setMapping] = useState<Record<string, ColumnMapping>>(() => Object.fromEntries(headers.map((h) => [h, { targetField: "ignore" as TargetField, metricKey: "" }])));
  const [platform, setPlatform] = useState("");
  const [resourceType, setResourceType] = useState<string>("PROJECT");
  const [delimiter, setDelimiter] = useState("");
  const [dateFormat, setDateFormat] = useState("");
  const [containerPath, setContainerPath] = useState("");
  const [duplicatePolicy, setDuplicatePolicy] = useState<(typeof PERFORMANCE_DUPLICATE_POLICIES)[number]>("SKIP");
  const [defaultGranularity, setDefaultGranularity] = useState<(typeof PERFORMANCE_PERIOD_GRANULARITIES)[number]>("DAY");
  const [pending, setPending] = useState(false);

  function updateColumn(header: string, patch: Partial<ColumnMapping>) {
    setMapping((prev) => ({ ...prev, [header]: { ...prev[header], ...patch } }));
  }

  async function handleSubmit() {
    const mappingArray = Object.entries(mapping)
      .filter(([, m]) => m.targetField !== "ignore")
      .map(([sourceColumn, m]) => ({ sourceColumn, targetField: m.targetField, metricKey: m.targetField === "value" ? m.metricKey : undefined }));

    if (mappingArray.length === 0) {
      toast.error("Mapea al menos una columna.");
      return;
    }
    if (!mappingArray.some((m) => m.targetField === "value" && m.metricKey)) {
      toast.error("Mapea al menos una columna a un valor de métrica y elige qué métrica es.");
      return;
    }

    setPending(true);
    const result = await configureImportMappingAction(projectId, {
      importId,
      platform: platform || undefined,
      resourceType,
      mapping: mappingArray,
      delimiter: delimiter || undefined,
      dateFormat: dateFormat || undefined,
      containerPath: containerPath || undefined,
      duplicatePolicy,
      defaultGranularity,
    });
    setPending(false);
    if (result.errorMessage) {
      toast.error(result.errorMessage);
      return;
    }
    toast.success(`Importación procesada — estado: ${result.status}.`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {headers.map((h) => (
                <TableHead key={h}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sampleRows.slice(0, 5).map((row, i) => (
              <TableRow key={i}>
                {headers.map((h) => (
                  <TableCell key={h} className="max-w-32 truncate text-xs">
                    {String(row[h] ?? "")}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium">Mapeo de columnas</p>
        <div className="grid gap-2">
          {headers.map((h) => (
            <div key={h} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
              <span className="w-40 truncate text-xs font-medium">{h}</span>
              <Select value={mapping[h]?.targetField ?? "ignore"} onValueChange={(v) => v && updateColumn(h, { targetField: v as TargetField })}>
                <SelectTrigger className="w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["measuredAt", "periodStart", "periodEnd", "resourceId", "platform", "externalReference", "value", "currency", "ignore"] as TargetField[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {TARGET_FIELD_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {mapping[h]?.targetField === "value" ? (
                <Select value={mapping[h]?.metricKey ?? ""} onValueChange={(v) => v && updateColumn(h, { metricKey: v })}>
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="¿Qué métrica es?" />
                  </SelectTrigger>
                  <SelectContent>
                    {PERFORMANCE_METRIC_DEFINITIONS.filter((d) => d.isExternal || d.category !== "CUSTOM").map((d) => (
                      <SelectItem key={d.key} value={d.key}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Recurso vinculado</Label>
          <Select value={resourceType} onValueChange={(v) => v && setResourceType(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERFORMANCE_RESOURCE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Plataforma por defecto (opcional)</Label>
          <Input value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="instagram, tiktok…" />
        </div>
        {kind === "CSV" ? (
          <div className="space-y-1.5">
            <Label className="text-xs">Delimitador (opcional, se detecta automáticamente)</Label>
            <Input value={delimiter} onChange={(e) => setDelimiter(e.target.value)} maxLength={1} placeholder="," />
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label className="text-xs">Ruta contenedora (opcional, ej. data.rows)</Label>
            <Input value={containerPath} onChange={(e) => setContainerPath(e.target.value)} />
          </div>
        )}
        <div className="space-y-1.5">
          <Label className="text-xs">Formato de fecha (opcional)</Label>
          <Select value={dateFormat || "__auto"} onValueChange={(v) => v && setDateFormat(v === "__auto" ? "" : v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__auto">Automático (ISO)</SelectItem>
              <SelectItem value="DD/MM/YYYY">DD/MM/AAAA</SelectItem>
              <SelectItem value="MM/DD/YYYY">MM/DD/AAAA</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Granularidad por defecto</Label>
          <Select value={defaultGranularity} onValueChange={(v) => v && setDefaultGranularity(v as typeof defaultGranularity)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERFORMANCE_PERIOD_GRANULARITIES.map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
      </div>

      <Button type="button" disabled={pending} onClick={handleSubmit}>
        {pending ? "Procesando…" : "Confirmar mapeo e importar"}
      </Button>
    </div>
  );
}
