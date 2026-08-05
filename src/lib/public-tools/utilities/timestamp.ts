export type UnixUnit = "seconds" | "milliseconds";

export interface UnitDetection {
  suggested: UnixUnit;
  ambiguous: boolean;
  reason: string;
}

// A value of ~1e10 in seconds is already year ~2286; in milliseconds it's 1970-04. Real-world
// timestamps people paste are almost always either 10-digit seconds or 13-digit milliseconds, so
// the boundary is set where a "seconds" interpretation would already be an implausibly far future
// date — anything under that boundary is far more likely to be seconds.
const SECONDS_VS_MS_BOUNDARY = 1e11;

/** Never silently picks a unit — returns a suggestion plus an explicit reason, and the caller always shows both interpretations and lets the visitor override (spec section 17). */
export function detectUnixUnit(value: number): UnitDetection {
  const magnitude = Math.abs(value);
  if (magnitude < SECONDS_VS_MS_BOUNDARY) {
    return { suggested: "seconds", ambiguous: magnitude > 1e9, reason: "El valor es compatible con segundos Unix (una fecha razonable entre 1970 y aproximadamente el año 5138)." };
  }
  return { suggested: "milliseconds", ambiguous: false, reason: "El valor es demasiado grande para ser segundos Unix dentro de un rango de fechas razonable; se interpreta como milisegundos." };
}

export interface UnixToDateResult {
  ok: boolean;
  date?: Date;
  error?: string;
}

export function unixToDate(value: number, unit: UnixUnit): UnixToDateResult {
  if (!Number.isFinite(value)) return { ok: false, error: "El valor no es un número válido." };
  const ms = unit === "seconds" ? value * 1000 : value;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return { ok: false, error: "El valor produce una fecha fuera del rango representable." };
  return { ok: true, date };
}

export function dateToUnix(date: Date): { seconds: number; milliseconds: number } | null {
  const ms = date.getTime();
  if (Number.isNaN(ms)) return null;
  return { seconds: Math.floor(ms / 1000), milliseconds: ms };
}

export interface TimeZoneValidation {
  ok: boolean;
  error?: string;
}

/** Validates an IANA zone name by attempting to construct a formatter with it — Intl throws RangeError for an unknown zone, which is the only reliable cross-engine check without a hardcoded zone list. */
export function validateTimeZone(timeZone: string): TimeZoneValidation {
  try {
    new Intl.DateTimeFormat("es-ES", { timeZone });
    return { ok: true };
  } catch {
    return { ok: false, error: `"${timeZone}" no es una zona horaria IANA reconocida por este navegador.` };
  }
}

export interface FormattedTimestamp {
  iso: string;
  utc: string;
  local: string;
  inZone: string | null;
  dayOfWeek: string;
  timestampSeconds: number;
  timestampMilliseconds: number;
}

export function formatTimestamp(date: Date, targetZone: string | null): FormattedTimestamp {
  const utcFormatter = new Intl.DateTimeFormat("es-ES", { dateStyle: "full", timeStyle: "long", timeZone: "UTC" });
  const localFormatter = new Intl.DateTimeFormat("es-ES", { dateStyle: "full", timeStyle: "long" });
  const dayOfWeekFormatter = new Intl.DateTimeFormat("es-ES", { weekday: "long", timeZone: "UTC" });

  let inZone: string | null = null;
  if (targetZone && validateTimeZone(targetZone).ok) {
    inZone = new Intl.DateTimeFormat("es-ES", { dateStyle: "full", timeStyle: "long", timeZone: targetZone }).format(date);
  }

  return {
    iso: date.toISOString(),
    utc: utcFormatter.format(date),
    local: localFormatter.format(date),
    inZone,
    dayOfWeek: dayOfWeekFormatter.format(date),
    timestampSeconds: Math.floor(date.getTime() / 1000),
    timestampMilliseconds: date.getTime(),
  };
}

export function describeDiffFromNow(date: Date, now: Date = new Date()): string {
  const diffMs = date.getTime() - now.getTime();
  const isFuture = diffMs >= 0;
  const absSeconds = Math.abs(diffMs) / 1000;

  const units: [string, number][] = [
    ["años", 60 * 60 * 24 * 365.25],
    ["días", 60 * 60 * 24],
    ["horas", 60 * 60],
    ["minutos", 60],
    ["segundos", 1],
  ];
  for (const [unit, unitSeconds] of units) {
    if (absSeconds >= unitSeconds || unit === "segundos") {
      const value = Math.floor(absSeconds / unitSeconds);
      if (value === 0 && unit !== "segundos") continue;
      return isFuture ? `dentro de ${value} ${unit}` : `hace ${value} ${unit}`;
    }
  }
  return "ahora mismo";
}
