"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { BrainCircuit } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/automations/confirm-dialog";
import { EXPERIMENT_STATUS_LABELS, EXPERIMENT_STATUS_TONE } from "@/components/performance/labels";
import { createVariantAction, transitionExperimentStatusAction, analyzeExperimentAction, decideExperimentWinnerAction } from "@/server/actions/performance-experiments";
import type { ExperimentAnalysisResult } from "@/server/services/performance-experiments";
import type { PerformanceActionError } from "@/lib/performance/types";

interface VariantView {
  id: string;
  label: string;
  isControl: boolean;
  status: string;
  text: string | null;
  agentKeyUsed: string | null;
  createdByAgentRun: { id: string; officialAgentKey: string | null; customAgentId: string | null } | null;
}

interface ExperimentDetailViewProps {
  projectId: string;
  experimentId: string;
  name: string;
  hypothesis: string;
  status: string;
  primaryMetricKey: string;
  conclusion: string | null;
  winnerVariantId: string | null;
  variants: VariantView[];
}

const NEXT_STATUS_OPTIONS: Record<string, { value: string; label: string }[]> = {
  DRAFT: [{ value: "READY", label: "Marcar como listo" }],
  READY: [{ value: "RUNNING", label: "Iniciar experimento" }],
  RUNNING: [{ value: "PAUSED", label: "Pausar" }],
  PAUSED: [{ value: "RUNNING", label: "Reanudar" }],
  INCONCLUSIVE: [{ value: "RUNNING", label: "Reiniciar" }],
};

