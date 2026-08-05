import { addCalendarTime, calendarDateToIso, monthNameOf, type CalendarDate } from "@/lib/public-tools/utilities/dates";
import { DOCUMENT_LIMITS } from "@/lib/public-tools/documents/limits";

/**
 * Generic, non-medical tracker sections only — no health/diet advice is ever
 * given (spec section 24: "no conviertas esta herramienta en un sistema de
 * salud"). Each section is just a labeled block the visitor fills in by
 * hand; the tool never interprets what's written in it. 5 real, structurally
 * distinct modes (spec correction: weekly/monthly/daily grids, a
 * variable-length named-block schedule, and a goal tracker with its own
 * data model — never just relabeled variants of the same grid).
 */
export type PlannerMode = "weekly" | "monthly" | "daily" | "block-schedule" | "goals";
export type PlannerSectionKind = "priorities" | "tasks" | "appointments" | "notes" | "habits" | "meals" | "water" | "expenses" | "goals" | "reflection";

export const PLANNER_MODE_LABELS: Record<PlannerMode, string> = {
  weekly: "Semanal",
  monthly: "Mensual",
  daily: "Diario",
  "block-schedule": "Horario por bloques",
  goals: "Planificador de objetivos",
};

export const PLANNER_SECTION_LABELS: Record<PlannerSectionKind, string> = {
  priorities: "Prioridades",
  tasks: "Tareas",
  appointments: "Citas",
  notes: "Notas",
  habits: "Seguimiento de hábitos",
  meals: "Comidas",
  water: "Registro de agua",
  expenses: "Gastos",
  goals: "Objetivos",
  reflection: "Reflexión",
};

export interface PlannerSection {
  kind: PlannerSectionKind;
  enabled: boolean;
}

/** A visitor-named block with its own start/end time (e.g. "Enfoque profundo — 07:00 a 09:00") — unlike the fixed hourly rows of weekly/daily mode, blocks can be any length and are given a real label. */
export interface CustomTimeBlock {
  id: string;
  label: string;
  startHour: number; // fractional hours allowed, e.g. 7.5 = 07:30
  endHour: number;
}

export interface GoalStep {
  id: string;
  text: string;
  done: boolean;
}

export interface PlannerGoal {
  id: string;
  title: string;
  targetDate: string;
  priority: "" | "low" | "medium" | "high";
  progressPercent: number; // 0-100, always set manually by the visitor — never inferred from steps
  steps: GoalStep[];
  notes: string;
}

export interface PlannerOptions {
  mode: PlannerMode;
  anchorDate: CalendarDate;
  firstDayOfWeek: 0 | 1;
  useTimeBlocks: boolean;
  timeBlockStartHour: number;
  timeBlockEndHour: number;
  sections: PlannerSection[];
  customBlocks: CustomTimeBlock[]; // block-schedule mode only
  goals: PlannerGoal[]; // goals mode only
}

export function createDefaultPlannerOptions(today: CalendarDate): PlannerOptions {
  return {
    mode: "weekly",
    anchorDate: today,
    firstDayOfWeek: 1,
    useTimeBlocks: true,
    timeBlockStartHour: 7,
    timeBlockEndHour: 21,
    sections: (["priorities", "tasks", "notes"] as PlannerSectionKind[]).map((kind) => ({ kind, enabled: true })),
    customBlocks: [createCustomTimeBlock()],
    goals: [createPlannerGoal()],
  };
}

export function createCustomTimeBlock(): CustomTimeBlock {
  return { id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, label: "", startHour: 9, endHour: 10 };
}

export function createPlannerGoal(): PlannerGoal {
  return { id: `goal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title: "", targetDate: "", priority: "", progressPercent: 0, steps: [], notes: "" };
}

export function createGoalStep(): GoalStep {
  return { id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text: "", done: false };
}

/** Rewinds `anchorDate` to the start of its week for the given first-day-of-week convention. */
function startOfWeek(date: CalendarDate, firstDayOfWeek: 0 | 1): CalendarDate {
  const jsWeekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  const diff = (jsWeekday - firstDayOfWeek + 7) % 7;
  return addCalendarTime(date, { days: -diff });
}

export function plannerWeekDates(options: PlannerOptions): CalendarDate[] {
  const start = startOfWeek(options.anchorDate, options.firstDayOfWeek);
  return Array.from({ length: 7 }, (_, i) => addCalendarTime(start, { days: i }));
}

export function plannerTimeBlocks(options: PlannerOptions): string[] {
  const blocks: string[] = [];
  for (let hour = options.timeBlockStartHour; hour < options.timeBlockEndHour; hour++) {
    blocks.push(`${String(hour).padStart(2, "0")}:00`);
  }
  return blocks;
}

function formatHour(h: number): string {
  const hour = Math.floor(h);
  const minute = Math.round((h - hour) * 60);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Sorted purely for display — never mutates the visitor's own ordering of the underlying list. */
export function sortedCustomBlocks(options: PlannerOptions): CustomTimeBlock[] {
  return [...options.customBlocks].sort((a, b) => a.startHour - b.startHour);
}

export function formatCustomBlockRange(block: CustomTimeBlock): string {
  return `${formatHour(block.startHour)} – ${formatHour(block.endHour)}`;
}

export function plannerTitle(options: PlannerOptions): string {
  if (options.mode === "goals") return "Planificador de objetivos";
  if (options.mode === "block-schedule" || options.mode === "daily") return calendarDateToIso(options.anchorDate);
  if (options.mode === "monthly") return `${monthNameOf(options.anchorDate.month)} ${options.anchorDate.year}`;
  const week = plannerWeekDates(options);
  return `${calendarDateToIso(week[0])} — ${calendarDateToIso(week[6])}`;
}

export interface PlannerValidation {
  errors: string[];
  warnings: string[];
}

export function validatePlannerOptions(options: PlannerOptions): PlannerValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (options.sections.length > DOCUMENT_LIMITS.planner.maxSections) errors.push(`Demasiadas secciones (máximo ${DOCUMENT_LIMITS.planner.maxSections}).`);
  if (options.mode !== "block-schedule" && options.mode !== "goals" && options.useTimeBlocks && options.timeBlockEndHour <= options.timeBlockStartHour) {
    errors.push("La hora final debe ser posterior a la hora inicial.");
  }
  if (options.mode === "block-schedule") {
    if (options.customBlocks.length === 0) errors.push("Añade al menos un bloque horario.");
    for (const block of options.customBlocks) {
      if (block.endHour <= block.startHour) errors.push(`El bloque "${block.label || "sin nombre"}" tiene una hora de fin anterior o igual al inicio.`);
    }
    const sorted = sortedCustomBlocks(options);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].startHour < sorted[i - 1].endHour) {
        warnings.push(`Los bloques "${sorted[i - 1].label || "sin nombre"}" y "${sorted[i].label || "sin nombre"}" se solapan.`);
      }
    }
  }
  if (options.mode === "goals") {
    if (options.goals.length === 0) errors.push("Añade al menos un objetivo.");
    for (const goal of options.goals) {
      if (goal.progressPercent < 0 || goal.progressPercent > 100) errors.push(`El progreso de "${goal.title || "un objetivo"}" debe estar entre 0 y 100.`);
    }
  }
  if (options.mode !== "block-schedule" && options.mode !== "goals" && options.sections.every((s) => !s.enabled) && !options.useTimeBlocks) {
    warnings.push("No hay ninguna sección ni horario habilitado.");
  }
  return { errors, warnings };
}
