"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CopyButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { PRESET_GRADE_SCALES, createCustomGradeLevel, validateCustomScale, type PresetGradeScaleId, type CustomGradeScale, type CustomGradeLevel } from "@/lib/public-tools/education/grade-scales";
import { calculateGpa, calculateRequiredGradeForTarget, createCourse, type Course, type CourseType, type GpaScaleContext } from "@/lib/public-tools/education/gpa";
import { buildCsv, downloadTextFile } from "@/lib/public-tools/csv-export";
import { parseCsv } from "@/lib/performance/csv";
import { buildDocumentEnvelope, parseDocumentEnvelope } from "@/lib/public-tools/documents/json-schema";
import { DOCUMENT_LIMITS } from "@/lib/public-tools/documents/limits";

const TOOL_ID = "calculadora-gpa-promedio";
const COURSE_TYPE_LABELS: Record<CourseType, string> = { graded: "Calificada", "pass-fail": "Aprobado/reprobado", excluded: "Excluida" };

interface StoredState {
  scaleId: PresetGradeScaleId | "custom";
  customScale: CustomGradeScale;
  courses: Course[];
  targetGpa: number;
  additionalCredits: number;
}

function defaultState(): StoredState {
  return {
    scaleId: "gpa-4",
    customScale: { levels: [createCustomGradeLevel()] },
    courses: [{ ...createCourse(), name: "Materia 1", gradeValue: 3.5, period: "2026-1" }],
    targetGpa: 3.5,
    additionalCredits: 15,
  };
}

