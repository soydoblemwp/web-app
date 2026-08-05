/**
 * Message protocol shared between the main thread and `data-formats-worker.ts`
 * — mirrors the existing `development/regex-worker.ts` pattern (job/request
 * ID matching, so a stale response after cancellation is ignored).
 */
import type { YamlToJsonOptions } from "./yaml";
import type { TomlToJsonOptions } from "./toml";

export type DataFormatsJob =
  | { kind: "yaml-to-json"; text: string; options: YamlToJsonOptions }
  | { kind: "json-to-yaml"; value: unknown; indent: number }
  | { kind: "format-yaml"; text: string; indent: number }
  | { kind: "validate-xml"; text: string }
  | { kind: "format-xml"; text: string; indentBy: string }
  | { kind: "minify-xml"; text: string }
  | { kind: "xml-to-json"; text: string }
  | { kind: "json-to-xml"; value: unknown; rootName?: string; indentBy: string }
  | { kind: "toml-to-json"; text: string; options: TomlToJsonOptions }
  | { kind: "json-to-toml"; value: unknown }
  | { kind: "format-toml"; text: string };

export interface DataFormatsWorkerRequest {
  requestId: number;
  job: DataFormatsJob;
}

export interface DataFormatsWorkerResponse {
  requestId: number;
  result: unknown;
  durationMs: number;
}
