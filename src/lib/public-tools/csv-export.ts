/**
 * Escapes a single CSV cell safely: always quotes, doubles internal quotes,
 * and — to block CSV-injection ("formula injection") when the file is later
 * opened in Excel/Sheets — prefixes a leading `=`, `+`, `-`, `@`, tab, or CR
 * with a single quote so spreadsheet software never interprets the cell as a
 * formula.
 */
export function toSafeCsvCell(value: string): string {
  const needsFormulaGuard = /^[=+\-@\t\r]/.test(value);
  const guarded = needsFormulaGuard ? `'${value}` : value;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export function buildCsv(headers: string[], rows: string[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(toSafeCsvCell).join(","));
  return lines.join("\r\n");
}

export function downloadTextFile(filename: string, content: string, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
