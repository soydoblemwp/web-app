import { resolveFieldValue } from "@/lib/automations/conditions";
import { resolveAutomationTemplate } from "@/lib/automations/template";

/**
 * Input-mapping resolution (spec section 17) — turns trigger/event data,
 * static values, selected resources, and safe templates into the flat
 * `Record<string,string>` a WorkflowRun's `inputVariables` needs. Every
 * transform is a fixed, declared, pure function — never arbitrary code
 * (spec: "no permitas código arbitrario").
 */

export const INPUT_MAPPING_SOURCE_KINDS = ["EVENT_FIELD", "STATIC", "RESOURCE", "TEMPLATE"] as const;
export type InputMappingSourceKind = (typeof INPUT_MAPPING_SOURCE_KINDS)[number];

export const INPUT_MAPPING_TRANSFORMS = ["text_to_text", "number_to_text", "date_to_text", "list_to_text", "select_property"] as const;
export type InputMappingTransform = (typeof INPUT_MAPPING_TRANSFORMS)[number];

export interface InputMappingSpec {
  targetVariable: string;
  sourceKind: InputMappingSourceKind;
  sourceExpression: string;
  transform?: string | null;
  defaultValue?: string | null;
}

export interface MappingContext {
  event?: Record<string, unknown>;
  resource?: Record<string, unknown>;
  static?: Record<string, unknown>;
  project?: Record<string, unknown>;
}

function applyTransform(value: unknown, transform?: string | null): string {
  if (value === null || value === undefined) return "";
  switch (transform) {
    case "number_to_text":
      return typeof value === "number" ? String(value) : String(value ?? "");
    case "date_to_text":
      return value instanceof Date ? value.toISOString() : String(value);
    case "list_to_text":
      return Array.isArray(value) ? value.map(String).join(", ") : String(value);
    case "select_property":
      // The property itself was already selected via sourceExpression's dot-path — this transform is a no-op marker for the UI's "seleccionar propiedad" step.
      return String(value);
    case "text_to_text":
    default:
      if (typeof value === "object") return "";
      return String(value);
  }
}

export interface MappingResolutionResult {
  values: Record<string, string>;
  /** Target variables whose value ended up empty with no default — the caller must refuse to start the run (spec section 17: "no ejecute una automatización si faltan inputs obligatorios"). */
  emptyRequired: string[];
}

/**
 * Resolves every mapping against a fully-built context (RESOURCE-kind
 * mappings expect the caller to have already fetched+ownership-checked the
 * resource into `context.resource` — this function itself never touches a
 * database, staying pure and reusable both server-side and in tests.
 */
export function resolveInputMappings(mappings: InputMappingSpec[], context: MappingContext, requiredVariables: string[]): MappingResolutionResult {
  const values: Record<string, string> = {};

  for (const mapping of mappings) {
    let raw: unknown;
    if (mapping.sourceKind === "STATIC") {
      raw = mapping.sourceExpression;
    } else if (mapping.sourceKind === "EVENT_FIELD") {
      raw = resolveFieldValue(context.event ?? {}, mapping.sourceExpression);
    } else if (mapping.sourceKind === "RESOURCE") {
      raw = resolveFieldValue(context.resource ?? {}, mapping.sourceExpression);
    } else {
      const resolved = resolveAutomationTemplate(mapping.sourceExpression, context as Record<string, unknown>, ["event", "resource", "static", "project"]);
      raw = resolved.output;
    }

    let text = applyTransform(raw, mapping.transform);
    if (!text.trim() && mapping.defaultValue) text = mapping.defaultValue;
    values[mapping.targetVariable] = text;
  }

  const emptyRequired = requiredVariables.filter((name) => !values[name] || !values[name].trim());
  return { values, emptyRequired };
}
