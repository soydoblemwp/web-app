/**
 * GPA / weighted-average core (spec section 17). Every rule that affects the
 * result (does pass/fail count, what a custom level is worth) is explicit,
 * visitor-configured data — never a hardcoded assumption baked into the
 * formula (spec: "no asumas que A siempre equivale a 4... esas reglas deben
 * ser configurables").
 */
import type { PresetGradeScaleId, CustomGradeScale } from "./grade-scales";
import { getPresetScale } from "./grade-scales";

export type CourseType = "graded" | "pass-fail" | "excluded";

export interface Course {
  id: string;
  name: string;
  gradeValue: number; // raw value on a preset scale, ignored (custom levelId used instead) for the custom scale
  customLevelId?: string; // used only when the active scale is "custom"
  credits: number;
  type: CourseType;
  period: string;
  category?: string;
  passed?: boolean; // only meaningful when type === "pass-fail" — did the visitor mark it as passed?
  isFuture: boolean; // a hypothetical/planned course for "what-if" scenarios — never counted unless explicitly included
}

export function createCourse(): Course {
  return { id: `course-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: "", gradeValue: 0, credits: 3, type: "graded", period: "", passed: true, isFuture: false };
}

export interface GpaScaleContext {
  scaleId: PresetGradeScaleId | "custom";
  customScale?: CustomGradeScale;
}

export interface GpaResult {
  ok: boolean;
  error?: string;
  gpa?: number;
  creditsAttempted?: number;
  creditsCounted?: number;
  totalQualityPoints?: number;
}

function resolveCoursePoints(course: Course, ctx: GpaScaleContext): { counts: boolean; points: number } {
  if (course.type === "excluded") return { counts: false, points: 0 };
  if (course.type === "pass-fail") return { counts: false, points: 0 };

  if (ctx.scaleId === "custom") {
    const level = ctx.customScale?.levels.find((l) => l.id === course.customLevelId);
    if (!level) return { counts: false, points: 0 };
    return { counts: level.countsInAverage, points: level.points };
  }

  return { counts: true, points: course.gradeValue };
}

export function calculateGpa(courses: Course[], ctx: GpaScaleContext, includeFuture = false): GpaResult {
  const relevant = courses.filter((c) => includeFuture || !c.isFuture);
  if (relevant.length === 0) return { ok: false, error: "Añade al menos una materia." };

  let creditsAttempted = 0;
  let creditsCounted = 0;
  let totalQualityPoints = 0;

  for (const course of relevant) {
    if (!Number.isFinite(course.credits) || course.credits < 0) return { ok: false, error: `La materia "${course.name || "sin nombre"}" tiene créditos inválidos.` };
    creditsAttempted += course.credits;
    const { counts, points } = resolveCoursePoints(course, ctx);
    if (counts) {
      creditsCounted += course.credits;
      totalQualityPoints += points * course.credits;
    }
  }

  const gpa = creditsCounted > 0 ? totalQualityPoints / creditsCounted : 0;
  return { ok: true, gpa, creditsAttempted, creditsCounted, totalQualityPoints };
}

export function calculatePeriodGpa(courses: Course[], period: string, ctx: GpaScaleContext): GpaResult {
  return calculateGpa(
    courses.filter((c) => c.period === period),
    ctx
  );
}

export interface RequiredGradeInput {
  currentCourses: Course[];
  ctx: GpaScaleContext;
  targetGpa: number;
  additionalCredits: number;
}

export interface RequiredGradeResult {
  ok: boolean;
  error?: string;
  requiredAverageGrade?: number;
  achievable?: boolean; // false when the required grade exceeds the scale's maximum
}

/** Solves for the average grade needed on `additionalCredits` more credits to reach `targetGpa` overall — an inversion of the weighted-average formula, never a guess. */
export function calculateRequiredGradeForTarget(input: RequiredGradeInput): RequiredGradeResult {
  if (input.additionalCredits <= 0) return { ok: false, error: "Los créditos adicionales deben ser mayores que cero." };
  const current = calculateGpa(input.currentCourses, input.ctx);
  if (!current.ok) return { ok: false, error: current.error };

  const currentCredits = current.creditsCounted ?? 0;
  const currentQualityPoints = current.totalQualityPoints ?? 0;
  const totalCreditsAfter = currentCredits + input.additionalCredits;
  const requiredTotalQualityPoints = input.targetGpa * totalCreditsAfter;
  const requiredAverageGrade = (requiredTotalQualityPoints - currentQualityPoints) / input.additionalCredits;

  const scaleMax = input.ctx.scaleId === "custom" ? Math.max(0, ...(input.ctx.customScale?.levels.map((l) => l.points) ?? [0])) : (getPresetScale(input.ctx.scaleId)?.maxValue ?? Infinity);

  return { ok: true, requiredAverageGrade, achievable: requiredAverageGrade <= scaleMax };
}
