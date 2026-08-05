"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResetButton } from "@/components/public-tools/copy-download-actions";
import { todayAsCalendarDate, calendarDateToIso, parseIsoDateInput } from "@/lib/public-tools/utilities/dates";
import {
  createDefaultPlannerOptions,
  createCustomTimeBlock,
  createPlannerGoal,
  createGoalStep,
  validatePlannerOptions,
  plannerTitle,
  PLANNER_SECTION_LABELS,
  PLANNER_MODE_LABELS,
  type PlannerOptions,
  type PlannerMode,
  type PlannerSectionKind,
  type PlannerGoal,
} from "@/lib/public-tools/organization/planner";
import { buildPlannerPdf } from "@/lib/public-tools/organization/planner-pdf";
import { renderPdfPageToPngBlob } from "@/lib/public-tools/documents/png-export";
import { buildDocumentEnvelope, parseDocumentEnvelope } from "@/lib/public-tools/documents/json-schema";
import { downloadBlob } from "@/lib/public-tools/files/download";
import { downloadTextFile } from "@/lib/public-tools/csv-export";
import { sanitizeFilename } from "@/lib/public-tools/files/filenames";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { DOCUMENT_LIMITS } from "@/lib/public-tools/documents/limits";

const TOOL_ID = "generador-planificador-semanal-mensual";
const ALL_SECTION_KINDS: PlannerSectionKind[] = ["priorities", "tasks", "appointments", "notes", "habits", "meals", "water", "expenses", "goals", "reflection"];

