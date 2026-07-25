/**
 * Pure CSV serialization for analytics exports — no DB, no framework.
 * Escapes every field per RFC 4180 AND neutralizes formula/CSV injection
 * (a cell starting with =, +, -, @, tab, or CR is a known Excel/Sheets
 * formula-execution vector) by prefixing it with a single quote before
 * quoting. Every export in this app must build its CSV through this
 * module — never string-concatenate rows by hand.
 */

const FORMULA_TRIGGER_RE = /^[=+\-@\t\r]/;

/** Escapes one cell: neutralizes formula injection, then RFC 4180-quotes if needed. */
export function csvEscapeCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (FORMULA_TRIGGER_RE.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Builds a full CSV document (header + rows) from column definitions and plain row objects — never trusts pre-built strings for cell content. */
export function buildCsv<T>(columns: { key: keyof T; header: string }[], rows: T[]): string {
  const headerLine = columns.map((c) => csvEscapeCell(c.header)).join(",");
  const lines = rows.map((row) => columns.map((c) => csvEscapeCell(row[c.key])).join(","));
  return [headerLine, ...lines].join("\r\n") + "\r\n";
}

const SAFE_FILENAME_RE = /[^a-zA-Z0-9_-]+/g;

/** A CSV filename built only from already-validated, enum-shaped inputs (export type, ISO date bounds) — never from free-form user text, so this is a formatting step, not a sanitization boundary by itself. */
export function buildCsvFilename(exportType: string, from: Date, to: Date): string {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const safeType = exportType.replace(SAFE_FILENAME_RE, "-");
  return `workflow-analytics-${safeType}-${iso(from)}-${iso(to)}.csv`;
}
