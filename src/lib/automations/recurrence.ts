/**
 * Recurring schedule engine (spec section 7) — a safe, structured
 * configuration (never raw cron typed by the user) that generates a
 * human-readable description and computes the next occurrence, correctly
 * across DST transitions, using Node's built-in ICU (Intl) timezone data —
 * no extra dependency needed for real IANA-timezone-aware date math.
 */

export const RECURRENCE_KINDS = ["HOURLY", "DAILY", "WEEKLY_DAYS", "MONTHLY", "CUSTOM_INTERVAL_DAYS"] as const;
export type RecurrenceKind = (typeof RECURRENCE_KINDS)[number];

export interface RecurrenceConfig {
  kind: RecurrenceKind;
  /** DAILY/WEEKLY_DAYS/MONTHLY: local hour (0-23) and minute (0-59) the occurrence fires at. */
  hour?: number;
  minute?: number;
  /** WEEKLY_DAYS only — 0=Sunday..6=Saturday. */
  daysOfWeek?: number[];
  /** MONTHLY only — 1-28 (capped so every month has that day, avoiding the "no Feb 30" ambiguity). */
  dayOfMonth?: number;
  /** CUSTOM_INTERVAL_DAYS only — whole days between occurrences, >= 1. */
  intervalDays?: number;
  timezone: string;
  startDate: string; // YYYY-MM-DD, local to timezone
  endDate?: string | null; // YYYY-MM-DD, local to timezone — inclusive
  maxOccurrences?: number | null;
}

export interface RecurrenceValidationResult {
  valid: boolean;
  error?: string;
}

const WEEKDAY_LABELS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** Converts a local wall-clock date+time in an IANA timezone to the correct UTC instant — DST-safe via a two-pass Intl.DateTimeFormat correction, the standard technique for this without a dedicated TZ library. */
export function zonedWallTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  let guess = Date.UTC(year, month - 1, day, hour, minute);
  for (let i = 0; i < 2; i++) {
    const observed = getZonedParts(new Date(guess), timeZone);
    const observedUtcAtSameWallClock = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute);
    const diff = Date.UTC(year, month - 1, day, hour, minute) - observedUtcAtSameWallClock;
    guess += diff;
  }
  return new Date(guess);
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
}

/** Reads what wall-clock date/time a UTC instant represents in a given IANA timezone. */
export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hour24 = get("hour") === "24" ? 0 : Number(get("hour"));
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: hour24,
    minute: Number(get("minute")),
    weekday: weekdayMap[get("weekday")] ?? 0,
  };
}

export function isValidIanaTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function validateRecurrenceConfig(config: RecurrenceConfig): RecurrenceValidationResult {
  if (!isValidIanaTimezone(config.timezone)) return { valid: false, error: "Zona horaria no válida." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(config.startDate)) return { valid: false, error: "Fecha de inicio no válida." };
  if (config.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(config.endDate)) return { valid: false, error: "Fecha de finalización no válida." };
  if (config.kind === "WEEKLY_DAYS" && (!config.daysOfWeek || config.daysOfWeek.length === 0)) {
    return { valid: false, error: "Selecciona al menos un día de la semana." };
  }
  if (config.kind === "WEEKLY_DAYS" && config.daysOfWeek?.some((d) => d < 0 || d > 6)) {
    return { valid: false, error: "Día de la semana no válido." };
  }
  if (config.kind === "MONTHLY" && (!config.dayOfMonth || config.dayOfMonth < 1 || config.dayOfMonth > 28)) {
    return { valid: false, error: "El día del mes debe estar entre 1 y 28 (para existir en todos los meses)." };
  }
  if (config.kind === "CUSTOM_INTERVAL_DAYS" && (!config.intervalDays || config.intervalDays < 1)) {
    return { valid: false, error: "El intervalo personalizado debe ser de al menos 1 día." };
  }
  if (config.kind !== "HOURLY") {
    const hour = config.hour ?? 0;
    const minute = config.minute ?? 0;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return { valid: false, error: "Hora no válida." };
  }
  if (config.maxOccurrences !== undefined && config.maxOccurrences !== null && config.maxOccurrences < 1) {
    return { valid: false, error: "El número máximo de ejecuciones debe ser al menos 1." };
  }
  return { valid: true };
}

