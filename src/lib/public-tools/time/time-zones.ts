/**
 * Real IANA timezone conversion via `Intl` — never a fixed offset table, so
 * DST transitions and historical/future rule changes are handled correctly
 * by the browser's own tz database (spec section 14: "no uses offsets fijos
 * para representar zonas IANA... utiliza las capacidades locales de Intl").
 */
export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0=Sunday..6=Saturday
  offsetMinutes: number;
  abbreviation: string;
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Reads the real local wall-clock time (and real UTC offset for that instant) for `timeZone` at absolute instant `date`. */
export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const parts = dtf.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0; // some ICU builds report midnight as "24" with hourCycle h23
  const minute = Number(get("minute"));
  const weekday = WEEKDAY_INDEX[get("weekday")] ?? 0;

  const asUtcMs = Date.UTC(year, month - 1, day, hour, minute);
  const offsetMinutes = Math.round((asUtcMs - date.getTime()) / 60000);

  const offsetFormatter = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" });
  const offsetPart = offsetFormatter.formatToParts(date).find((p) => p.type === "timeZoneName")?.value ?? "";

  return { year, month, day, hour, minute, weekday, offsetMinutes, abbreviation: offsetPart };
}

/**
 * Converts a wall-clock local time in an arbitrary IANA zone to the real
 * absolute UTC instant, by iteratively correcting an initial UTC guess
 * against what that guess actually reads as in the target zone (handles
 * DST and non-hour offsets like India/Nepal without a manual offset table).
 */
export function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  for (let i = 0; i < 3; i++) {
    const parts = getZonedParts(guess, timeZone);
    const observedMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    const targetMs = Date.UTC(year, month - 1, day, hour, minute);
    const deltaMs = targetMs - observedMs;
    if (deltaMs === 0) break;
    guess = new Date(guess.getTime() + deltaMs);
  }
  return guess;
}
