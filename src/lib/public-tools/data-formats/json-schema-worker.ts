/**
 * Dedicated Web Worker for JSON Schema validation — the caller races this
 * against a timeout and calls `worker.terminate()` if it fires first,
 * exactly like `development/regex-worker.ts`, since a circular schema can
 * make the underlying library recurse until a hang/crash inside this
 * worker's own thread (contained here, never the main thread).
 */
import { validateInstance, type JsonSchemaDraft, type AdditionalSchema } from "./json-schema-validator";

export interface JsonSchemaWorkerRequest {
  requestId: number;
  schemaText: string;
  instanceText: string;
  draft: JsonSchemaDraft;
  additionalSchemas: AdditionalSchema[];
}

export interface JsonSchemaWorkerResponse {
  requestId: number;
  result: ReturnType<typeof validateInstance>;
  durationMs: number;
}

self.onmessage = (event: MessageEvent<JsonSchemaWorkerRequest>) => {
  const { requestId, schemaText, instanceText, draft, additionalSchemas } = event.data;
  const startedAt = performance.now();
  const result = validateInstance(schemaText, instanceText, draft, additionalSchemas);
  const response: JsonSchemaWorkerResponse = { requestId, result, durationMs: performance.now() - startedAt };
  (self as unknown as Worker).postMessage(response);
};
