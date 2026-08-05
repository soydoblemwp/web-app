"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CopyButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { calculateFinalExamNeeded, calculateCourseGrade, createGradeCategory, type CategoryMethod, type GradeCategory, type RoundingPolicy } from "@/lib/public-tools/education/final-grade";
import { downloadTextFile } from "@/lib/public-tools/csv-export";
import { buildDocumentEnvelope, parseDocumentEnvelope } from "@/lib/public-tools/documents/json-schema";
import { DOCUMENT_LIMITS } from "@/lib/public-tools/documents/limits";

const TOOL_ID = "calculadora-nota-final";
type Mode = "exam" | "categories";
const ROUNDING_LABELS: Record<RoundingPolicy, string> = { none: "Sin redondeo", "final-only": "Redondeo solo al final", "per-activity": "Redondeo por actividad" };

interface StoredState {
  mode: Mode;
  maxScale: number;
  currentGrade: number;
  finalExamWeightPercent: number;
  examTargetGrade: number;
  categories: GradeCategory[];
  method: CategoryMethod;
  courseTargetGrade: number;
  roundingPolicy: RoundingPolicy;
}

function defaultState(): StoredState {
  return {
    mode: "exam",
    maxScale: 100,
    currentGrade: 78,
    finalExamWeightPercent: 30,
    examTargetGrade: 85,
    categories: [
      { ...createGradeCategory(), name: "Tareas", weightPercent: 30, currentGrade: 90, hasActivities: true },
      { ...createGradeCategory(), name: "Exámenes parciales", weightPercent: 40, currentGrade: 75, hasActivities: true },
      { ...createGradeCategory(), name: "Examen final", weightPercent: 30, hasActivities: false },
    ],
    method: "percent",
    courseTargetGrade: 80,
    roundingPolicy: "none",
  };
}

