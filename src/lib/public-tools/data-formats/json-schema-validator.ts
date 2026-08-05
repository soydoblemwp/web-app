/**
 * JSON Schema validator core (spec section 19), via `@cfworker/json-schema`
 * — a pure recursive interpreter with zero `eval`/`new Function`/codegen
 * anywhere in its implementation (confirmed by inspecting its source
 * directly before adopting it) and zero network access (no `fetch`/`XHR`
 * anywhere in its source either), so a remote `$ref` can never be resolved
 * even in principle — it always fails with a clean, catchable error rather
 * than attempting a network request. Only announces the 3 drafts actually
 * implemented and exercised by this module's own tests: Draft 7, 2019-09,
 * 2020-12 (the library also technically accepts Draft 4, which is
 * deliberately never exposed as an option here).
 *
 * A schema with a circular self-reference (e.g. `$ref: "#"` inside itself)
 * makes the library recurse until a `RangeError` (stack overflow) — this is
 * a real, reproducible failure mode of the dependency, not something this
 * module can prevent inside the library. It's contained two ways: (1) every
 * call here is wrapped in try/catch that turns a `RangeError` into a clean,
 * specific message rather than an uncaught crash, and (2) the UI always
 * runs validation inside a Worker with a timeout+terminate race (spec
 * section 27), the same pattern already used for the regex tester's
 * catastrophic-backtracking case — so even a hang (not just a clean throw)
 * can't freeze the main thread.
 */
import { Validator } from "@cfworker/json-schema";
import { DOCUMENT_LIMITS } from "../documents/limits";
import { countNodesAndDepth } from "./safe-values";

const LIMITS = DOCUMENT_LIMITS.jsonSchema;

export type JsonSchemaDraft = "7" | "2019-09" | "2020-12";
export const JSON_SCHEMA_DRAFTS: { id: JsonSchemaDraft; label: string }[] = [
  { id: "7", label: "Draft 7" },
  { id: "2019-09", label: "2019-09" },
  { id: "2020-12", label: "2020-12" },
];

export interface JsonSchemaValidationError {
  instanceLocation: string;
  keywordLocation: string;
  keyword: string;
  message: string;
}

export interface AdditionalSchema {
  id: string;
  text: string;
}

export interface JsonSchemaValidationResult {
  ok: boolean; // false = the schema/instance JSON itself is invalid, or the schema graph couldn't be evaluated safely
  error?: string;
  valid?: boolean; // present only when ok: true — did the instance satisfy the schema
  errors?: JsonSchemaValidationError[];
  truncated?: boolean;
}

function parseJson(label: string, text: string, maxLength: number): { ok: true; value: unknown } | { ok: false; error: string } {
  if (text.length > maxLength) return { ok: false, error: `${label} supera el límite de ${maxLength.toLocaleString("es-ES")} caracteres.` };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    return { ok: false, error: `${label} no es JSON válido: ${err instanceof Error ? err.message : "error de análisis"}.` };
  }
}

export function validateInstance(schemaText: string, instanceText: string, draft: JsonSchemaDraft, additionalSchemas: AdditionalSchema[] = []): JsonSchemaValidationResult {
  const schemaParsed = parseJson("El schema", schemaText, LIMITS.maxSchemaLength);
  if (!schemaParsed.ok) return { ok: false, error: schemaParsed.error };
  const instanceParsed = parseJson("La instancia", instanceText, LIMITS.maxInstanceLength);
  if (!instanceParsed.ok) return { ok: false, error: instanceParsed.error };

  const { depthExceeded } = countNodesAndDepth(schemaParsed.value, LIMITS.maxSchemaDepth);
  if (depthExceeded) return { ok: false, error: `El schema supera la profundidad máxima permitida (${LIMITS.maxSchemaDepth}).` };

  try {
    const validator = new Validator(schemaParsed.value as never, draft, false);
    for (const extra of additionalSchemas) {
      const extraParsed = parseJson(`El schema adicional "${extra.id}"`, extra.text, LIMITS.maxSchemaLength);
      if (!extraParsed.ok) return { ok: false, error: extraParsed.error };
      validator.addSchema(extraParsed.value as never, extra.id);
    }

    const result = validator.validate(instanceParsed.value);
    const truncated = result.errors.length > LIMITS.maxErrors;
    const errors: JsonSchemaValidationError[] = result.errors.slice(0, LIMITS.maxErrors).map((e) => ({
      instanceLocation: e.instanceLocation,
      keywordLocation: e.keywordLocation,
      keyword: e.keyword,
      message: e.error,
    }));

    return { ok: true, valid: result.valid, errors, truncated };
  } catch (err) {
    if (err instanceof RangeError) {
      return { ok: false, error: "El schema contiene una referencia circular que provoca recursión excesiva. Por seguridad, esta herramienta no evalúa schemas recursivos sin límite." };
    }
    const message = err instanceof Error ? err.message : "No se pudo validar la instancia contra el schema.";
    if (/Unresolved \$ref/i.test(message)) {
      return { ok: false, error: "El schema hace referencia a un $ref que no se pudo resolver localmente. Los $ref remotos nunca se descargan por seguridad: pega el schema adicional como un schema local para resolverlo." };
    }
    return { ok: false, error: message };
  }
}
