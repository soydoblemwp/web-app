/**
 * Pure regex helpers — safe to import from both the main thread (for
 * instant flag validation and the heuristic risk hint) and from the
 * dedicated Web Worker (`regex-worker.ts`) that actually executes a match
 * against user text. Real execution ALWAYS happens inside that worker,
 * never on the main thread (spec section 20: "la expresión debe ejecutarse
 * dentro de un Web Worker. Nunca en el hilo principal").
 */

const SUPPORTED_FLAGS = ["g", "i", "m", "s", "u", "y", "d"] as const;

export function isVFlagSupported(): boolean {
  try {
    new RegExp("", "v");
    return true;
  } catch {
    return false;
  }
}

export interface FlagValidation {
  ok: boolean;
  error?: string;
}

export function validateFlags(flags: string): FlagValidation {
  const seen = new Set<string>();
  const allowed = new Set<string>([...SUPPORTED_FLAGS, ...(isVFlagSupported() ? ["v"] : [])]);
  for (const flag of flags) {
    if (!allowed.has(flag)) return { ok: false, error: `El flag "${flag}" no está soportado en este navegador.` };
    if (seen.has(flag)) return { ok: false, error: `El flag "${flag}" está duplicado.` };
    seen.add(flag);
  }
  if (flags.includes("u") && flags.includes("v")) return { ok: false, error: 'Los flags "u" y "v" no pueden usarse juntos.' };
  return { ok: true };
}

export interface RegexBuildResult {
  ok: boolean;
  regex?: RegExp;
  error?: string;
}

export function buildSafeRegExp(pattern: string, flags: string): RegexBuildResult {
  const flagCheck = validateFlags(flags);
  if (!flagCheck.ok) return { ok: false, error: flagCheck.error };
  try {
    return { ok: true, regex: new RegExp(pattern, flags) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Patrón inválido." };
  }
}

export interface RedosHint {
  reasons: string[];
}

/**
 * A heuristic-only scan for classic catastrophic-backtracking shapes
 * (nested quantifiers, a quantified group containing an alternation with
 * overlapping branches, etc). This can never prove a pattern is safe or
 * unsafe — it only flags textbook danger shapes, and the UI must say so
 * explicitly (spec section 20: "la herramienta no debe afirmar que
 * detecta todas las vulnerabilidades ReDoS").
 */
export function analyzeRedosRisk(pattern: string): RedosHint {
  const reasons: string[] = [];
  if (/\([^)]*[+*][^)]*\)[+*]/.test(pattern)) reasons.push("Contiene un grupo cuantificado que a su vez incluye un cuantificador interno (cuantificadores anidados).");
  if (/\([^()|]*\|[^()]*\)[+*]/.test(pattern)) reasons.push("Contiene una alternancia dentro de un grupo repetido, lo que puede generar muchas rutas de coincidencia superpuestas.");
  if (/(\([^)]+\))\1\+|(\([^)]+\))\2\*/.test(pattern)) reasons.push("Contiene un grupo repetido inmediatamente después de sí mismo.");
  return { reasons };
}

export interface MatchGroup {
  name: string | null;
  value: string | undefined;
  index: number | null;
}

export interface RegexMatchResult {
  fullMatch: string;
  index: number;
  groups: MatchGroup[];
}

export interface ComputeMatchesResult {
  matches: RegexMatchResult[];
  truncated: boolean;
}

/** Runs the match loop with a hard cap on iterations — protects against a global regex that matches the empty string forever, independent of the timeout mechanism (which only guards against slow single-step backtracking). */
export function computeMatches(regex: RegExp, text: string, maxMatches: number): ComputeMatchesResult {
  const matches: RegexMatchResult[] = [];
  if (!regex.global && !regex.sticky) {
    const m = regex.exec(text);
    if (m) matches.push(toMatchResult(m));
    return { matches, truncated: false };
  }

  const cloned = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`);
  let match: RegExpExecArray | null;
  let lastIndex = -1;
  let truncated = false;
  while ((match = cloned.exec(text)) !== null) {
    if (matches.length >= maxMatches) {
      truncated = true;
      break;
    }
    matches.push(toMatchResult(match));
    if (cloned.lastIndex === lastIndex) cloned.lastIndex++; // guard against a zero-length match looping forever
    lastIndex = cloned.lastIndex;
    if (cloned.lastIndex > text.length) break;
  }
  return { matches, truncated };
}

function toMatchResult(match: RegExpExecArray): RegexMatchResult {
  const groups: MatchGroup[] = [];
  for (let i = 1; i < match.length; i++) {
    groups.push({ name: null, value: match[i], index: null });
  }
  if (match.groups) {
    for (const [name, value] of Object.entries(match.groups)) {
      groups.push({ name, value, index: null });
    }
  }
  return { fullMatch: match[0], index: match.index, groups };
}

export function applyReplace(regex: RegExp, text: string, replacement: string): string {
  return text.replace(regex, replacement);
}

export const REGEX_LIMITS = {
  maxPatternLength: 500,
  maxTextLength: 200_000,
  maxMatches: 5000,
  minTimeoutMs: 100,
  maxTimeoutMs: 5000,
  defaultTimeoutMs: 1000,
} as const;