export function ExperimentDetailView({ projectId, experimentId, name, hypothesis, status, primaryMetricKey, conclusion, winnerVariantId, variants }: ExperimentDetailViewProps) {
  const router = useRouter();
  const [variantLabel, setVariantLabel] = useState("");
  const [variantIsControl, setVariantIsControl] = useState(variants.length === 0);
  const [variantText, setVariantText] = useState("");
  const [pendingVariant, setPendingVariant] = useState(false);
  const [pendingTransition, setPendingTransition] = useState(false);
  const [analysis, setAnalysis] = useState<ExperimentAnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [conclusionText, setConclusionText] = useState("");
  const [selectedWinnerId, setSelectedWinnerId] = useState<string>("");
  const [confirmWinnerOpen, setConfirmWinnerOpen] = useState(false);
  const [decidingWinner, setDecidingWinner] = useState(false);

  async function handleAddVariant() {
    if (!variantLabel.trim()) {
      toast.error("La etiqueta de la variante es obligatoria.");
      return;
    }
    setPendingVariant(true);
    const result = await createVariantAction(projectId, { experimentId, label: variantLabel, isControl: variantIsControl, text: variantText || undefined });
    setPendingVariant(false);
    if (result.errorMessage) {
      toast.error(result.errorMessage);
      return;
    }
    toast.success("Variante añadida.");
    setVariantLabel("");
    setVariantText("");
    setVariantIsControl(false);
    router.refresh();
  }

  async function handleTransition(next: string) {
    setPendingTransition(true);
    const result = await transitionExperimentStatusAction(projectId, experimentId, next);
    setPendingTransition(false);
    if (result.errorMessage) {
      toast.error(result.errorMessage);
      return;
    }
    toast.success("Estado actualizado.");
    router.refresh();
  }

  async function handleAnalyze() {
    setAnalyzing(true);
    const result = await analyzeExperimentAction(projectId, experimentId);
    setAnalyzing(false);
    if ("error" in (result as PerformanceActionError)) {
      toast.error((result as PerformanceActionError).error);
      return;
    }
    const ok = result as ExperimentAnalysisResult;
    setAnalysis(ok);
    setSelectedWinnerId(ok.recommendedWinnerVariantId ?? "");
  }

  async function handleDecideWinner() {
    if (!conclusionText.trim()) {
      toast.error("Describe la conclusión antes de cerrar el experimento.");
      return;
    }
    setDecidingWinner(true);
    const result = await decideExperimentWinnerAction(projectId, { experimentId, winnerVariantId: selectedWinnerId || undefined, conclusion: conclusionText });
    setDecidingWinner(false);
    if (result.errorMessage) {
      toast.error(result.errorMessage);
      return;
    }
    toast.success(selectedWinnerId ? "Experimento completado con ganador." : "Experimento cerrado como inconcluso.");
    router.refresh();
  }

  const nextOptions = NEXT_STATUS_OPTIONS[status] ?? [];
  const canDecideWinner = status === "RUNNING" || status === "PAUSED";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">{name}</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={EXPERIMENT_STATUS_TONE[status] ?? "outline"}>{EXPERIMENT_STATUS_LABELS[status] ?? status}</Badge>
              {nextOptions.map((opt) => (
                <Button key={opt.value} size="sm" variant="outline" disabled={pendingTransition} onClick={() => handleTransition(opt.value)}>
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="font-medium">Hipótesis:</span> {hypothesis}
          </p>
          <p className="text-xs text-muted-foreground">Métrica primaria: {primaryMetricKey}</p>
          {conclusion ? (
            <p className="rounded-md border bg-muted/30 p-2 text-xs">
              <span className="font-medium">Conclusión:</span> {conclusion}
            </p>
          ) : null}
          {status === "COMPLETED" || status === "INCONCLUSIVE" ? (
            <Link href={`/dashboard/${projectId}/marketing-brain/optimization/new?experimentId=${experimentId}`} className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>
              <BrainCircuit className="size-3.5" /> Analizar resultado en Marketing Brain
            </Link>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Variantes ({variants.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {variants.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Etiqueta</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {variants.map((v) => (
                  <TableRow key={v.id} className={v.id === winnerVariantId ? "bg-emerald-500/10" : undefined}>
                    <TableCell>
                      {v.label} {v.id === winnerVariantId ? <Badge className="ml-1">Ganadora</Badge> : null}
                    </TableCell>
                    <TableCell>{v.isControl ? "Control" : "Variante"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{v.createdByAgentRun ? `Generada por agente (${v.agentKeyUsed ?? v.createdByAgentRun.officialAgentKey ?? "custom"})` : "Manual"}</TableCell>
                    <TableCell>{v.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-xs text-muted-foreground">Añade al menos un control y una variante antes de iniciar el experimento.</p>
          )}

          {status === "DRAFT" || status === "READY" ? (
            <div className="grid gap-3 border-t pt-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Etiqueta</Label>
                <Input value={variantLabel} onChange={(e) => setVariantLabel(e.target.value)} placeholder="Control / Variante A" />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Checkbox checked={variantIsControl} onCheckedChange={(v) => setVariantIsControl(v === true)} />
                <span className="text-xs">Es el control</span>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Texto de la variante (opcional)</Label>
                <Textarea value={variantText} onChange={(e) => setVariantText(e.target.value)} rows={2} />
              </div>
              <div className="sm:col-span-2">
                <Button type="button" size="sm" disabled={pendingVariant} onClick={handleAddVariant}>
                  {pendingVariant ? "Añadiendo…" : "Añadir variante"}
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {canDecideWinner ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Análisis estadístico</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button type="button" variant="outline" size="sm" disabled={analyzing} onClick={handleAnalyze}>
              {analyzing ? "Analizando…" : "Analizar experimento"}
            </Button>

            {analysis ? (
              <div className="space-y-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Variante</TableHead>
                      <TableHead className="text-right">Muestra</TableHead>
                      <TableHead className="text-right">Media</TableHead>
                      <TableHead className="text-right">vs. control</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analysis.variants.map((v) => {
                      const cmp = analysis.comparisons.find((c) => c.variantId === v.variantId);
                      return (
                        <TableRow key={v.variantId}>
                          <TableCell>
                            {v.label} {v.isControl ? <Badge variant="outline" className="ml-1 text-[10px]">Control</Badge> : null}
                          </TableCell>
                          <TableCell className="text-right">{v.sampleSize}</TableCell>
                          <TableCell className="text-right">{v.mean !== null ? v.mean.toFixed(2) : "—"}</TableCell>
                          <TableCell className="text-right text-xs">
                            {v.isControl ? "—" : cmp?.vsControl ? (cmp.vsControl.significantAt95 ? `Significativo (p≈${cmp.vsControl.pValueApprox.toFixed(3)})` : `No significativo (p≈${cmp.vsControl.pValueApprox.toFixed(3)})`) : "Muestra insuficiente"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {analysis.inconclusiveReason ? (
                  <p className="rounded-md border border-amber-500/50 bg-amber-500/5 p-2 text-xs text-amber-700 dark:text-amber-400">{analysis.inconclusiveReason}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Variante recomendada: {analysis.variants.find((v) => v.variantId === analysis.recommendedWinnerVariantId)?.label ?? "—"} (esto es una recomendación estadística, no una decisión automática).</p>
                )}

                <div className="grid gap-3 border-t pt-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Ganadora (déjalo vacío si es inconcluso)</Label>
                    <Select value={selectedWinnerId || "__none"} onValueChange={(v) => v && setSelectedWinnerId(v === "__none" ? "" : v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Sin ganadora (inconcluso)</SelectItem>
                        {variants.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs">Conclusión (obligatoria)</Label>
                    <Textarea value={conclusionText} onChange={(e) => setConclusionText(e.target.value)} rows={2} placeholder="Explica qué se observó y sus límites — nunca declares causalidad sin evidencia." />
                  </div>
                  <div>
                    <Button type="button" size="sm" disabled={decidingWinner} onClick={() => setConfirmWinnerOpen(true)}>
                      Cerrar experimento
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <ConfirmDialog
        open={confirmWinnerOpen}
        onOpenChange={setConfirmWinnerOpen}
        title="Cerrar experimento"
        description={selectedWinnerId ? "Se marcará una variante ganadora y el experimento pasará a Completado. Esta decisión queda registrada." : "El experimento se cerrará como Inconcluso, sin ganadora."}
        confirmLabel="Confirmar cierre"
        onConfirm={handleDecideWinner}
      />
    </div>
  );
}
