/**
 * Loose, deterministic number/date parsing for imported CSV/JSON cells
 * (spec section 12: "números con separadores; porcentajes; monedas...
 * fechas diferentes"). Every function here is pure and returns null on
 * anything it can't confidently parse — the import row is then marked
 * INVALID with a safe message, never silently coerced to 0/NaN.
 */

/**
 * Parses a loosely-formatted numeric string: strips whitespace, common
 * currency symbols ($, €, £, ¥) and a trailing "%". When both "," and "."
 * appear, the LAST one is treated as the decimal separator and the other as
 * a thousands separator (handles both "1,234.56" and "1.234,56"). When only
 * "," appears, it is treated as a decimal separator (European convention) —
 * a documented assumption, since "1,234" is genuinely ambiguous without a
 * declared locale.
 */
export function parseLooseNumber(raw: string): number | null {
  if (typeof raw !== "string") return null;
  let s = raw.trim();
  if (s.length === 0) return null;
  s = s.replace(/[$€£¥\s]/g, "");
  const isPercent = s.endsWith("%");
  if (isPercent) s = s.slice(0, -1);

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    s = s.replace(",", ".");
  }

  const value = Number(s);
  if (!Number.isFinite(value)) return null;
  return value;
}

export type DateFormatHint = "YYYY-MM-DD" | "DD/MM/YYYY" | "MM/DD/YYYY" | undefined;

/** Parses a date string according to an explicit format hint, falling back to native ISO/RFC parsing when no hint (or an unrecognized one) is given. Returns null rather than an Invalid Date. */
export function parseDateWithFormat(raw: string, format?: DateFormatHint): Date | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  const trimmed = raw.trim();

  if (format === "DD/MM/YYYY" || format === "MM/DD/YYYY") {
    const parts = trimmed.split(/[/\-.]/).map((p) => p.trim());
    if (parts.length !== 3) return null;
    const [a, b, year] = parts;
    const day = format === "DD/MM/YYYY" ? Number(a) : Number(b);
    const month = format === "DD/MM/YYYY" ? Number(b) : Number(a);
    const yearNum = Number(year.length === 2 ? `20${year}` : year);
    if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(yearNum)) return null;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(Date.UTC(yearNum, month - 1, day));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}
