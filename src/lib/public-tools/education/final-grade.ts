/**
 * "What grade do I need" core (spec section 18): a single final exam mode,
 * and a category-weighted course mode. Every rounding policy is an explicit
 * visitor choice, never invented (spec: "no inventes políticas de
 * redondeo... explica sus diferencias").
 */

export type RoundingPolicy = "none" | "final-only" | "per-activity";

function applyRounding(value: number, policy: RoundingPolicy, precision = 2): number {
  if (policy === "none") return value;
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

export interface FinalExamInput {
  currentGrade: number;
  finalExamWeightPercent: number;
  targetGrade: number;
  maxScale: number; // e.g. 100, 10, 20 — the scale's maximum possible grade
}

export interface FinalExamResult {
  ok: boolean;
  error?: string;
  requiredExamGrade?: number;
  achievable?: boolean;
  finalGradeIfMaxExam?: number;
  finalGradeIfExam?: (examGrade: number) => number;
}

export function calculateFinalExamNeeded(input: FinalExamInput): FinalExamResult {
  if (input.finalExamWeightPercent <= 0 || input.finalExamWeightPercent > 100) return { ok: false, error: "El peso del examen final debe estar entre 0% (exclusivo) y 100%." };
  if (input.maxScale <= 0) return { ok: false, error: "La escala máxima debe ser mayor que cero." };

  const weight = input.finalExamWeightPercent / 100;
  const currentWeight = 1 - weight;
  const requiredExamGrade = (input.targetGrade - input.currentGrade * currentWeight) / weight;
  const finalGradeIfMaxExam = input.currentGrade * currentWeight + input.maxScale * weight;

  return {
    ok: true,
    requiredExamGrade,
    achievable: requiredExamGrade <= input.maxScale,
    finalGradeIfMaxExam,
    finalGradeIfExam: (examGrade: number) => input.currentGrade * currentWeight + examGrade * weight,
  };
}

export type CategoryMethod = "percent" | "points";

export interface GradeCategory {
  id: string;
  name: string;
  weightPercent: number;
  currentGrade: number; // for "percent" method
  pointsEarned: number; // for "points" method
  pointsPossible: number; // for "points" method
  hasActivities: boolean; // false = no graded work yet in this category
  isFuture: boolean;
}

export function createGradeCategory(): GradeCategory {
  return { id: `cat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: "", weightPercent: 0, currentGrade: 0, pointsEarned: 0, pointsPossible: 0, hasActivities: false, isFuture: false };
}

export interface CourseGradeInput {
  categories: GradeCategory[];
  method: CategoryMethod;
  targetGrade: number;
  maxScale: number;
  roundingPolicy: RoundingPolicy;
}

export interface CategoryContribution {
  id: string;
  name: string;
  weightPercent: number;
  categoryGrade: number | null; // null when hasActivities is false (no data yet)
  weightedContribution: number;
}

export interface CourseGradeResult {
  ok: boolean;
  error?: string;
  totalWeightPercent?: number;
  weightCompletedPercent?: number;
  weightRemainingPercent?: number;
  currentGrade?: number;
  requiredAverageOnRemaining?: number;
  achievable?: boolean;
  perCategory?: CategoryContribution[];
}

export function calculateCourseGrade(input: CourseGradeInput): CourseGradeResult {
  if (input.categories.length === 0) return { ok: false, error: "Añade al menos una categoría." };
  if (input.maxScale <= 0) return { ok: false, error: "La escala máxima debe ser mayor que cero." };

  const totalWeightPercent = input.categories.reduce((sum, c) => sum + c.weightPercent, 0);

  const perCategory: CategoryContribution[] = [];
  let weightCompletedPercent = 0;
  let currentWeightedSum = 0;

  for (const cat of input.categories) {
    if (cat.weightPercent < 0) return { ok: false, error: `La categoría "${cat.name || "sin nombre"}" tiene un peso negativo.` };
    let categoryGrade: number | null = null;
    if (cat.hasActivities) {
      if (input.method === "points") {
        if (cat.pointsPossible <= 0) return { ok: false, error: `La categoría "${cat.name || "sin nombre"}" tiene puntos posibles igual a cero.` };
        categoryGrade = (cat.pointsEarned / cat.pointsPossible) * input.maxScale;
      } else {
        categoryGrade = cat.currentGrade;
      }
      categoryGrade = applyRounding(categoryGrade, input.roundingPolicy === "per-activity" ? "per-activity" : "none");
    }

    const weightedContribution = categoryGrade !== null ? (categoryGrade / input.maxScale) * cat.weightPercent : 0;
    if (categoryGrade !== null) {
      weightCompletedPercent += cat.weightPercent;
      currentWeightedSum += weightedContribution;
    }
    perCategory.push({ id: cat.id, name: cat.name, weightPercent: cat.weightPercent, categoryGrade, weightedContribution });
  }

  const weightRemainingPercent = totalWeightPercent - weightCompletedPercent;
  const currentGradeRaw = weightCompletedPercent > 0 ? (currentWeightedSum / weightCompletedPercent) * input.maxScale : 0;
  const currentGrade = applyRounding(currentGradeRaw, input.roundingPolicy === "none" ? "none" : "final-only");

  let requiredAverageOnRemaining: number | undefined;
  let achievable: boolean | undefined;
  if (weightRemainingPercent > 0) {
    const targetWeightedTotal = (input.targetGrade / input.maxScale) * totalWeightPercent;
    const remainingNeeded = targetWeightedTotal - currentWeightedSum;
    requiredAverageOnRemaining = (remainingNeeded / weightRemainingPercent) * input.maxScale;
    achievable = requiredAverageOnRemaining <= input.maxScale;
  }

  return { ok: true, totalWeightPercent, weightCompletedPercent, weightRemainingPercent, currentGrade, requiredAverageOnRemaining, achievable, perCategory };
}
