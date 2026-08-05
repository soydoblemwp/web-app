import type { RecurrenceFrequency } from "@/generated/prisma/enums";

export interface RecurrenceConfig {
  frequency: RecurrenceFrequency;
  /** Used only for SPECIFIC_DAYS — e.g. ["MON", "WED", "FRI"]. */
  daysOfWeek: string[];
  /** Used only for CUSTOM_INTERVAL. */
  intervalDays: number | null;
  startDate: Date;
  endDate: Date | null;
}

const WEEKDAY_CODES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const DEFAULT_MAX_INSTANCES = 52;

/**
 * Pure, deterministic generator — the ONLY place recurring instance dates
 * are computed, so both "create the series" and "extend an existing series"
 * (spec: "no dupliques publicaciones existentes al editar una serie") share
 * the exact same math. Callers are responsible for de-duplicating against
 * dates that already have a SocialPost (see
 * generateRecurrencePostsAction in src/server/actions/publishing.ts).
 */
export function generateRecurrenceInstances(config: RecurrenceConfig, maxInstances = DEFAULT_MAX_INSTANCES): Date[] {
  const dates: Date[] = [];
  const cursor = new Date(config.startDate);

  const withinRange = (d: Date) => !config.endDate || d.getTime() <= config.endDate.getTime();

  if (config.frequency === "SPECIFIC_DAYS") {
    if (config.daysOfWeek.length === 0) return [];
    const targetCodes = new Set(config.daysOfWeek.map((d) => d.toUpperCase()));
    let probe = new Date(cursor);
    let guard = 0;
    while (dates.length < maxInstances && withinRange(probe) && guard < maxInstances * 14) {
      if (targetCodes.has(WEEKDAY_CODES[probe.getDay()])) {
        dates.push(new Date(probe));
      }
      probe = addDays(probe, 1);
      guard += 1;
    }
    return dates;
  }

  let next = new Date(cursor);
  while (dates.length < maxInstances && withinRange(next)) {
    dates.push(new Date(next));
    switch (config.frequency) {
      case "DAILY":
        next = addDays(next, 1);
        break;
      case "WEEKLY":
        next = addDays(next, 7);
        break;
      case "MONTHLY":
        next = addMonths(next, 1);
        break;
      case "CUSTOM_INTERVAL":
        next = addDays(next, Math.max(1, config.intervalDays ?? 1));
        break;
      default:
        return dates;
    }
  }
  return dates;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}
