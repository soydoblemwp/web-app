/**
 * Dedicated Web Worker for YAML/XML/TOML parsing and formatting — offloads
 * potentially large (up to ~2MB) text processing off the main thread,
 * mirroring `development/regex-worker.ts`'s request/response pattern. Every
 * operation here is synchronous and bounded by the limits already enforced
 * inside each core module; this worker adds no new logic of its own.
 */
import { yamlToJson, jsonToYaml, formatYaml } from "./yaml";
import { validateXml, formatXml, minifyXml } from "./xml";
import { xmlToJson, jsonToXml } from "./xml-json";
import { tomlToJson, jsonToToml, formatToml } from "./toml";
import type { DataFormatsWorkerRequest, DataFormatsWorkerResponse } from "./worker-protocol";

function runJob(job: DataFormatsWorkerRequest["job"]): unknown {
  switch (job.kind) {
    case "yaml-to-json":
      return yamlToJson(job.text, job.options);
    case "json-to-yaml":
      return jsonToYaml(job.value, { indent: job.indent });
    case "format-yaml":
      return formatYaml(job.text, job.indent);
    case "validate-xml":
      return validateXml(job.text);
    case "format-xml":
      return formatXml(job.text, job.indentBy);
    case "minify-xml":
      return minifyXml(job.text);
    case "xml-to-json":
      return xmlToJson(job.text);
    case "json-to-xml":
      return jsonToXml(job.value, job.rootName, job.indentBy);
    case "toml-to-json":
      return tomlToJson(job.text, job.options);
    case "json-to-toml":
      return jsonToToml(job.value);
    case "format-toml":
      return formatToml(job.text);
  }
}

self.onmessage = (event: MessageEvent<DataFormatsWorkerRequest>) => {
  const { requestId, job } = event.data;
  const startedAt = performance.now();
  let result: unknown;
  try {
    result = runJob(job);
  } catch (err) {
    result = { ok: false, error: { message: err instanceof Error ? err.message : "Error inesperado al procesar el documento.", line: null, column: null, snippet: null } };
  }
  const response: DataFormatsWorkerResponse = { requestId, result, durationMs: performance.now() - startedAt };
  (self as unknown as Worker).postMessage(response);
};
