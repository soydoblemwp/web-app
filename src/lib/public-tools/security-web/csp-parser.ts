/**
 * Content-Security-Policy parser (spec section 22). Pure string parsing of
 * a policy the visitor pastes — never fetches, never loads, never applies
 * the policy to a real page. Preserves every directive occurrence
 * (including duplicates) so the analyzer can flag them, rather than
 * silently collapsing to the last one like a real browser would.
 */
export interface CspDirectiveOccurrence {
  name: string;
  sources: string[];
  raw: string;
}

export interface ParsedCsp {
  directives: CspDirectiveOccurrence[]; // every occurrence, in order, duplicates included
  byName: Map<string, CspDirectiveOccurrence[]>; // grouped for lookup
  duplicateDirectiveNames: string[];
}

const KNOWN_DIRECTIVES = new Set([
  "default-src",
  "script-src",
  "script-src-elem",
  "script-src-attr",
  "style-src",
  "style-src-elem",
  "style-src-attr",
  "img-src",
  "font-src",
  "connect-src",
  "media-src",
  "worker-src",
  "frame-src",
  "child-src",
  "manifest-src",
  "object-src",
  "base-uri",
  "form-action",
  "frame-ancestors",
  "upgrade-insecure-requests",
  "block-all-mixed-content",
  "require-trusted-types-for",
  "trusted-types",
  "report-to",
  "report-uri",
  "sandbox",
]);

export function isKnownCspDirective(name: string): boolean {
  return KNOWN_DIRECTIVES.has(name.toLowerCase());
}

export function parseCsp(policyText: string): ParsedCsp {
  const directives: CspDirectiveOccurrence[] = [];
  const byName = new Map<string, CspDirectiveOccurrence[]>();
  const seenNames = new Set<string>();
  const duplicateDirectiveNames: string[] = [];

  for (const rawDirective of policyText.split(";")) {
    const trimmed = rawDirective.trim();
    if (trimmed.length === 0) continue;
    const tokens = trimmed.split(/\s+/);
    const name = tokens[0].toLowerCase();
    const sources = tokens.slice(1);
    const occurrence: CspDirectiveOccurrence = { name, sources, raw: trimmed };
    directives.push(occurrence);
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name)!.push(occurrence);
    if (seenNames.has(name)) duplicateDirectiveNames.push(name);
    seenNames.add(name);
  }

  return { directives, byName, duplicateDirectiveNames: Array.from(new Set(duplicateDirectiveNames)) };
}