export function PlannerTool() {
  const today = todayAsCalendarDate();
  const [options, setOptions] = useState<PlannerOptions>(createDefaultPlannerOptions(today));
  const [error, setError] = useState<string | null>(null);

  const validation = validatePlannerOptions(options);

  function patch(p: Partial<PlannerOptions>) {
    setOptions((prev) => ({ ...prev, ...p }));
  }
  function toggleSection(kind: PlannerSectionKind) {
    setOptions((prev) => {
      const exists = prev.sections.find((s) => s.kind === kind);
      if (exists) return { ...prev, sections: prev.sections.map((s) => (s.kind === kind ? { ...s, enabled: !s.enabled } : s)) };
      if (prev.sections.length >= DOCUMENT_LIMITS.planner.maxSections) return prev;
      return { ...prev, sections: [...prev.sections, { kind, enabled: true }] };
    });
  }
  function updateBlock(id: string, patch2: Partial<PlannerOptions["customBlocks"][number]>) {
    setOptions((prev) => ({ ...prev, customBlocks: prev.customBlocks.map((b) => (b.id === id ? { ...b, ...patch2 } : b)) }));
  }
  function removeBlock(id: string) {
    setOptions((prev) => ({ ...prev, customBlocks: prev.customBlocks.filter((b) => b.id !== id) }));
  }
  function updateGoal(id: string, patch2: Partial<PlannerGoal>) {
    setOptions((prev) => ({ ...prev, goals: prev.goals.map((g) => (g.id === id ? { ...g, ...patch2 } : g)) }));
  }
  function removeGoal(id: string) {
    setOptions((prev) => ({ ...prev, goals: prev.goals.filter((g) => g.id !== id) }));
  }
  function addGoalStep(goalId: string) {
    setOptions((prev) => ({ ...prev, goals: prev.goals.map((g) => (g.id === goalId ? { ...g, steps: [...g.steps, createGoalStep()] } : g)) }));
  }
  function updateGoalStep(goalId: string, stepId: string, patch2: Partial<{ text: string; done: boolean }>) {
    setOptions((prev) => ({ ...prev, goals: prev.goals.map((g) => (g.id !== goalId ? g : { ...g, steps: g.steps.map((s) => (s.id === stepId ? { ...s, ...patch2 } : s)) })) }));
  }

  async function handleDownloadPdf() {
    setError(null);
    try {
      const bytes = await buildPlannerPdf(options);
      downloadBlob(sanitizeFilename(`planificador-${plannerTitle(options)}.pdf`), bytes, "application/pdf");
    } catch {
      setError("No se pudo generar el PDF del planificador.");
    }
  }

  async function handleDownloadPng() {
    setError(null);
    try {
      const bytes = await buildPlannerPdf(options);
      const blob = await renderPdfPageToPngBlob(bytes, 1, DOCUMENT_LIMITS.pngRenderScale);
      downloadBlob(sanitizeFilename(`planificador-${plannerTitle(options)}.png`), blob);
    } catch {
      setError("No se pudo generar el PNG del planificador.");
    }
  }

  function handleExportJson() {
    downloadTextFile("planificador.json", JSON.stringify(buildDocumentEnvelope(TOOL_ID, options), null, 2), "application/json;charset=utf-8");
  }
  function handleImportJson(files: File[]) {
    const file = files[0];
    if (!file) return;
    file.text().then((text) => {
      const result = parseDocumentEnvelope<PlannerOptions>(text, TOOL_ID);
      if (!result.ok || !result.data) {
        setError(result.error ?? "No se pudo importar el archivo.");
        return;
      }
      setError(null);
      setOptions(result.data);
    });
  }

  function handleReset() {
    setOptions(createDefaultPlannerOptions(today));
    setError(null);
  }

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">Los datos se procesan en tu dispositivo y no se envían al servidor.</p>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="planner-mode" className="mb-1">
            Modo
          </Label>
          <Select value={options.mode} onValueChange={(v) => patch({ mode: v as PlannerMode })}>
            <SelectTrigger id="planner-mode" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PLANNER_MODE_LABELS) as PlannerMode[]).map((m) => (
                <SelectItem key={m} value={m}>
                  {PLANNER_MODE_LABELS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {options.mode !== "goals" ? (
          <div>
            <Label htmlFor="planner-date" className="mb-1">
              Fecha de referencia
            </Label>
            <Input id="planner-date" type="date" value={calendarDateToIso(options.anchorDate)} onChange={(e) => { const d = parseIsoDateInput(e.target.value); if (d) patch({ anchorDate: d }); }} />
          </div>
        ) : null}
        {options.mode !== "block-schedule" && options.mode !== "goals" ? (
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={options.useTimeBlocks} onCheckedChange={(c) => patch({ useTimeBlocks: Boolean(c) })} />
              Usar bloques horarios
            </label>
          </div>
        ) : null}
      </div>

      {options.mode !== "block-schedule" && options.mode !== "goals" && options.useTimeBlocks ? (
        <div className="flex gap-3">
          <div>
            <Label htmlFor="planner-start" className="mb-1">
              Hora inicial
            </Label>
            <Input id="planner-start" type="number" min={0} max={23} value={options.timeBlockStartHour} onChange={(e) => patch({ timeBlockStartHour: Number(e.target.value) })} />
          </div>
          <div>
            <Label htmlFor="planner-end" className="mb-1">
              Hora final
            </Label>
            <Input id="planner-end" type="number" min={1} max={24} value={options.timeBlockEndHour} onChange={(e) => patch({ timeBlockEndHour: Number(e.target.value) })} />
          </div>
        </div>
      ) : null}

      {options.mode === "block-schedule" ? (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Bloques horarios</h2>
          {options.customBlocks.map((block) => (
            <div key={block.id} className="grid gap-2 rounded-md border p-2 sm:grid-cols-4">
              <Input placeholder="Nombre del bloque" value={block.label} onChange={(e) => updateBlock(block.id, { label: e.target.value })} className="sm:col-span-2" />
              <Input type="number" step="0.5" min={0} max={24} placeholder="Inicio" value={block.startHour} onChange={(e) => updateBlock(block.id, { startHour: Number(e.target.value) })} />
              <div className="flex gap-2">
                <Input type="number" step="0.5" min={0} max={24} placeholder="Fin" value={block.endHour} onChange={(e) => updateBlock(block.id, { endHour: Number(e.target.value) })} />
                <Button type="button" variant="ghost" size="sm" onClick={() => removeBlock(block.id)}>
                  Eliminar
                </Button>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setOptions((prev) => ({ ...prev, customBlocks: [...prev.customBlocks, createCustomTimeBlock()] }))}>
            Añadir bloque
          </Button>
        </div>
      ) : null}

      {options.mode === "goals" ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Objetivos</h2>
          {options.goals.map((goal) => (
            <div key={goal.id} className="space-y-2 rounded-lg border p-3">
              <div className="grid gap-2 sm:grid-cols-4">
                <Input placeholder="Objetivo" value={goal.title} onChange={(e) => updateGoal(goal.id, { title: e.target.value })} className="sm:col-span-2" />
                <Input type="date" value={goal.targetDate} onChange={(e) => updateGoal(goal.id, { targetDate: e.target.value })} />
                <Select value={goal.priority || "none"} onValueChange={(v) => updateGoal(goal.id, { priority: v === "none" ? "" : (v as PlannerGoal["priority"]) })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Prioridad" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin prioridad</SelectItem>
                    <SelectItem value="low">Baja</SelectItem>
                    <SelectItem value="medium">Media</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor={`goal-progress-${goal.id}`} className="text-xs">
                  Progreso manual
                </Label>
                <Input
                  id={`goal-progress-${goal.id}`}
                  type="number"
                  min={0}
                  max={100}
                  value={goal.progressPercent}
                  onChange={(e) => updateGoal(goal.id, { progressPercent: Number(e.target.value) })}
                  className="w-24"
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
              <div className="space-y-1">
                {goal.steps.map((step) => (
                  <div key={step.id} className="flex items-center gap-2">
                    <Checkbox checked={step.done} onCheckedChange={(c) => updateGoalStep(goal.id, step.id, { done: Boolean(c) })} />
                    <Input value={step.text} onChange={(e) => updateGoalStep(goal.id, step.id, { text: e.target.value })} placeholder="Paso" className="flex-1" />
                  </div>
                ))}
                <Button type="button" variant="ghost" size="sm" onClick={() => addGoalStep(goal.id)}>
                  Añadir paso
                </Button>
              </div>
              <textarea value={goal.notes} onChange={(e) => updateGoal(goal.id, { notes: e.target.value })} rows={2} className="w-full rounded-md border p-2 text-sm" placeholder="Notas" />
              <Button type="button" variant="ghost" size="sm" onClick={() => removeGoal(goal.id)}>
                Eliminar objetivo
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setOptions((prev) => ({ ...prev, goals: [...prev.goals, createPlannerGoal()] }))}>
            Añadir objetivo
          </Button>
        </div>
      ) : null}

      {options.mode !== "block-schedule" && options.mode !== "goals" ? (
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Secciones (bloques genéricos de seguimiento, sin recomendaciones médicas)</legend>
          <div className="flex flex-wrap gap-3">
            {ALL_SECTION_KINDS.map((kind) => (
              <label key={kind} className="flex items-center gap-1.5 text-sm">
                <Checkbox checked={options.sections.some((s) => s.kind === kind && s.enabled)} onCheckedChange={() => toggleSection(kind)} />
                {PLANNER_SECTION_LABELS[kind]}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {validation.errors.length > 0 ? (
        <ul className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {validation.errors.map((e, i) => (
            <li key={i} role="alert">
              {e}
            </li>
          ))}
        </ul>
      ) : null}
      {validation.warnings.length > 0 ? (
        <ul className="space-y-1 rounded-lg border border-amber-400/40 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
          {validation.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={handleDownloadPdf} disabled={validation.errors.length > 0}>
          Descargar PDF
        </Button>
        <Button type="button" variant="outline" onClick={handleDownloadPng} disabled={validation.errors.length > 0}>
          Descargar PNG
        </Button>
        <Button type="button" variant="outline" onClick={handleExportJson}>
          Exportar JSON
        </Button>
        <Button type="button" variant="outline" onClick={() => window.print()}>
          Imprimir
        </Button>
        <ResetButton onReset={handleReset} />
      </div>

      <FileUploadZone accept="application/json" onFilesSelected={handleImportJson} label="Importar un planificador guardado previamente" hint="" />
    </div>
  );
}
