/**
 * Standard 5-field Unix cron only: `minuto hora día-del-mes mes
 * día-de-la-semana`. Deliberately does NOT parse Quartz/AWS/GitHub Actions
 * extensions (`L`, `W`, `#`, `?`) — those are silently misinterpreted by a
 * generic 5-field parser if allowed through, which is worse than refusing
 * them outright (spec section 21: "no mezcles silenciosamente sintaxis").
 * No existing cron parser dependency was found in this project
 * (`cron-parser` is not installed) and the supported grammar is small and
 * well-defined, so this is a small hand-written parser rather than a new
 * dependency for five integer-range fields.
 */

export interface CronField {
  raw: string;
  values: number[];
}

export interface ParsedCron {
  minute: CronField;
  hour: CronField;
  dayOfMonth: CronField;
  month: CronField;
  dayOfWeek: CronField;
}

export interface CronParseResult {
  ok: boolean;
  cron?: ParsedCron;
  error?: string;
}

const FIELD_RANGES: Record<"minute" | "hour" | "dayOfMonth" | "month" | "dayOfWeek", [number, number]> = {
  minute: [0, 59],
  hour: [0, 23],
  dayOfMonth: [1, 31],
  month: [1, 12],
  dayOfWeek: [0, 7],
};

const UNSUPPORTED_TOKENS = /[LW#?]/;

const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function resolveNamedToken(token: string, kind: keyof typeof FIELD_RANGES): string {
  const lower = token.toLowerCase();
  if (kind === "month") {
    const index = MONTH_NAMES.indexOf(lower);
    if (index !== -1) return String(index + 1);
  }
  if (kind === "dayOfWeek") {
    const index = DAY_NAMES.indexOf(lower);
    if (index !== -1) return String(index);
  }
  return token;
}

function parseField(raw: string, kind: keyof typeof FIELD_RANGES): { ok: boolean; field?: CronField; error?: string } {
  if (UNSUPPORTED_TOKENS.test(raw)) {
    return { ok: false, error: `El campo "${raw}" usa una sintaxis no soportada (L, W, # y ? pertenecen a otros planificadores, no al cron estándar de 5 campos).` };
  }

  const [min, max] = FIELD_RANGES[kind];
  const values = new Set<number>();

  for (const part of raw.split(",")) {
    const stepMatch = /^([^/]+)\/(\d+)$/.exec(part);
    const stepStr = stepMatch ? stepMatch[2] : null;
    const base = stepMatch ? stepMatch[1] : part;
    const step = stepStr ? Number(stepStr) : 1;
    if (step <= 0) return { ok: false, error: `El paso en "${part}" debe ser un número positivo.` };

    let rangeStart = min;
    let rangeEnd = max;
    if (base !== "*") {
      const rangeMatch = /^(\w+)-(\w+)$/.exec(base);
      if (rangeMatch) {
        const startResolved = resolveNamedToken(rangeMatch[1], kind);
        const endResolved = resolveNamedToken(rangeMatch[2], kind);
        if (!/^\d+$/.test(startResolved) || !/^\d+$/.test(endResolved)) return { ok: false, error: `Rango inválido: "${part}".` };
        rangeStart = Number(startResolved);
        rangeEnd = Number(endResolved);
      } else {
        const resolved = resolveNamedToken(base, kind);
        if (!/^\d+$/.test(resolved)) return { ok: false, error: `Valor inválido: "${part}".` };
        rangeStart = Number(resolved);
        rangeEnd = Number(resolved);
      }
    }

    if (rangeStart < min || rangeEnd > max || rangeStart > rangeEnd) {
      return { ok: false, error: `El valor "${part}" está fuera del rango permitido (${min}-${max}).` };
    }
    for (let v = rangeStart; v <= rangeEnd; v += step) values.add(v === 7 && kind === "dayOfWeek" ? 0 : v);
  }

  return { ok: true, field: { raw, values: Array.from(values).sort((a, b) => a - b) } };
}

export function parseCronExpression(expression: string): CronParseResult {
  const trimmed = expression.trim().replace(/\s+/g, " ");
  if (!trimmed) return { ok: false, error: "La expresión no puede estar vacía." };
  const parts = trimmed.split(" ");
  if (parts.length !== 5) return { ok: false, error: `Se esperaban 5 campos (minuto hora día-del-mes mes día-de-la-semana) y se encontraron ${parts.length}.` };

  const [minuteRaw, hourRaw, domRaw, monthRaw, dowRaw] = parts;
  const minute = parseField(minuteRaw, "minute");
  if (!minute.ok) return { ok: false, error: minute.error };
  const hour = parseField(hourRaw, "hour");
  if (!hour.ok) return { ok: false, error: hour.error };
  const dayOfMonth = parseField(domRaw, "dayOfMonth");
  if (!dayOfMonth.ok) return { ok: false, error: dayOfMonth.error };
  const month = parseField(monthRaw, "month");
  if (!month.ok) return { ok: false, error: month.error };
  const dayOfWeek = parseField(dowRaw, "dayOfWeek");
  if (!dayOfWeek.ok) return { ok: false, error: dayOfWeek.error };

  return { ok: true, cron: { minute: minute.field!, hour: hour.field!, dayOfMonth: dayOfMonth.field!, month: month.field!, dayOfWeek: dayOfWeek.field! } };
}

export const CRON_PRESETS: { name: string; expression: string }[] = [
  { name: "Cada minuto", expression: "* * * * *" },
  { name: "Cada 5 minutos", expression: "*/5 * * * *" },
  { name: "Cada hora", expression: "0 * * * *" },
  { name: "Diariamente a medianoche", expression: "0 0 * * *" },
  { name: "Días laborables a las 9:00", expression: "0 9 * * 1-5" },
  { name: "Semanalmente (domingo a medianoche)", expression: "0 0 * * 0" },
  { name: "Mensualmente (día 1)", expression: "0 0 1 * *" },
  { name: "Cada 15 minutos en horario laboral", expression: "*/15 9-17 * * 1-5" },
];

function describeField(field: CronField, singular: string, plural: string, formatter?: (n: number) => string): string {
  if (field.raw === "*") return `todos los ${plural}`;
  const format = formatter ?? ((n: number) => String(n));
  if (field.values.length === 1) return `${singular} ${format(field.values[0])}`;
  return `${plural} ${field.values.map(format).join(", ")}`;
}

const DAY_LABELS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTH_LABELS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function explainCron(cron: ParsedCron): string {
  const parts: string[] = [];

  if (cron.minute.raw === "*" && cron.hour.raw === "*") {
    parts.push("Cada minuto");
  } else if (cron.minute.values.length === 1 && cron.hour.values.length === 1) {
    parts.push(`A las ${String(cron.hour.values[0]).padStart(2, "0")}:${String(cron.minute.values[0]).padStart(2, "0")}`);
  } else {
    parts.push(`En los minutos ${describeField(cron.minute, "", "", (n) => String(n))} de las horas ${describeField(cron.hour, "", "", (n) => String(n))}`);
  }

  if (cron.dayOfMonth.raw !== "*") parts.push(`el día ${cron.dayOfMonth.values.join(", ")} del mes`);
  if (cron.month.raw !== "*") parts.push(`en ${cron.month.values.map((m) => MONTH_LABELS[m - 1]).join(", ")}`);
  if (cron.dayOfWeek.raw !== "*") parts.push(`los ${cron.dayOfWeek.values.map((d) => DAY_LABELS[d]).join(", ")}`);

  return parts.join(", ") + ".";
}

function extractDateParts(date: Date, timeZone: string): { minute: number; hour: number; day: number; month: number; weekday: number } {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", minute: "numeric", hour: "numeric", day: "numeric", month: "numeric", weekday: "short" });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { minute: Number(parts.minute), hour: Number(parts.hour === "24" ? "0" : parts.hour), day: Number(parts.day), month: Number(parts.month), weekday: weekdayMap[parts.weekday] ?? 0 };
}

export interface NextExecutionsResult {
  dates: Date[];
  limitedBySteps: boolean;
  limitedByTime: boolean;
}

const MAX_MINUTE_STEPS = 600_000; // covers a full year of minute-granularity search plus margin
const MAX_WALL_CLOCK_MS = 200;

/**
 * Walks forward minute-by-minute from `fromDate`, evaluating each
 * candidate's calendar fields AS OBSERVED IN `timeZone` via `Intl` (so DST
 * transitions are handled the same way a real system clock in that zone
 * would show them) — capped by both an iteration count and a wall-clock
 * budget so an impossible combination (e.g. day 31 in February forever)
 * can't hang the tab (spec section 21: "limitar búsqueda; cancelar
 * cálculos extremos").
 */
export function computeNextExecutions(cron: ParsedCron, count: number, timeZone: string, fromDate: Date = new Date()): NextExecutionsResult {
  const dates: Date[] = [];
  const start = performance.now();
  let limitedBySteps = false;
  let limitedByTime = false;

  const candidate = new Date(fromDate.getTime());
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);

  for (let step = 0; step < MAX_MINUTE_STEPS; step++) {
    if (dates.length >= count) break;
    if (step % 1000 === 0 && performance.now() - start > MAX_WALL_CLOCK_MS) {
      limitedByTime = true;
      break;
    }

    const { minute, hour, day, month, weekday } = extractDateParts(candidate, timeZone);
    const domMatches = cron.dayOfMonth.raw === "*" || cron.dayOfMonth.values.includes(day);
    const dowMatches = cron.dayOfWeek.raw === "*" || cron.dayOfWeek.values.includes(weekday);
    // Standard cron OR-semantics: if BOTH day-of-month and day-of-week are restricted, a date matches if EITHER matches.
    const dayMatches = cron.dayOfMonth.raw === "*" || cron.dayOfWeek.raw === "*" ? domMatches && dowMatches : domMatches || dowMatches;

    if (cron.minute.values.includes(minute) && cron.hour.values.includes(hour) && dayMatches && cron.month.values.includes(month)) {
      dates.push(new Date(candidate.getTime()));
    }
    candidate.setMinutes(candidate.getMinutes() + 1);
    if (step === MAX_MINUTE_STEPS - 1) limitedBySteps = true;
  }

  return { dates, limitedBySteps, limitedByTime };
}
