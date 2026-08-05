/**
 * Safe template resolution for Automation Center's input mappings (spec
 * section 18) — e.g. "Crear contenido para {{event.resource.title}}".
 * Deliberately a SEPARATE, small engine from src/lib/ai-templates/engine.ts:
 * that one resolves flat `{{variable}}` names against a user-filled form
 * (no nesting, by design); this one resolves DOTTED paths into a curated,
 * server-built context object (event/resource/static/project). Same safety
 * philosophy — no JS execution, ever — just a different data shape.
 *
 * NEVER exposes: process.env, cookies, session, prototypes, functions, or
 * any property not present in the plain-JSON `context` the caller built.
 */

const VARIABLE_TOKEN_RE = /\{\{\s*([^{}]*?)\s*\}\}/g;
const VALID_PATH_RE = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/;
const DANGEROUS_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);
const MAX_OUTPUT_CHARS = 8000;

export interface TemplateResolution {
  output: string;
  /** Well-formed {{path}} tokens with no value found in the context — surfaced so the editor/preview can flag them, never silently rendered blank without the caller knowing. */
  missing: string[];
  /** Malformed tokens (empty, symbols, spaces) — never treated as a variable. */
  invalidTokens: string[];
}

function escapeForOutput(value: string): string {
  // Templates only ever render into plain text fields (workflow string inputs) — this is defense in depth against a value later being interpolated into HTML somewhere downstream, never itself a security boundary on its own.
  return value.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function safeResolvePath(context: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let cursor: unknown = context;
  for (const part of parts) {
    if (DANGEROUS_SEGMENTS.has(part)) return undefined;
    if (cursor === null || cursor === undefined || typeof cursor !== "object" || Array.isArray(cursor)) return undefined;
    if (!Object.prototype.hasOwnProperty.call(cursor, part)) return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  if (typeof cursor === "function") return undefined;
  return cursor;
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stringifyValue).join(", ");
  if (typeof value === "object") return "";
  return String(value);
}

/**
 * Resolves every `{{dotted.path}}` token in `template` against `context`.
 * `allowedRoots`, when given, restricts which top-level namespaces
 * (`event`, `resource`, `static`, `project`, ...) may be referenced — a
 * registered-variable allowlist, not just "whatever happens to be on the
 * object" (spec section 18: "registro de variables permitidas").
 */
export function resolveAutomationTemplate(template: string, context: Record<string, unknown>, allowedRoots?: string[]): TemplateResolution {
  const missing: string[] = [];
  const invalidTokens: string[] = [];
  let truncated = false;

  const output = template.replace(VARIABLE_TOKEN_RE, (_match, rawPath: string) => {
    const path = rawPath.trim();
    if (!VALID_PATH_RE.test(path)) {
      if (!invalidTokens.includes(path)) invalidTokens.push(path);
      return "";
    }
    const root = path.split(".")[0];
    if (allowedRoots && !allowedRoots.includes(root)) {
      if (!missing.includes(path)) missing.push(path);
      return "";
    }
    const value = safeResolvePath(context, path);
    if (value === undefined) {
      if (!missing.includes(path)) missing.push(path);
      return "";
    }
    return escapeForOutput(stringifyValue(value));
  });

  let finalOutput = output;
  if (finalOutput.length > MAX_OUTPUT_CHARS) {
    finalOutput = finalOutput.slice(0, MAX_OUTPUT_CHARS);
    truncated = true;
  }

  return { output: truncated ? `${finalOutput}…` : finalOutput, missing, invalidTokens };
}

/** Preview-only variable scan — lets the mapping editor show "esta plantilla usa: event.resource.title" before any real resolution happens. */
export function scanTemplateVariables(template: string): { paths: string[]; invalidTokens: string[] } {
  const paths: string[] = [];
  const invalidTokens: string[] = [];
  for (const match of template.matchAll(VARIABLE_TOKEN_RE)) {
    const path = match[1].trim();
    if (VALID_PATH_RE.test(path)) {
      if (!paths.includes(path)) paths.push(path);
    } else if (!invalidTokens.includes(path)) {
      invalidTokens.push(path);
    }
  }
  return { paths, invalidTokens };
}
