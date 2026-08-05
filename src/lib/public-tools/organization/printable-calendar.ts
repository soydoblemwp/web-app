import { daysInMonth, isLeapYear, weekdayIndexOf, monthNameOf, compareCalendarDates, type CalendarDate } from "@/lib/public-tools/utilities/dates";
import { DOCUMENT_LIMITS } from "@/lib/public-tools/documents/limits";
import { buildCsv } from "@/lib/public-tools/csv-export";

/**
 * Pure local calendar-grid math built entirely on the shared `CalendarDate`
 * core (`utilities/dates.ts`) — never a second date implementation, and
 * never a network fetch of national holidays (spec section 23: "no
 * descargues festivos externos... los festivos son los que introduzcas
 * manualmente").
 */
export type CalendarViewMode = "monthly" | "multi-month" | "annual" | "school";

/** A manually-defined academic period (e.g. "1er trimestre") — never inferred, never downloaded from an external school-calendar API. */
export interface SchoolPeriod {
  id: string;
  label: string;
  startDate: CalendarDate;
  endDate: CalendarDate;
}

/** A manually-defined break/recess (e.g. "Vacaciones de invierno") — shaded on the rendered month grids. */
export interface SchoolBreak {
  id: string;
  label: string;
  startDate: CalendarDate;
  endDate: CalendarDate;
}

export interface CalendarEvent {
  id: string;
  year: number;
  month: number;
  day: number;
  label: string;
  isHoliday: boolean;
}

export interface CalendarOptions {
  mode: CalendarViewMode;
  year: number;
  month: number; // 1-12, anchor month for monthly/multi-month
  monthCount: number; // used only in multi-month mode
  firstDayOfWeek: 0 | 1; // 0 = Sunday, 1 = Monday
  showWeekNumbers: boolean;
  events: CalendarEvent[];
  schoolStartDate: CalendarDate; // school mode only
  schoolEndDate: CalendarDate; // school mode only
  periods: SchoolPeriod[]; // school mode only
  breaks: SchoolBreak[]; // school mode only
}

export function createDefaultCalendarOptions(today: CalendarDate): CalendarOptions {
  return {
    mode: "monthly",
    year: today.year,
    month: today.month,
    monthCount: 3,
    firstDayOfWeek: 1,
    showWeekNumbers: false,
    events: [],
    schoolStartDate: today,
    schoolEndDate: today,
    periods: [],
    breaks: [],
  };
}

export function createSchoolPeriod(today: CalendarDate): SchoolPeriod {
  return { id: `period-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, label: "", startDate: today, endDate: today };
}

export function createSchoolBreak(today: CalendarDate): SchoolBreak {
  return { id: `break-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, label: "", startDate: today, endDate: today };
}

/** Whether `date` falls within any manually-defined break — used to shade day cells on the rendered school calendar. */
export function dateInAnyBreak(date: CalendarDate, breaks: SchoolBreak[]): SchoolBreak | undefined {
  return breaks.find((b) => compareCalendarDates(date, b.startDate) >= 0 && compareCalendarDates(date, b.endDate) <= 0);
}

export interface CalendarDayCell {
  date: CalendarDate;
  inCurrentMonth: boolean;
  weekday: number;
  events: CalendarEvent[];
}

export interface MonthGrid {
  year: number;
  month: number;
  monthName: string;
  weeks: CalendarDayCell[][];
}

/** ISO 8601 week number — used only for the optional "show week numbers" column, not for any date logic. */
function isoWeekNumber(date: CalendarDate): number {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day));
  const dayNum = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const diff = d.getTime() - firstThursday.getTime();
  return 1 + Math.round(diff / (7 * 86400000));
}

