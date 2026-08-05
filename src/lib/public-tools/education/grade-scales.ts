/**
 * Configurable grading scales (spec section 17). No scale claims universal
 * equivalence with another — a course's grade is always a raw numeric value
 * on the ACTIVE scale's own range, never silently remapped between scales
 * (spec: "no declare equivalencia universal entre escalas"). The custom
 * scale additionally supports named discrete levels (e.g. "Apto"/"No apto")
 * that can each opt out of the weighted average — never a hardcoded
 * assumption that a given label always counts or never counts.
 */

export type PresetGradeScaleId = "gpa-4" | "gpa-5" | "scale-10" | "scale-20" | "scale-100";
export type GradeScaleId = PresetGradeScaleId | "custom";

export interface PresetGradeScale {
  id: PresetGradeScaleId;
  label: string;
  minValue: number;
  maxValue: number;
}

export const PRESET_GRADE_SCALES: PresetGradeScale[] = [
  { id: "gpa-4", label: "Escala 4.0 (GPA)", minValue: 0, maxValue: 4 },
  { id: "gpa-5", label: "Escala 5.0", minValue: 0, maxValue: 5 },
  { id: "scale-10", label: "Escala 0-10", minValue: 0, maxValue: 10 },
  { id: "scale-20", label: "Escala 0-20", minValue: 0, maxValue: 20 },
  { id: "scale-100", label: "Escala 0-100", minValue: 0, maxValue: 100 },
];

export function getPresetScale(id: PresetGradeScaleId): PresetGradeScale | undefined {
  return PRESET_GRADE_SCALES.find((s) => s.id === id);
}

export interface CustomGradeLevel {
  id: string;
  label: string;
  points: number;
  countsInAverage: boolean;
}

export interface CustomGradeScale {
  levels: CustomGradeLevel[];
}

export function createCustomGradeLevel(): CustomGradeLevel {
  return { id: `level-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, label: "", points: 0, countsInAverage: true };
}

export interface GradeScaleValidation {
  errors: string[];
}

export function validateCustomScale(scale: CustomGradeScale): GradeScaleValidation {
  const errors: string[] = [];
  if (scale.levels.length === 0) errors.push("Añade al menos un nivel a la escala personalizada.");
  for (const level of scale.levels) {
    if (!Number.isFinite(level.points)) errors.push(`El nivel "${level.label || "sin nombre"}" necesita un número de puntos válido.`);
  }
  return { errors };
}
