import type { CalendarDate } from "@/lib/public-tools/utilities/dates";
import { calendarDateToEpochDay, epochDayToCalendarDate, compareCalendarDates } from "@/lib/public-tools/utilities/dates";

/**
 * All date math here goes through `calendarDateToEpochDay`/`epochDayToCalendarDate`
 * (plain calendar arithmetic, never `new Date(isoString)` reparsing) so results never
 * shift by a day due to timezone conversion (spec section 13).
 */
export interface BusinessDayOptions {
  /** JS day-of-week values (0=Sunday..6=Saturday) treated as weekend — configurable, never hardcoded to Sat/Sun for every locale (spec section 13). */
  weekendDays: number[];
  holidays: CalendarDate[];
}

function jsWeekday(date: CalendarDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

function isHoliday(date: CalendarDate, holidays: CalendarDate[]): boolean {
  return holidays.some((h) => h.year === date.year && h.month === date.month && h.day === date.day);
}

export function isBusinessDay(date: CalendarDate, options: BusinessDayOptions): boolean {
  return !options.weekendDays.includes(jsWeekday(date)) && !isHoliday(date, options.holidays);
}

export interface CountBusinessDaysResult {
  totalDays: number;
  businessDays: number;
  weekendDays: number;
  holidaysExcluded: number;
  excludedDates: CalendarDate[];
}

export function countBusinessDays(start: CalendarDate, end: CalendarDate, includeStart: boolean, includeEnd: boolean, options: BusinessDayOptions): CountBusinessDaysResult {
  const startEpoch = calendarDateToEpochDay(start);
  const endEpoch = calendarDateToEpochDay(end);
  const [lowEpoch, highEpoch] = startEpoch <= endEpoch ? [startEpoch, endEpoch] : [endEpoch, startEpoch];

  let totalDays = 0;
  let businessDays = 0;
  let weekendCount = 0;
  let holidayCount = 0;
  const excludedDates: CalendarDate[] = [];

  for (let epoch = lowEpoch; epoch <= highEpoch; epoch++) {
    const isStartDay = epoch === startEpoch;
    const isEndDay = epoch === endEpoch;
    if (isStartDay && !includeStart) continue;
    if (isEndDay && !includeEnd) continue;

    totalDays++;
    const date = epochDayToCalendarDate(epoch);
    const weekend = options.weekendDays.includes(jsWeekday(date));
    const holiday = isHoliday(date, options.holidays);
    if (weekend) weekendCount++;
    if (holiday && !weekend) holidayCount++; // don't double-count a holiday that also falls on a weekend
    if (weekend || holiday) excludedDates.push(date);
    else businessDays++;
  }

  return { totalDays, businessDays, weekendDays: weekendCount, holidaysExcluded: holidayCount, excludedDates };
}

export interface AddBusinessDaysResult {
  resultDate: CalendarDate;
  naturalDaysElapsed: number;
  weekendsSkipped: number;
  holidaysSkipped: number;
}

export function addBusinessDays(start: CalendarDate, count: number, direction: 1 | -1, options: BusinessDayOptions): AddBusinessDaysResult {
  let epoch = calendarDateToEpochDay(start);
  let remaining = Math.abs(count);
  let weekendsSkipped = 0;
  let holidaysSkipped = 0;
  const startEpoch = epoch;

  while (remaining > 0) {
    epoch += direction;
    const date = epochDayToCalendarDate(epoch);
    const weekend = options.weekendDays.includes(jsWeekday(date));
    const holiday = isHoliday(date, options.holidays);
    if (weekend) weekendsSkipped++;
    else if (holiday) holidaysSkipped++;
    else remaining--;
  }

  return {
    resultDate: epochDayToCalendarDate(epoch),
    naturalDaysElapsed: Math.abs(epoch - startEpoch),
    weekendsSkipped,
    holidaysSkipped,
  };
}

/** Dedupes a pasted/imported holiday list, ignoring order and exact duplicates. */
export function dedupeHolidays(holidays: CalendarDate[]): CalendarDate[] {
  const seen = new Set<string>();
  const result: CalendarDate[] = [];
  for (const h of holidays) {
    const key = `${h.year}-${h.month}-${h.day}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(h);
    }
  }
  return result.sort(compareCalendarDates);
}