/** Human-readable description — the UI never asks a user to read/write cron/RRULE directly (spec section 7). */
export function describeRecurrence(config: RecurrenceConfig): string {
  const time = config.kind === "HOURLY" ? "" : ` a las ${String(config.hour ?? 0).padStart(2, "0")}:${String(config.minute ?? 0).padStart(2, "0")}`;
  switch (config.kind) {
    case "HOURLY":
      return `Cada hora (${config.timezone})`;
    case "DAILY":
      return `Todos los días${time} (${config.timezone})`;
    case "WEEKLY_DAYS": {
      const days = (config.daysOfWeek ?? []).slice().sort().map((d) => WEEKDAY_LABELS[d]).join(", ");
      return `Cada semana los ${days}${time} (${config.timezone})`;
    }
    case "MONTHLY":
      return `Cada mes el día ${config.dayOfMonth}${time} (${config.timezone})`;
    case "CUSTOM_INTERVAL_DAYS":
      return `Cada ${config.intervalDays} días${time} (${config.timezone})`;
  }
}

function addDaysLocal(year: number, month: number, day: number, days: number): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/**
 * Computes the next occurrence strictly after `after` (a UTC instant),
 * respecting startDate/endDate/maxOccurrences. Reasons entirely in the
 * recurrence's own local wall-clock calendar, converting to UTC only at the
 * very end — the DST-safe approach. Returns null when no more occurrences
 * exist (end date passed, or maxOccurrences reached).
 */
export function computeNextOccurrence(config: RecurrenceConfig, after: Date, occurrenceCount: number): Date | null {
  if (config.maxOccurrences !== undefined && config.maxOccurrences !== null && occurrenceCount >= config.maxOccurrences) return null;

  const [startY, startM, startD] = config.startDate.split("-").map(Number);
  const endParts = config.endDate ? config.endDate.split("-").map(Number) : null;
  const hour = config.kind === "HOURLY" ? 0 : (config.hour ?? 0);
  const minute = config.kind === "HOURLY" ? 0 : (config.minute ?? 0);

  const afterZoned = getZonedParts(after, config.timezone);
  let cursor = { year: Math.max(startY, afterZoned.year), month: startM, day: startD };
  // Start scanning from the later of (recurrence start date) or (the day 'after' falls on) — never before the configured start.
  if (afterZoned.year > startY || (afterZoned.year === startY && (afterZoned.month > startM || (afterZoned.month === startM && afterZoned.day > startD)))) {
    cursor = { year: afterZoned.year, month: afterZoned.month, day: afterZoned.day };
  } else {
    cursor = { year: startY, month: startM, day: startD };
  }

  const MAX_SCAN_DAYS = 370 * 6; // generous ceiling — nothing recurs less than daily-ish in this system, so ~6 years of days is far more than enough to find a match or conclude "never".
  for (let i = 0; i < MAX_SCAN_DAYS; i++) {
    if (endParts) {
      const [endY, endM, endD] = endParts;
      const pastEnd = cursor.year > endY || (cursor.year === endY && (cursor.month > endM || (cursor.month === endM && cursor.day > endD)));
      if (pastEnd) return null;
    }

    const matchesKind =
      config.kind === "HOURLY" ||
      config.kind === "DAILY" ||
      (config.kind === "WEEKLY_DAYS" && (config.daysOfWeek ?? []).includes(getZonedParts(zonedWallTimeToUtc(cursor.year, cursor.month, cursor.day, 12, 0, config.timezone), config.timezone).weekday)) ||
      (config.kind === "MONTHLY" && cursor.day === config.dayOfMonth) ||
      (config.kind === "CUSTOM_INTERVAL_DAYS" && daysBetween(startY, startM, startD, cursor.year, cursor.month, cursor.day) % Math.max(1, config.intervalDays ?? 1) === 0);

    if (matchesKind) {
      if (config.kind === "HOURLY") {
        // Hourly ignores hour/minute config — it's every hour starting from the recurrence's first valid hour on/after `after`.
        const base = zonedWallTimeToUtc(cursor.year, cursor.month, cursor.day, 0, 0, config.timezone);
        for (let h = 0; h < 24; h++) {
          const candidate = new Date(base.getTime() + h * 3600_000);
          if (candidate.getTime() > after.getTime()) return candidate;
        }
      } else {
        const candidate = zonedWallTimeToUtc(cursor.year, cursor.month, cursor.day, hour, minute, config.timezone);
        if (candidate.getTime() > after.getTime()) return candidate;
      }
    }
    cursor = addDaysLocal(cursor.year, cursor.month, cursor.day, 1);
  }
  return null;
}

function daysBetween(y1: number, m1: number, d1: number, y2: number, m2: number, d2: number): number {
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86_400_000);
}