export function GpaCalculatorTool() {
  const [state, setState] = useState<StoredState>(defaultState());
  const [error, setError] = useState<string | null>(null);

  function patch(p: Partial<StoredState>) {
    setState((prev) => ({ ...prev, ...p }));
  }
  function updateCourse(id: string, p: Partial<Course>) {
    setState((prev) => ({ ...prev, courses: prev.courses.map((c) => (c.id === id ? { ...c, ...p } : c)) }));
  }
  function updateLevel(id: string, p: Partial<CustomGradeLevel>) {
    setState((prev) => ({ ...prev, customScale: { levels: prev.customScale.levels.map((l) => (l.id === id ? { ...l, ...p } : l)) } }));
  }

  const ctx: GpaScaleContext = { scaleId: state.scaleId, customScale: state.customScale };
  const scaleValidation = state.scaleId === "custom" ? validateCustomScale(state.customScale) : { errors: [] };
  const gpaResult = scaleValidation.errors.length === 0 ? calculateGpa(state.courses, ctx) : { ok: false, error: scaleValidation.errors[0] };
  const requiredResult = gpaResult.ok ? calculateRequiredGradeForTarget({ currentCourses: state.courses, ctx, targetGpa: state.targetGpa, additionalCredits: state.additionalCredits }) : null;

  const periods = Array.from(new Set(state.courses.map((c) => c.period).filter(Boolean)));
  const perPeriodGpa = periods.map((period) => ({ period, result: calculateGpa(state.courses.filter((c) => c.period === period), ctx) }));

  function summaryText(): string {
    if (!gpaResult.ok) return "";
    const lines = [`Promedio general: ${gpaResult.gpa!.toFixed(3)}`, `Créditos intentados: ${gpaResult.creditsAttempted}`, `Créditos contabilizados: ${gpaResult.creditsCounted}`];
    for (const { period, result } of perPeriodGpa) if (result.ok) lines.push(`${period}: ${result.gpa!.toFixed(3)}`);
    if (requiredResult?.ok) lines.push(`Nota media necesaria en ${state.additionalCredits} créditos futuros para alcanzar ${state.targetGpa}: ${requiredResult.requiredAverageGrade!.toFixed(2)}${requiredResult.achievable ? "" : " (no alcanzable en esta escala)"}`);
    return lines.join("\n");
  }

  function handleCsvExport() {
    const csv = buildCsv(["Materia", "Nota", "Créditos", "Tipo", "Periodo"], state.courses.map((c) => [c.name, String(c.gradeValue), String(c.credits), COURSE_TYPE_LABELS[c.type], c.period]));
    downloadTextFile("materias-gpa.csv", csv, "text/csv;charset=utf-8");
  }
  function handleCsvImport(files: File[]) {
    const file = files[0];
    if (!file) return;
    file.text().then((text) => {
      const { headers, rows } = parseCsv(text);
      const nameIdx = headers.indexOf("Materia");
      const gradeIdx = headers.indexOf("Nota");
      const creditsIdx = headers.indexOf("Créditos");
      const periodIdx = headers.indexOf("Periodo");
      if (nameIdx === -1 || gradeIdx === -1) {
        setError('El CSV debe incluir al menos las columnas "Materia" y "Nota".');
        return;
      }
      const imported: Course[] = rows.slice(0, DOCUMENT_LIMITS.gpa.maxCourses).map((row) => ({
        ...createCourse(),
        name: row[nameIdx] ?? "",
        gradeValue: Number(row[gradeIdx]) || 0,
        credits: creditsIdx >= 0 ? Number(row[creditsIdx]) || 0 : 3,
        period: periodIdx >= 0 ? (row[periodIdx] ?? "") : "",
      }));
      setError(null);
      patch({ courses: imported });
    });
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
      <p className="text-xs text-muted-foreground">Las políticas de calificación varían entre instituciones. Comprueba la escala oficial de tu escuela o universidad.</p>

      <div>
        <Label htmlFor="gpa-scale" className="mb-1">
          Escala
        </Label>
        <Select value={state.scaleId} onValueChange={(v) => patch({ scaleId: v as PresetGradeScaleId | "custom" })}>
          <SelectTrigger id="gpa-scale" className="w-full sm:w-72">
            <SelectValue>{state.scaleId === "custom" ? "Personalizada" : (PRESET_GRADE_SCALES.find((s) => s.id === state.scaleId)?.label ?? state.scaleId)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {PRESET_GRADE_SCALES.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.label}
              </SelectItem>
            ))}
            <SelectItem value="custom">Personalizada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {state.scaleId === "custom" ? (
        <div className="space-y-2 rounded-lg border p-3">
          <h2 className="text-sm font-semibold">Niveles de la escala personalizada</h2>
          {state.customScale.levels.map((level) => (
            <div key={level.id} className="grid gap-2 sm:grid-cols-4">
              <Input placeholder="Etiqueta (p. ej. Sobresaliente)" value={level.label} onChange={(e) => updateLevel(level.id, { label: e.target.value })} className="sm:col-span-2" />
              <Input type="number" step="0.01" placeholder="Puntos" value={level.points} onChange={(e) => updateLevel(level.id, { points: Number(e.target.value) })} />
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={level.countsInAverage} onChange={(e) => updateLevel(level.id, { countsInAverage: e.target.checked })} />
                Cuenta en el promedio
              </label>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => patch({ customScale: { levels: [...state.customScale.levels, createCustomGradeLevel()] } })}>
            Añadir nivel
          </Button>
        </div>
      ) : null}

      <div className="space-y-3">
        {state.courses.map((course) => (
          <div key={course.id} className="grid gap-2 rounded-md border p-2 sm:grid-cols-6">
            <Input placeholder="Materia" value={course.name} onChange={(e) => updateCourse(course.id, { name: e.target.value })} className="sm:col-span-2" />
            {state.scaleId === "custom" ? (
              <Select value={course.customLevelId ?? ""} onValueChange={(v) => updateCourse(course.id, { customLevelId: v as string })}>
                <SelectTrigger>
                  <SelectValue placeholder="Nivel">{state.customScale.levels.find((l) => l.id === course.customLevelId)?.label || undefined}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {state.customScale.levels.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.label || "(sin nombre)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input type="number" step="0.01" placeholder="Nota" value={course.gradeValue} onChange={(e) => updateCourse(course.id, { gradeValue: Number(e.target.value) })} />
            )}
            <Input type="number" min={0} step="0.5" placeholder="Créditos" value={course.credits} onChange={(e) => updateCourse(course.id, { credits: Number(e.target.value) })} />
            <Select value={course.type} onValueChange={(v) => updateCourse(course.id, { type: v as CourseType })}>
              <SelectTrigger>
                <SelectValue>{COURSE_TYPE_LABELS[course.type]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(COURSE_TYPE_LABELS) as CourseType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {COURSE_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Input placeholder="Periodo" value={course.period} onChange={(e) => updateCourse(course.id, { period: e.target.value })} />
              <Button type="button" variant="ghost" size="sm" onClick={() => setState((prev) => ({ ...prev, courses: prev.courses.filter((c) => c.id !== course.id) }))}>
                Eliminar
              </Button>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setState((prev) => (prev.courses.length < DOCUMENT_LIMITS.gpa.maxCourses ? { ...prev, courses: [...prev.courses, createCourse()] } : prev))}>
          Añadir materia
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="gpa-target" className="mb-1">
            GPA objetivo (para el escenario)
          </Label>
          <Input id="gpa-target" type="number" step="0.01" value={state.targetGpa} onChange={(e) => patch({ targetGpa: Number(e.target.value) })} />
        </div>
        <div>
          <Label htmlFor="gpa-additional-credits" className="mb-1">
            Créditos futuros a cursar
          </Label>
          <Input id="gpa-additional-credits" type="number" min={0} step="0.5" value={state.additionalCredits} onChange={(e) => patch({ additionalCredits: Number(e.target.value) })} />
        </div>
      </div>

      {!gpaResult.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {gpaResult.error}
        </p>
      ) : null}

      {gpaResult.ok ? (
        <div aria-live="polite" className="space-y-2 rounded-lg border p-4 text-sm">
          <p>
            Promedio general: <strong>{gpaResult.gpa!.toFixed(3)}</strong>
          </p>
          <p>
            Créditos intentados: {gpaResult.creditsAttempted} · Créditos contabilizados: {gpaResult.creditsCounted}
          </p>
          {perPeriodGpa.length > 1 ? (
            <ul className="space-y-0.5">
              {perPeriodGpa.map(({ period, result }) => (
                <li key={period}>
                  {period}: {result.ok ? result.gpa!.toFixed(3) : "—"}
                </li>
              ))}
            </ul>
          ) : null}
          {requiredResult?.ok ? (
            <p>
              Nota media necesaria en {state.additionalCredits} créditos futuros para GPA {state.targetGpa}: <strong>{requiredResult.requiredAverageGrade!.toFixed(2)}</strong>
              {requiredResult.achievable ? "" : " — no alcanzable en esta escala"}
            </p>
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
        <Button type="button" variant="outline" onClick={handleCsvExport}>
          Exportar CSV
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

      <div className="grid gap-4 sm:grid-cols-2">
        <FileUploadZone accept=".csv,text/csv" onFilesSelected={handleCsvImport} label="Importar materias desde CSV" hint="" />
        <FileUploadZone accept="application/json" onFilesSelected={handleImportJson} label="Importar un escenario guardado previamente" hint="" />
      </div>
    </div>
  );
}
