/**
 * Message protocol shared between the main thread and `formatting-worker.ts`
 * — mirrors `development/regex-worker.ts`'s request/response pattern.
 */
import type { SqlDialect, KeywordCase } from "./sql";
import type { WebCodeLanguage } from "./formatter-types";

export type CodeFormattingJob =
  | { kind: "sql"; sql: string; dialect: SqlDialect; tabWidth: number; useTabs: boolean; keywordCase: KeywordCase }
  | { kind: "web-code"; code: string; language: WebCodeLanguage; printWidth: number; useTabs: boolean; tabWidth: number; semi: boolean; singleQuote: boolean };

export interface CodeFormattingWorkerRequest {
  requestId: number;
  job: CodeFormattingJob;
}

export interface CodeFormattingWorkerResponse {
  requestId: number;
  result: unknown;
  durationMs: number;
}
