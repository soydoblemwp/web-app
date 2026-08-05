/**
 * A small, dependency-free, safe CSV parser/serializer (spec sections 12/42
 * /53) — no existing CSV library in this project handles the required
 * cases (custom delimiters, quoted fields, formula-injection neutralization
 * on export) so a minimal one was written here instead of pulling in a
 * dependency for ~100 lines of well-tested logic. Parsing NEVER evaluates
 * anything found in a cell — a cell that looks like a formula is always
 * treated as an inert string.
 */

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

const DANGEROUS_LEADING_CHARS = ["=", "+", "-", "@", "\t", "\r"];

/** Splits raw CSV text into headers + rows, honoring RFC 4180 quoting (quoted fields, escaped "" inside quotes, embedded newlines/delimiters inside quotes). Never executes anything found in a cell. */
export function parseCsv(text: string, delimiter = ","): ParsedCsv {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  while (i < normalized.length) {
    const char = normalized[i];

    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === delimiter) {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      field = "";
      row = [];
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmptyRows = rows.filter((r) => !(r.length === 1 && r[0] === ""));
  const [headerRow, ...dataRows] = nonEmptyRows;
  return { headers: headerRow ?? [], rows: dataRows };
}

/** Best-effort delimiter detection among comma/semicolon/tab from the first line — used only to pre-select the wizard's default, the user can always override it. */
export function detectDelimiter(text: string): "," | ";" | "\t" {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  for (const char of firstLine) {
    if (char in counts) counts[char] += 1;
  }
  const [best] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return (best as "," | ";" | "\t") ?? ",";
}

/** Neutralizes CSV/Excel formula injection (spec section 12: "neutraliza fórmulas peligrosas al exportar nuevamente") — a cell starting with =, +, -, @ (or a tab/CR, which some parsers treat as a formula prefix too) gets a leading apostrophe so spreadsheet software renders it as inert text, never evaluates it. */
export function neutralizeCsvCell(value: string): string {
  if (DANGEROUS_LEADING_CHARS.some((c) => value.startsWith(c))) return `'${value}`;
  return value;
}

function escapeCsvCell(value: string, delimiter: string): string {
  const neutralized = neutralizeCsvCell(value);
  if (neutralized.includes(delimiter) || neutralized.includes('"') || neutralized.includes("\n")) {
    return `"${neutralized.replace(/"/g, '""')}"`;
  }
  return neutralized;
}

export function serializeCsv(headers: string[], rows: string[][], delimiter = ","): string {
  const lines = [headers, ...rows].map((row) => row.map((cell) => escapeCsvCell(String(cell ?? ""), delimiter)).join(delimiter));
  return lines.join("\r\n");
}