export function FinalGradeTool() {
  const [state, setState] = useState<StoredState>(defaultState());
  const [error, setError] = useState<string | null>(null);

  function patch(p: Partial<StoredState>) {
    setState((prev) => ({ ...prev, ...p }));
  }
  function updateCategory(id: string, p: Partial<GradeCategory>) {
    setState((prev) => ({ ...prev, categories: prev.categories.map((c) => (c.id === id ? { ...c, ...p } : c)) }));
  }

  const examResult = calculateFinalExamNeeded({ currentGrade: state.currentGrade, finalExamWeightPercent: state.finalExamWeightPercent, targetGrade: state.examTargetGrade, maxScale: state.maxScale });
  const courseResult = calculateCourseGrade({ categories: state.categories, method: state.method, targetGrade: state.courseTargetGrade, maxScale: state.maxScale, roundingPolicy: state.roundingPolicy });

  function summaryText(): string {
    if (state.mode === "exam" && examResult.ok) {
      return [`Nota necesaria en el examen final: ${examResult.requiredExamGrade!.toFixed(2)}`, examResult.achievable ? "El objetivo es alcanzable." : "El objetivo NO es alcanzable con esta escala.", `Nota final si obtienes la máxima puntuación: ${examResult.finalGradeIfMaxExam!.toFixed(2)}`].join("\n");
    }
    if (state.mode === "categories" && courseResult.ok) {
      return [
        `Nota actual: ${courseResult.currentGrade!.toFixed(2)}`,
        `Peso completado: ${courseResult.weightCompletedPercent!.toFixed(1)}% · Peso restante: ${courseResult.weightRemainingPercent!.toFixed(1)}%`,
        courseResult.requiredAverageOnRemaining !== undefined ? `Nota media necesaria en el resto: ${courseResult.requiredAverageOnRemaining.toFixed(2)}${courseResult.achievable ? "" : " (no alcanzable)"}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    }
    return "";
  }

  function handleExportJson() {
    downloadTextFile(`${TOOL_ID}.json`, JSON.stringify(buildDocumentEnvelope(TOOL_ID, state), null, 2), "application/json;charset=utf-8");
  }
  function handleImportJson(files: File[]) {
    const file = files[0];
    if (!file) return;
    file.text().then((text) => {
      const result = parseDocumentEnvelope<StoredState>(text, TOOL_ID);
      if (!result.ok || !result.data) {
        setError(result.error ?? "No se pudo importar el archivo.");
        return;
      }
      setError(null);
      setState(result.data);
    });
  }

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">Los datos se procesan en tu dispositivo y no se envían al servidor.</p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant={state.mode === "exam" ? "default" : "outline"} size="sm" onClick={() => patch({ mode: "exam" })}>
          Examen final
        </Button>
        <Button type="button" variant={state.mode === "categories" ? "default" : "outline"} size="sm" onClick={() => patch({ mode: "categories" })}>
          Curso por categorías
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="fg-scale" className="mb-1">
            Escala máxima
          </Label>
          <Input id="fg-scale" type="number" min={1} step="1" value={state.maxScale} onChange={(e) => patch({ maxScale: Number(e.target.value) })} />
        </div>
        <div>
          <Label htmlFor="fg-rounding" className="mb-1">
            Política de redondeo
          </Label>
          <Select value={state.roundingPolicy} onValueChange={(v) => patch({ roundingPolicy: v as RoundingPolicy })}>
            <SelectTrigger id="fg-rounding" className="w-full">
              <SelectValue>{ROUNDING_LABELS[state.roundingPolicy]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ROUNDING_LABELS) as RoundingPolicy[]).map((r) => (
                <SelectItem key={r} value={r}>
                  {ROUNDING_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {state.mode === "exam" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="fg-current" className="mb-1">
              Nota actual (sin el examen)
            </Label>
            <Input id="fg-current" type="number" step="0.01" value={state.currentGrade} onChange={(e) => patch({ currentGrade: Number(e.target.value) })} />
          </div>
          <div>
            <Label htmlFor="fg-weight" className="mb-1">
              Peso del examen final (%)
            </Label>
            <Input id="fg-weight" type="number" min={0} max={100} step="0.1" value={state.finalExamWeightPercent} onChange={(e) => patch({ finalExamWeightPercent: Number(e.target.value) })} />
          </div>
          <div>
            <Label htmlFor="fg-target" className="mb-1">
              Nota objetivo del curso
            </Label>
            <Input id="fg-target" type="number" step="0.01" value={state.examTargetGrade} onChange={(e) => patch({ examTargetGrade: Number(e.target.value) })} />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-4">
            <Select value={state.method} onValueChange={(v) => patch({ method: v as CategoryMethod })}>
              <SelectTrigger className="w-56">
                <SelectValue>{state.method === "percent" ? "Porcentaje por categoría" : "Puntos totales"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">Porcentaje por categoría</SelectItem>
                <SelectItem value="points">Puntos totales</SelectItem>
              </SelectContent>
            </Select>
            <div>
              <Label htmlFor="fg-course-target" className="mb-1">
                Nota objetivo del curso
              </Label>
              <Input id="fg-course-target" type="number" step="0.01" value={state.courseTargetGrade} onChange={(e) => patch({ courseTargetGrade: Number(e.target.value) })} className="w-32" />
            </div>
          </div>
          {state.categories.map((cat) => (
            <div key={cat.id} className="grid gap-2 rounded-md border p-2 sm:grid-cols-6">
              <Input placeholder="Categoría" value={cat.name} onChange={(e) => updateCategory(cat.id, { name: e.target.value })} className="sm:col-span-2" />
              <Input type="number" min={0} step="0.1" placeholder="Peso %" value={cat.weightPercent} onChange={(e) => updateCategory(cat.id, { weightPercent: Number(e.target.value) })} />
              <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={cat.hasActivities} onChange={(e) => updateCategory(cat.id, { hasActivities: e.target.checked })} />
                Ya tiene notas
              </label>
              {cat.hasActivities && state.method === "percent" ? (
                <Input type="number" step="0.01" placeholder="Nota" value={cat.currentGrade} onChange={(e) => updateCategory(cat.id, { currentGrade: Number(e.target.value) })} />
              ) : cat.hasActivities ? (
                <>
                  <Input type="number" min={0} step="0.01" placeholder="Puntos obtenidos" value={cat.pointsEarned} onChange={(e) => updateCategory(cat.id, { pointsEarned: Number(e.target.value) })} />
                  <Input type="number" min={0} step="0.01" placeholder="Puntos posibles" value={cat.pointsPossible} onChange={(e) => updateCategory(cat.id, { pointsPossible: Number(e.target.value) })} />
                </>
              ) : (
                <span />
              )}
              <Button type="button" variant="ghost" size="sm" onClick={() => setState((prev) => ({ ...prev, categories: prev.categories.filter((c) => c.id !== cat.id) }))}>
                Eliminar
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setState((prev) => (prev.categories.length < DOCUMENT_LIMITS.finalGrade.maxCategories ? { ...prev, categories: [...prev.categories, createGradeCategory()] } : prev))}>
            Añadir categoría
          </Button>
        </div>
      )}

      {state.mode === "exam" && !examResult.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {examResult.error}
        </p>
      ) : null}
      {state.mode === "categories" && !courseResult.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {courseResult.error}
        </p>
      ) : null}

      {state.mode === "exam" && examResult.ok ? (
        <div aria-live="polite" className="grid gap-2 rounded-lg border p-4 text-sm sm:grid-cols-2">
          <p>
            Nota necesaria en el examen: <strong>{examResult.requiredExamGrade!.toFixed(2)}</strong>
          </p>
          <p className={examResult.achievable ? "" : "text-destructive"}>{examResult.achievable ? "El objetivo es alcanzable." : "El objetivo NO es alcanzable con esta escala."}</p>
          <p>Nota final con la máxima puntuación posible: {examResult.finalGradeIfMaxExam!.toFixed(2)}</p>
        </div>
      ) : null}

      {state.mode === "categories" && courseResult.ok ? (
        <div aria-live="polite" className="space-y-3 rounded-lg border p-4 text-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            <p>
              Nota actual: <strong>{courseResult.currentGrade!.toFixed(2)}</strong>
            </p>
            <p>
              Peso completado: {courseResult.weightCompletedPercent!.toFixed(1)}% · Restante: {courseResult.weightRemainingPercent!.toFixed(1)}%
            </p>
            {courseResult.requiredAverageOnRemaining !== undefined ? (
              <p className={courseResult.achievable ? "" : "text-destructive"}>
                Nota media necesaria en el resto: {courseResult.requiredAverageOnRemaining.toFixed(2)}
                {courseResult.achievable ? "" : " (no alcanzable)"}
              </p>
            ) : null}
          </div>
          {courseResult.perCategory ? (
            <ul className="space-y-0.5">
              {courseResult.perCategory.map((c) => (
                <li key={c.id}>
                  {c.name || "Sin nombre"}: {c.categoryGrade !== null ? c.categoryGrade.toFixed(2) : "sin datos"} (peso {c.weightPercent}%)
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <CopyButton text={summaryText()} label="Copiar resumen" />
        <Button type="button" variant="outline" onClick={() => downloadTextFile("nota-final.txt", summaryText())} disabled={!summaryText()}>
          Descargar informe
        </Button>
        <Button type="button" variant="outline" onClick={handleExportJson}>
          Exportar JSON
        </Button>
        <ResetButton
          onReset={() => {
            setState(defaultState());
            setError(null);
          }}
        />
      </div>

      <FileUploadZone accept="application/json" onFilesSelected={handleImportJson} label="Importar un escenario guardado previamente" hint="" />
    </div>
  );
}
