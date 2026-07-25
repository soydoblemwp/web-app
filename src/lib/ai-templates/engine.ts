/**
 * The AI Templates variable engine: detects `{{variable}}` placeholders in a
 * template's content and renders them against user-supplied values. Pure and
 * dependency-free on purpose (same rationale as src/lib/ai-workspace/blocks.ts)
 * so it can run identically in a server action (to compute the stored
 * `variables` list) and in the browser (live preview while editing/filling a
 * template) without a round-trip.
 *
 * A Template is not a Prompt (see src/lib/prompt-library): a Prompt only
 * ever stores instructions; a Template stores reusable STRUCTURE with
 * placeholders this engine understands.
 */

const VARIABLE_TOKEN_RE = /\{\{\s*([^{}]*?)\s*\}\}/g;
const VALID_VARIABLE_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export interface TemplateVariableAnalysis {
  /** Unique, valid variable names, in first-seen order — what the render form/UI shows as fillable fields. */
  names: string[];
  /** Valid variable names that appear more than once in the content (informational, not an error — reusing a variable is legitimate). */
  duplicates: string[];
  /** Raw `{{...}}` inner text that doesn't match a valid identifier (empty, starts with a digit, contains spaces/symbols, etc.) — these are never treated as fillable variables. */
  invalidTokens: string[];
}

/** Scans a template's content for every `{{...}}` token and classifies each one — the single source of truth for what "a variable" means in this system. */
export function analyzeTemplateVariables(content: string): TemplateVariableAnalysis {
  const names: string[] = [];
  const seenCounts = new Map<string, number>();
  const invalidTokens: string[] = [];

  for (const match of content.matchAll(VARIABLE_TOKEN_RE)) {
    const raw = match[1].trim();

    if (!VALID_VARIABLE_NAME_RE.test(raw)) {
      if (!invalidTokens.includes(raw)) invalidTokens.push(raw);
      continue;
    }

    const count = (seenCounts.get(raw) ?? 0) + 1;
    seenCounts.set(raw, count);
    if (count === 1) names.push(raw);
  }

  const duplicates = names.filter((name) => (seenCounts.get(name) ?? 0) > 1);

  return { names, duplicates, invalidTokens };
}

/** Convenience wrapper for callers that only need the fillable variable names (e.g. what gets stored on the SavedTemplate row). */
export function extractTemplateVariables(content: string): string[] {
  return analyzeTemplateVariables(content).names;
}

export interface RenderTemplateResult {
  output: string;
  /** Valid variables referenced by the template that had no non-empty value supplied — surfaced so the UI can prompt for them instead of silently rendering a blank. */
  missing: string[];
}

/**
 * Replaces every valid `{{variable}}` occurrence with its supplied value.
 * A variable with no value (or an empty/whitespace-only value) is left as
 * its original `{{variable}}` token in the output and reported in
 * `missing`, rather than silently disappearing — the user should always be
 * able to see what's still unresolved. Invalid tokens (see
 * analyzeTemplateVariables) are left untouched in the output; they were
 * never fillable in the first place.
 */
export function renderTemplate(content: string, values: Record<string, string>): RenderTemplateResult {
  const missing = new Set<string>();

  const output = content.replace(VARIABLE_TOKEN_RE, (fullMatch, rawName: string) => {
    const name = rawName.trim();
    if (!VALID_VARIABLE_NAME_RE.test(name)) return fullMatch;

    const value = values[name];
    if (value === undefined || value.trim() === "") {
      missing.add(name);
      return fullMatch;
    }
    return value;
  });

  return { output, missing: Array.from(missing) };
}
