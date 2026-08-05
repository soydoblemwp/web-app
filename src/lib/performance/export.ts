import { serializeCsv } from "@/lib/performance/csv";

/**
 * Shared export helpers (spec section 42) — used for metrics, comparisons,
 * experiments, recommendations, and reports alike. CSV export always goes
 * through serializeCsv, which already neutralizes formula-injection
 * characters (spec section 12) — never a second, unprotected CSV writer.
 */

export function exportRowsAsCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const dataRows = rows.map((row) => headers.map((h) => (row[h] === null || row[h] === undefined ? "" : String(row[h]))));
  return serializeCsv(headers, dataRows);
}

/** JSON export — strips any key literally named in `excludeKeys` at the top level of each row (e.g. internal IDs, secrets) before serializing (spec section 42: never internal IDs/secrets/other-project data). */
export function exportRowsAsJson(rows: Record<string, unknown>[], excludeKeys: string[] = []): string {
  const cleaned = rows.map((row) => {
    const copy = { ...row };
    for (const key of excludeKeys) delete copy[key];
    return copy;
  });
  return JSON.stringify(cleaned, null, 2);
}
