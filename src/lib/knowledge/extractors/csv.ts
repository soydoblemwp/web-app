import type { ExtractedBlock, ExtractionResult } from "@/lib/knowledge/types";

const MAX_COLUMNS = 40;
const MAX_ROWS = 5000;
const MAX_CELL_CHARS = 400;

/** RFC-4180-ish CSV row parser (quoted fields, escaped quotes, CRLF/LF) — no dependency needed for this. */
function parseCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += char;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

/** CSV — real parsing with header detection, per-row readable representation, and honest truncation warnings (spec section 10). */
export function extractCsv(text: string): ExtractionResult {
  const rawRows = parseCsvRows(text);
  if (rawRows.length === 0) {
    return { ok: true, text: "", blocks: [], warnings: ["El archivo CSV está vacío."], quality: "NONE", method: "csv", metadata: { rowCount: 0 } };
  }

  const warnings: string[] = [];
  let headers = rawRows[0].map((h) => h.trim() || "columna");
  if (headers.length > MAX_COLUMNS) {
    warnings.push(`Se truncaron las columnas a las primeras ${MAX_COLUMNS} (el archivo tenía ${headers.length}).`);
    headers = headers.slice(0, MAX_COLUMNS);
  }

  let dataRows = rawRows.slice(1);
  if (dataRows.length > MAX_ROWS) {
    warnings.push(`Se truncaron las filas a las primeras ${MAX_ROWS} (el archivo tenía ${dataRows.length}).`);
    dataRows = dataRows.slice(0, MAX_ROWS);
  }

  const blocks: ExtractedBlock[] = dataRows.map((cells, index) => {
    const pairs = headers.map((header, colIndex) => {
      const raw = (cells[colIndex] ?? "").trim();
      const value = raw.length > MAX_CELL_CHARS ? `${raw.slice(0, MAX_CELL_CHARS)}…` : raw;
      return `${header}: ${value || "(vacío)"}`;
    });
    return { kind: "table_row" as const, text: pairs.join(" | "), rowIndex: index + 1 };
  });

  return {
    ok: true,
    text: blocks.map((b) => b.text).join("\n"),
    blocks,
    warnings,
    quality: blocks.length > 0 ? "HIGH" : "NONE",
    method: "csv",
    metadata: { rowCount: dataRows.length, columnCount: headers.length },
  };
}
