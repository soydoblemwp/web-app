/**
 * CSP generator (spec section 22). Every source is exactly what the
 * visitor typed for that directive — this module never adds
 * `'unsafe-inline'`/`'unsafe-eval'`/a wildcard automatically. Output modes
 * cover the concrete formats the spec names; each is real, parseable
 * syntax for its target, not a generic placeholder.
 */
import { DOCUMENT_LIMITS } from "../documents/limits";

const LIMITS = DOCUMENT_LIMITS.csp;

export const CSP_FETCH_DIRECTIVES = ["default-src", "script-src", "style-src", "img-src", "font-src", "connect-src", "media-src", "worker-src", "frame-src", "child-src", "manifest-src", "object-src"] as const;
export const CSP_OTHER_DIRECTIVES = ["base-uri", "form-action", "frame-ancestors", "report-to", "report-uri"] as const;
export const CSP_BOOLEAN_DIRECTIVES = ["upgrade-insecure-requests", "block-all-mixed-content"] as const;
export const CSP_TRUSTED_TYPES_DIRECTIVES = ["require-trusted-types-for", "trusted-types"] as const;

export type CspDirectiveConfig = Record<string, string[]>;

export interface CspGeneratorInput {
  directives: CspDirectiveConfig; // directive name -> list of raw source tokens, as typed
  booleanDirectives: string[]; // e.g. ["upgrade-insecure-requests"]
}

export interface CspBuildResult {
  ok: boolean;
  error?: string;
  policyText?: string;
}

export function buildCspPolicyText(input: CspGeneratorInput): CspBuildResult {
  const directiveNames = Object.keys(input.directives);
  if (directiveNames.length + input.booleanDirectives.length > LIMITS.maxDirectives) {
    return { ok: false, error: `La política supera el límite de ${LIMITS.maxDirectives} directivas.` };
  }
  const parts: string[] = [];
  for (const name of directiveNames) {
    const sources = input.directives[name].filter((s) => s.trim().length > 0);
    if (sources.length === 0) continue;
    if (sources.length > LIMITS.maxSourcesPerDirective) {
      return { ok: false, error: `La directiva "${name}" supera el límite de ${LIMITS.maxSourcesPerDirective} fuentes.` };
    }
    parts.push(`${name} ${sources.join(" ")}`);
  }
  for (const name of input.booleanDirectives) {
    parts.push(name);
  }
  if (parts.length === 0) return { ok: false, error: "Añade al menos una directiva con una fuente." };
  return { ok: true, policyText: parts.join("; ") + ";" };
}

export function buildEnforcementHeader(policyText: string): string {
  return `Content-Security-Policy: ${policyText}`;
}

export function buildReportOnlyHeader(policyText: string): string {
  return `Content-Security-Policy-Report-Only: ${policyText}`;
}

/** Only directives valid in a `<meta http-equiv="Content-Security-Policy">` tag — `frame-ancestors`, `report-uri`/`report-to`, and sandbox are ignored by browsers in a meta tag, so this filters them out and notes the omission rather than emitting a silently-ignored meta tag. */
export function buildMetaTag(policyText: string): { html: string; omittedDirectives: string[] } {
  const metaIncompatible = new Set(["frame-ancestors", "report-uri", "report-to", "sandbox"]);
  const parts = policyText.replace(/;\s*$/, "").split(";").map((p) => p.trim()).filter(Boolean);
  const omittedDirectives: string[] = [];
  const kept = parts.filter((p) => {
    const name = p.split(/\s+/)[0].toLowerCase();
    if (metaIncompatible.has(name)) {
      omittedDirectives.push(name);
      return false;
    }
    return true;
  });
  const escaped = kept.join("; ").replace(/"/g, "&quot;");
  return { html: `<meta http-equiv="Content-Security-Policy" content="${escaped}">`, omittedDirectives };
}

export function buildNextJsSnippet(policyText: string, reportOnly: boolean): string {
  const headerName = reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
  const escaped = policyText.replace(/`/g, "\\`");
  return `// next.config.ts — ejemplo de configuración manual; adapta las fuentes a tu proyecto real.
const cspHeader = \`${escaped}\`;

export default {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "${headerName}", value: cspHeader.replace(/\\n/g, "") }],
      },
    ];
  },
};`;
}
