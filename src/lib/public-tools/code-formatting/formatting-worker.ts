/**
 * Dedicated Web Worker for SQL and HTML/CSS/JS/TS/JSX/TSX formatting.
 * Prettier's plugins are dynamically imported inside `formatWebCode` itself
 * — so nothing loads until a format job actually runs inside this worker,
 * never on the main thread and never at `/herramientas` (spec section 27).
 */
import { formatSql } from "./sql";
import { formatWebCode } from "./web-code";
import type { CodeFormattingWorkerRequest, CodeFormattingWorkerResponse } from "./diagnostics";

async function runJob(job: CodeFormattingWorkerRequest["job"]): Promise<unknown> {
  if (job.kind === "sql") {
    return formatSql(job.sql, { dialect: job.dialect, tabWidth: job.tabWidth, useTabs: job.useTabs, keywordCase: job.keywordCase });
  }
  return formatWebCode(job.code, { language: job.language, printWidth: job.printWidth, useTabs: job.useTabs, tabWidth: job.tabWidth, semi: job.semi, singleQuote: job.singleQuote });
}

self.onmessage = async (event: MessageEvent<CodeFormattingWorkerRequest>) => {
  const { requestId, job } = event.data;
  const startedAt = performance.now();
  let result: unknown;
  try {
    result = await runJob(job);
  } catch (err) {
    result = { ok: false, error: { message: err instanceof Error ? err.message : "Error inesperado al formatear.", line: null, column: null, snippet: null } };
  }
  const response: CodeFormattingWorkerResponse = { requestId, result, durationMs: performance.now() - startedAt };
  (self as unknown as Worker).postMessage(response);
};
