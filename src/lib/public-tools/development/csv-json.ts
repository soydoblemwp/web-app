import { parseCsv, serializeCsv, neutralizeCsvCell, detectDelimiter } from "@/lib/performance/csv";

export { detectDelimiter };

const LIMITS = { maxRows: 20_000, maxColumns: 200, maxCellLength: 20_000, maxJsonDepth: 50 };

export interface CsvToJsonOptions {
  delimiter: string;
  hasHeaders: boolean;
  trimCells: boolean;
  inferTypes: boolean;
  jsonShape: "array-of-objects" | "array-of-arrays";
  nullForEmpty: boolean;
}

export interface ConversionFinding {
  severity: "ERROR" | "WARNING";
  message: string;
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function inferValue(raw: string, infer: boolean, nullForEmpty: boolean): unknown {
  if (raw === "" && nullForEmpty) return null;
  if (!infer) return raw;
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw !== "" && !Number.isNaN(Number(raw)) && /^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

export interface CsvToJsonResult {
  ok: boolean;
  findings: ConversionFinding[];
  value?: unknown;
  json?: string;
  rowCount: number;
  columnCount: number;
}

/**
 * CSV -> JSON, built on the shared parser already used by Performance
 * Center (`src/lib/performance/csv.ts`) — never a second hand-rolled CSV
 * tokenizer (spec section 19: "no crees otro parser si existe uno que
 * soporte correctamente..."). Type inference is off unless explicitly
 * requested, matching the spec's "desactivada por defecto".
 */
export function convertCsvToJson(rawText: string, options: CsvToJsonOptions): CsvToJsonResult {
  const findings: ConversionFinding[] = [];
  const text = stripBom(rawText);
  const { headers, rows } = parseCsv(text, options.delimiter);

  if (rows.length > LIMITS.maxRows) {
    return { ok: false, findings: [{ severity: "ERROR", message: `El CSV supera el límite de ${LIMITS.maxRows.toLocaleString("es-ES")} filas.` }], rowCount: rows.length, columnCount: headers.length };
  }
  if (headers.length > LIMITS.maxColumns) {
    return { ok: false, findings: [{ severity: "ERROR", message: `El CSV supera el límite de ${LIMITS.maxColumns} columnas.` }], rowCount: rows.length, columnCount: headers.length };
  }

  const effectiveHeaders = options.hasHeaders ? headers : headers.map((_, i) => `columna_${i + 1}`);
  const dataRows = options.hasHeaders ? rows : [headers, ...rows];

  const process = (cell: string) => {
    const value = options.trimCells ? cell.trim() : cell;
    if (value.length > LIMITS.maxCellLength) findings.push({ severity: "WARNING", message: "Una celda supera la longitud máxima y fue truncada." });
    return value.slice(0, LIMITS.maxCellLength);
  };

  let value: unknown;
  if (options.jsonShape === "array-of-arrays") {
    value = dataRows.map((row) => row.map((cell) => inferValue(process(cell), options.inferTypes, options.nullForEmpty)));
  } else {
    // Object.fromEntries defines properties directly rather than via bracket assignment, so a header
    // literally named "__proto__" becomes a safe own property instead of reassigning the prototype.
    value = dataRows.map((row) => Object.fromEntries(effectiveHeaders.map((header, colIndex) => [header, inferValue(process(row[colIndex] ?? ""), options.inferTypes, options.nullForEmpty)])));
  }

  return { ok: true, findings, value, json: JSON.stringify(value, null, 2), rowCount: dataRows.length, columnCount: effectiveHeaders.length };
}

export interface JsonToCsvOptions {
  delimiter: string;
  flattenObjects: boolean;
  arrayJoinStrategy: "json" | "semicolon";
}

function flattenObject(obj: Record<string, unknown>, prefix = ""): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value as Record<string, unknown>, path));
    } else {
      result[path] = value;
    }
  }
  return result;
}

function stringifyCell(value: unknown, options: JsonToCsvOptions): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return options.arrayJoinStrategy === "json" ? JSON.stringify(value) : value.map((v) => String(v)).join(";");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export interface JsonToCsvResult {
  ok: boolean;
  findings: ConversionFinding[];
  csv?: string;
  rowCount: number;
  columnCount: number;
}

/** JSON -> CSV. Reuses `serializeCsv`/`neutralizeCsvCell` from the shared core, so exported files get the same formula-injection protection as every other CSV export in this app. */
export function convertJsonToCsv(rawJson: string, options: JsonToCsvOptions): JsonToCsvResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    return { ok: false, findings: [{ severity: "ERROR", message: err instanceof Error ? err.message : "JSON inválido." }], rowCount: 0, columnCount: 0 };
  }

  const array = Array.isArray(parsed) ? parsed : [parsed];
  if (array.length > LIMITS.maxRows) {
    return { ok: false, findings: [{ severity: "ERROR", message: `El JSON supera el límite de ${LIMITS.maxRows.toLocaleString("es-ES")} filas.` }], rowCount: array.length, columnCount: 0 };
  }
  if (!array.every((item) => item !== null && typeof item === "object" && !Array.isArray(item))) {
    return { ok: false, findings: [{ severity: "ERROR", message: "El JSON debe ser un array de objetos (o un único objeto) para convertirse a CSV." }], rowCount: array.length, columnCount: 0 };
  }

  const objects = (array as Record<string, unknown>[]).map((obj) => (options.flattenObjects ? flattenObject(obj) : obj));
  const headerSet = new Set<string>();
  for (const obj of objects) for (const key of Object.keys(obj)) headerSet.add(key);
  const headers = Array.from(headerSet);

  if (headers.length > LIMITS.maxColumns) {
    return { ok: false, findings: [{ severity: "ERROR", message: `El resultado supera el límite de ${LIMITS.maxColumns} columnas.` }], rowCount: objects.length, columnCount: headers.length };
  }

  const rows = objects.map((obj) => headers.map((h) => neutralizeCsvCell(stringifyCell(obj[h], options))));
  const csv = serializeCsv(headers, rows, options.delimiter);
  return { ok: true, findings: [], csv, rowCount: objects.length, columnCount: headers.length };
}
