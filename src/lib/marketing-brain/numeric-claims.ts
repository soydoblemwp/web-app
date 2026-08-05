/**
 * Pure, deterministic guard against fabricated numeric outcome claims (Fase
 * 35 spec section 9: never "esta acción aumentará las conversiones un 30%"
 * unless that figure genuinely came from a real goal/benchmark/budget
 * already in the context). This can never fully understand semantics, but
 * it reliably flags any percentage/currency figure in the generated text
 * that does NOT appear among the real numbers the context actually
 * contained — the caller surfaces those as a visible warning rather than
 * silently trusting the AI's arithmetic.
 */

const PERCENT_PATTERN = /(\d+(?:[.,]\d+)?)\s*%/g;
const CURRENCY_PATTERN = /(?:\$|€|£)\s*(\d[\d.,]*)/g;

function extractNumbers(text: string, pattern: RegExp): string[] {
  const found: string[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(pattern);
  while ((match = re.exec(text)) !== null) found.push(match[1]);
  return found;
}

export interface NumericClaimCheckResult {
  suspiciousNumbers: string[];
  hasSuspiciousClaims: boolean;
}

/** `allowedNumbers` should include every real number that appeared in the context sent to the model (goal targets, benchmark values, budget, sample sizes) — anything else showing up as a %/currency figure in the output is flagged. */
export function checkForFabricatedNumericClaims(generatedText: string, allowedNumbers: string[]): NumericClaimCheckResult {
  const allowedSet = new Set(allowedNumbers.map((n) => n.replace(",", ".").trim()));
  const candidates = [...extractNumbers(generatedText, PERCENT_PATTERN), ...extractNumbers(generatedText, CURRENCY_PATTERN)];
  const suspicious = candidates.filter((n) => !allowedSet.has(n.replace(",", ".").trim()));
  return { suspiciousNumbers: [...new Set(suspicious)], hasSuspiciousClaims: suspicious.length > 0 };
}
