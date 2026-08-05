"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Search, BrainCircuit } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DataQualityPanel } from "@/components/performance/data-quality-panel";
import { formatMetricValue } from "@/components/performance/labels";
import { PERFORMANCE_METRIC_DEFINITIONS } from "@/lib/performance/metrics-catalog";
import { compareContentItemsAction, compareCampaignsAction, compareSocialPostsAction } from "@/server/actions/performance-comparisons";
import type { ComparisonResult } from "@/server/services/performance-comparisons";
import type { ResourceOption } from "@/components/performance/manual-metric-form";

type ResourceKind = "CONTENT_ITEM" | "CAMPAIGN" | "SOCIAL_POST";

interface ResourceComparisonViewProps {
  projectId: string;
  resourceKind: ResourceKind;
  resourceOptions: ResourceOption[];
}

const PERIOD_OPTIONS = [
  { label: "Últimos 7 días", days: 7 },
  { label: "Últimos 30 días", days: 30 },
  { label: "Últimos 90 días", days: 90 },
];

export function ResourceComparisonView({ projectId, resourceKind, resourceOptions }: ResourceComparisonViewProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const [periodDays, setPeriodDays] = useState(30);
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [pending, setPending] = useState(false);

  const compatibleMetrics = PERFORMANCE_METRIC_DEFINITIONS.filter((d) => d.compatibleResourceTypes.includes(resourceKind) && d.supportsComparison);

  async function runComparison() {
    if (selectedIds.length < 2) {
      toast.error("Selecciona al menos dos elementos para comparar.");
      return;
    }
    if (selectedMetrics.length === 0) {
      toast.error("Selecciona al menos una métrica.");
      return;
    }
    setPending(true);
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - periodDays * 86_400_000);
    const action = resourceKind === "CAMPAIGN" ? compareCampaignsAction : resourceKind === "SOCIAL_POST" ? compareSocialPostsAction : compareContentItemsAction;
    const comparison = await action(projectId, selectedIds, selectedMetrics, periodStart.toISOString(), periodEnd.toISOString());
    setPending(false);
    if ("error" in comparison) {
      toast.error(comparison.error);
      return;
    }
    setResult(comparison);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Selecciona qué comparar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <p className="text-xs font-medium">Elementos (mínimo 2)</p>
              <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border p-2">
                {resourceOptions.length === 0 ? <p className="text-xs text-muted-foreground">Sin elementos disponibles.</p> : null}
                {resourceOptions.map((r) => {
                  const checked = selectedIds.includes(r.id);
                  return (
                    <label key={r.id} className="flex items-center gap-2 text-xs">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => setSelectedIds((prev) => (checked ? prev.filter((id) => id !== r.id) : [...prev, r.id]))}
                      />
                      <span className="truncate">{r.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium">Métricas</p>
              <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border p-2">
                {compatibleMetrics.map((m) => {
                  const checked = selectedMetrics.includes(m.key);
                  return (
                    <label key={m.key} className="flex items-center gap-2 text-xs">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => setSelectedMetrics((prev) => (checked ? prev.filter((k) => k !== m.key) : [...prev, m.key]))}
                      />
                      {m.name}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <p className="text-xs font-medium">Periodo</p>
              <Select value={String(periodDays)} onValueChange={(v) => v && setPeriodDays(Number(v))}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_OPTIONS.map((p) => (
                    <SelectItem key={p.days} value={String(p.days)}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="button" disabled={pending} onClick={runComparison}>
              <Search className="size-4" /> {pending ? "Comparando…" : "Comparar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {result ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Resultado de la comparación</CardTitle>
              <Link
                href={`/dashboard/${projectId}/marketing-brain/optimization/new?resourceType=${resourceKind}&resourceIds=${selectedIds.join(",")}&metricKeys=${selectedMetrics.join(",")}`}
                className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
              >
                <BrainCircuit className="size-3.5" /> Optimizar con estos datos
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {result.warnings.length > 0 ? (
              <div className="space-y-1 rounded-md border border-amber-500/50 bg-amber-500/5 p-2 text-xs text-amber-700 dark:text-amber-400">
                {result.warnings.map((w, i) => (
                  <p key={i}>{w}</p>
                ))}
              </div>
            ) : null}

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Elemento</TableHead>
                    {result.metricKeys.map((key) => (
                      <TableHead key={key} className="text-right">
                        {PERFORMANCE_METRIC_DEFINITIONS.find((d) => d.key === key)?.name ?? key}
                      </TableHead>
                    ))}
                    <TableHead>Calidad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.rows.map((row) => (
                    <TableRow key={row.resourceId}>
                      <TableCell className="max-w-48 truncate">
                        {row.label}
                        {row.incompatibilities.length > 0 ? (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {row.incompatibilities.map((inc, i) => (
                              <Badge key={i} variant="outline" className="text-[10px]">
                                {inc}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </TableCell>
                      {row.cells.map((cell) => (
                        <TableCell key={cell.metricKey} className="text-right">
                          <div>{formatMetricValue(cell.value)}</div>
                          <div className="text-[10px] text-muted-foreground">n={cell.sampleSize}</div>
                        </TableCell>
                      ))}
                      <TableCell>
                        <DataQualityPanel score={row.dataQualityScore} level={row.dataQualityLevel} compact />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
