/**
 * SQL formatter core (spec section 17), via `sql-formatter` — a pure
 * tokenizer/formatter that never connects to a database and never
 * executes a query; it only reprints the SQL text. On a genuine parse
 * failure the library throws a multi-thousand-character grammar-internals
 * dump — never shown to the visitor (spec: "no muestres una página de
 * error completa de la dependencia"). Only the "line N column N" the
 * dependency's first message line reliably contains is extracted; the
 * rest is discarded.
 */
import { format as sqlFormat, type FormatOptions } from "sql-formatter";
import { DOCUMENT_LIMITS } from "../documents/limits";

const LIMITS = DOCUMENT_LIMITS.codeFormatting;

export type SqlDialect = "sql" | "postgresql" | "mysql" | "sqlite" | "transactsql";

export const SQL_DIALECTS: { id: SqlDialect; label: string }[] = [
  { id: "sql", label: "SQL estándar" },
  { id: "postgresql", label: "PostgreSQL" },
  { id: "mysql", label: "MySQL" },
  { id: "sqlite", label: "SQLite" },
  { id: "transactsql", label: "SQL Server (T-SQL)" },
];

export type KeywordCase = "preserve" | "upper" | "lower";

export interface SqlFormatOptions {
  dialect: SqlDialect;
  tabWidth: number;
  useTabs: boolean;
  keywordCase: KeywordCase;
}

export interface SqlFormatResult {
  ok: boolean;
  error?: string;
  errorLine?: number | null;
  errorColumn?: number | null;
  formatted?: string;
  statementCount?: number;
}

function countStatements(sql: string): number {
  // A rough, display-only count (splits on top-level semicolons outside of quotes) — never used for execution.
  let count = 0;
  let inSingle = false;
  let inDouble = false;
  let sawContent = false;
  for (const ch of sql) {
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === ";" && !inSingle && !inDouble) {
      if (sawContent) count++;
      sawContent = false;
      continue;
    }
    if (!/\s/.test(ch)) sawContent = true;
  }
  if (sawContent) count++;
  return count;
}

export function formatSql(sql: string, options: SqlFormatOptions): SqlFormatResult {
  if (sql.length > LIMITS.maxSqlLength) {
    return { ok: false, error: `El SQL supera el límite de ${LIMITS.maxSqlLength.toLocaleString("es-ES")} caracteres.` };
  }
  const statementCount = countStatements(sql);
  if (statementCount > LIMITS.maxSqlStatements) {
    return { ok: false, error: `El SQL supera el límite de ${LIMITS.maxSqlStatements} sentencias.` };
  }

  const formatOptions: Partial<FormatOptions> & { language: SqlDialect } = {
    language: options.dialect,
    tabWidth: options.tabWidth,
    useTabs: options.useTabs,
    keywordCase: options.keywordCase,
    identifierCase: "preserve",
    dataTypeCase: "preserve",
    functionCase: "preserve",
  };

  try {
    const formatted = sqlFormat(sql, formatOptions);
    return { ok: true, formatted, statementCount };
  } catch (err) {
    const firstLine = err instanceof Error ? err.message.split("\n")[0] : "";
    const match = /line (\d+) column (\d+)/i.exec(firstLine);
    return {
      ok: false,
      error: match ? `No se pudo formatear: error de sintaxis cerca de la línea ${match[1]}, columna ${match[2]}. Revisa comillas, paréntesis y palabras clave sin cerrar.` : "No se pudo formatear: el SQL contiene un error de sintaxis que impide tokenizarlo.",
      errorLine: match ? Number(match[1]) : null,
      errorColumn: match ? Number(match[2]) : null,
    };
  }
}