export function buildMonthGrid(year: number, month: number, firstDayOfWeek: 0 | 1, events: CalendarEvent[]): MonthGrid {
  const totalDays = daysInMonth(year, month);
  const eventsByDay = new Map<number, CalendarEvent[]>();
  for (const event of events) {
    if (event.year !== year || event.month !== month) continue;
    const list = eventsByDay.get(event.day) ?? [];
    list.push(event);
    eventsByDay.set(event.day, list);
  }

  const cells: CalendarDayCell[] = [];
  for (let day = 1; day <= totalDays; day++) {
    const date: CalendarDate = { year, month, day };
    cells.push({ date, inCurrentMonth: true, weekday: weekdayIndexOf(date), events: eventsByDay.get(day) ?? [] });
  }

  // Pad the first week so the 1st lands in the correct weekday column.
  const leadingEmpty = (cells[0].weekday - firstDayOfWeek + 7) % 7;
  const padded: (CalendarDayCell | null)[] = [...Array(leadingEmpty).fill(null), ...cells];
  while (padded.length % 7 !== 0) padded.push(null);

  const weeks: CalendarDayCell[][] = [];
  for (let i = 0; i < padded.length; i += 7) {
    weeks.push(padded.slice(i, i + 7).map((cell) => cell ?? { date: { year, month, day: 0 }, inCurrentMonth: false, weekday: 0, events: [] }));
  }

  return { year, month, monthName: monthNameOf(month), weeks };
}

export function buildCalendarGrids(options: CalendarOptions): MonthGrid[] {
  if (options.mode === "school") {
    const totalMonths = (options.schoolEndDate.year - options.schoolStartDate.year) * 12 + (options.schoolEndDate.month - options.schoolStartDate.month) + 1;
    const count = Math.min(Math.max(totalMonths, 1), DOCUMENT_LIMITS.calendar.maxMonthsInRange);
    const grids: MonthGrid[] = [];
    for (let i = 0; i < count; i++) {
      const totalMonthIndex = options.schoolStartDate.month - 1 + i;
      const year = options.schoolStartDate.year + Math.floor(totalMonthIndex / 12);
      const month = (((totalMonthIndex % 12) + 12) % 12) + 1;
      grids.push(buildMonthGrid(year, month, options.firstDayOfWeek, options.events));
    }
    return grids;
  }
  const count = options.mode === "monthly" ? 1 : options.mode === "annual" ? 12 : Math.min(options.monthCount, DOCUMENT_LIMITS.calendar.maxMonthsInRange);
  const startMonth = options.mode === "annual" ? 1 : options.month;
  const grids: MonthGrid[] = [];
  for (let i = 0; i < count; i++) {
    const totalMonthIndex = startMonth - 1 + i;
    const year = options.year + Math.floor(totalMonthIndex / 12);
    const month = (((totalMonthIndex % 12) + 12) % 12) + 1;
    grids.push(buildMonthGrid(year, month, options.firstDayOfWeek, options.events));
  }
  return grids;
}

export { isoWeekNumber, isLeapYear };

export function calendarEventsToCsv(events: CalendarEvent[]): string {
  return buildCsv(
    ["Fecha", "Descripción", "Festivo"],
    events.map((e) => [`${e.year}-${String(e.month).padStart(2, "0")}-${String(e.day).padStart(2, "0")}`, e.label, e.isHoliday ? "sí" : "no"])
  );
}

export interface CalendarValidation {
  errors: string[];
  warnings: string[];
}

export function validateCalendarOptions(options: CalendarOptions): CalendarValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (options.year < DOCUMENT_LIMITS.calendar.minYear || options.year > DOCUMENT_LIMITS.calendar.maxYear) errors.push("El año está fuera de rango.");
  if (options.month < 1 || options.month > 12) errors.push("El mes no es válido.");
  if (options.events.length > DOCUMENT_LIMITS.calendar.maxEvents) errors.push(`Demasiados eventos (máximo ${DOCUMENT_LIMITS.calendar.maxEvents}).`);
  if (options.mode === "multi-month" && (options.monthCount < 1 || options.monthCount > DOCUMENT_LIMITS.calendar.maxMonthsInRange)) {
    warnings.push(`La cantidad de meses se ajustará al rango permitido (1-${DOCUMENT_LIMITS.calendar.maxMonthsInRange}).`);
  }
  if (options.mode === "school") {
    if (compareCalendarDates(options.schoolEndDate, options.schoolStartDate) < 0) errors.push("La fecha final del calendario escolar debe ser posterior a la fecha inicial.");
    for (const period of options.periods) {
      if (compareCalendarDates(period.endDate, period.startDate) < 0) errors.push(`El periodo "${period.label || "sin nombre"}" tiene una fecha de fin anterior al inicio.`);
    }
    for (const brk of options.breaks) {
      if (compareCalendarDates(brk.endDate, brk.startDate) < 0) errors.push(`El descanso "${brk.label || "sin nombre"}" tiene una fecha de fin anterior al inicio.`);
    }
  }
  return { errors, warnings };
}
