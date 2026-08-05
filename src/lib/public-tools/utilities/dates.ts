/**
 * All functions here operate on plain {year, month, day} calendar
 * components (month is 1-12) rather than JS `Date` objects with a time
 * component — this avoids the classic bug where `new Date("2026-07-29")`
 * (parsed as UTC midnight) then gets re-displayed in a negative-UTC-offset
 * local timezone and silently shows the previous day (spec section 20:
 * "entradas solo de fecha sin desplazamiento accidental de día"). Callers
 * reading an `<input type="date">` value must split "YYYY-MM-DD" into its
 * components directly instead of passing the string to `new Date()`.
 */
export interface CalendarDate {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

const MONTH_NAMES_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const WEEKDAY_NAMES_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  // Date.UTC(year, month, 0) is "day 0 of `month`" = the last day of the previous (0-based) month,
  // so passing the 1-based `month` here correctly yields the day count of that same month.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isValidCalendarDate(date: CalendarDate): boolean {
  if (date.year < 1 || date.year > 9999) return false;
  if (date.month < 1 || date.month > 12) return false;
  if (date.day < 1 || date.day > daysInMonth(date.year, date.month)) return false;
  return true;
}

function toEpochDay(date: CalendarDate): number {
  return Math.floor(Date.UTC(date.year, date.month - 1, date.day) / 86400000);
}

/** Exported for other cores (e.g. business-days.ts) that need a day-count basis without re-deriving their own epoch conversion. */
export function calendarDateToEpochDay(date: CalendarDate): number {
  return toEpochDay(date);
}

/** Inverse of calendarDateToEpochDay — converts a day count back to a calendar date. */
export function epochDayToCalendarDate(epochDay: number): CalendarDate {
  const d = new Date(epochDay * 86400000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function compareCalendarDates(a: CalendarDate, b: CalendarDate): number {
  return toEpochDay(a) - toEpochDay(b);
}

export function weekdayOf(date: CalendarDate): string {
  return WEEKDAY_NAMES_ES[weekdayIndexOf(date)];
}

/** Numeric weekday (0 = Sunday .. 6 = Saturday) — exported for grid-positioning callers (e.g. a printable calendar) that need the index rather than `weekdayOf`'s localized name. */
export function weekdayIndexOf(date: CalendarDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

export function monthNameOf(month: number): string {
  return MONTH_NAMES_ES[month - 1] ?? "";
}

/** Clamps day-of-month when moving to a shorter month (e.g. Jan 31 + 1 month → Feb 28/29, never Mar 3). */
function clampDay(year: number, month: number, day: number): number {
  return Math.min(day, daysInMonth(year, month));
}

export function addCalendarTime(date: CalendarDate, delta: { years?: number; months?: number; days?: number }): CalendarDate {
  let year = date.year + (delta.years ?? 0);
  let monthIndex = date.month - 1 + (delta.months ?? 0);
  year += Math.floor(monthIndex / 12);
  monthIndex = ((monthIndex % 12) + 12) % 12;
  const month = monthIndex + 1;
  const day = clampDay(year, month, date.day);

  if (delta.days) {
    const epoch = toEpochDay({ year, month, day }) + delta.days;
    const d = new Date(epoch * 86400000);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  }
  return { year, month, day };
}

export interface CalendarDiff {
  years: number;
  months: number;
  days: number;
  totalDays: number;
  totalWeeks: number;
  totalMonths: number;
  negative: boolean;
}

/**
 * Real calendar-based difference (years/months/days), never a naive
 * milliseconds-÷-365 approximation (spec section 20: "no calcules edad
 * únicamente dividiendo milisegundos entre 365 días"). Correctly handles
 * months of different lengths and leap years because it walks whole
 * calendar units, borrowing from the next-larger unit exactly like manual
 * date-difference arithmetic.
 */
export function calendarDiff(from: CalendarDate, to: CalendarDate): CalendarDiff {
  const negative = compareCalendarDates(to, from) < 0;
  const [start, end] = negative ? [to, from] : [from, to];

  // Naive month subtraction can overshoot when `start.day` doesn't fit in the
  // resulting month (e.g. Jan 31 -> Mar 1: subtracting months naively then
  // "borrowing" a single previous month's day count can still leave a
  // negative remainder when start.day exceeds that month's length, as with
  // Jan 31 borrowing from a 29-day February). Instead, find the largest
  // whole-month count whose clamped landing date (via `addCalendarTime`,
  // the same function used to *apply* a diff) does not overshoot `end` —
  // this guarantees a non-negative day remainder and makes `calendarDiff`
  // and `addCalendarTime` genuine inverses of each other.
  let totalMonths = (end.year - start.year) * 12 + (end.month - start.month);
  let candidate = addCalendarTime(start, { months: totalMonths });
  while (compareCalendarDates(candidate, end) > 0) {
    totalMonths -= 1;
    candidate = addCalendarTime(start, { months: totalMonths });
  }

  const days = toEpochDay(end) - toEpochDay(candidate);
  const years = Math.trunc(totalMonths / 12);
  const months = totalMonths % 12;

  const totalDays = Math.abs(toEpochDay(end) - toEpochDay(start));

  return { years, months, days, totalDays, totalWeeks: Math.floor(totalDays / 7), totalMonths, negative };
}

export type Feb29Policy = "feb28" | "mar1";

export interface AgeResult {
  diff: CalendarDiff;
  birthWeekday: string;
  nextBirthday: CalendarDate;
  daysUntilNextBirthday: number;
  isBirthdayToday: boolean;
}

/**
 * Computes age as of `asOf`. For a Feb 29 birth date in a non-leap
 * observance year, `feb29Policy` decides whether the "effective" birthday
 * is Feb 28 or Mar 1 (spec section 20: both options must be explicitly
 * selectable and explained, not silently chosen).
 */
export function calculateAge(birth: CalendarDate, asOf: CalendarDate, feb29Policy: Feb29Policy = "feb28"): AgeResult {
  const diff = calendarDiff(birth, asOf);
  const birthWeekday = weekdayOf(birth);

  const effectiveBirthdayInYear = (year: number): CalendarDate => {
    if (birth.month === 2 && birth.day === 29 && !isLeapYear(year)) {
      return feb29Policy === "feb28" ? { year, month: 2, day: 28 } : { year, month: 3, day: 1 };
    }
    return { year, month: birth.month, day: birth.day };
  };

  const thisYearBirthday = effectiveBirthdayInYear(asOf.year);
  const isBirthdayToday = compareCalendarDates(thisYearBirthday, asOf) === 0;
  let nextBirthday = thisYearBirthday;
  if (compareCalendarDates(thisYearBirthday, asOf) < 0) {
    nextBirthday = effectiveBirthdayInYear(asOf.year + 1);
  }
  const daysUntilNextBirthday = toEpochDay(nextBirthday) - toEpochDay(asOf);

  return { diff, birthWeekday, nextBirthday, daysUntilNextBirthday, isBirthdayToday };
}

export function todayAsCalendarDate(): CalendarDate {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

export function calendarDateToIso(date: CalendarDate): string {
  return `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

/** Parses an `<input type="date">` value ("YYYY-MM-DD") by splitting the string directly — never via `new Date(value)`, which risks the timezone-shift bug described at the top of this file. */
export function parseIsoDateInput(raw: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  return isValidCalendarDate(date) ? date : null;
}
